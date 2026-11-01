# Affinity MCP server — findings

Observations gathered while building an agent skill, a stdio↔SSE bridge, and running a load test
against the Affinity MCP server. Everything below was **verified by observation**; anything
inferred is marked as such. Suggestions are ordered by impact on server quality.

**Environment:** Affinity 3.3.1 (CFBundleVersion 4940) on macOS. MCP implementation is
`/Applications/Affinity.app/Contents/Frameworks/liblibmcp.dylib`. Server enabled via
`EnableMCPServer => true` in `~/Library/Preferences/com.canva.affinity.plist`.

**How gathered:** 60+ MCP tool calls through a stdio↔SSE bridge, a phased load test (301-node
document, 150-circle boolean union, concurrent request batches), and static analysis of
`liblibmcp.dylib` (7,914 strings → 2,568 unique → ~137 human-readable).

---

## Summary of recommendations

| # | Priority | Area | Finding | Suggested change | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | **P0** | Errors | Error payloads are inconsistent: bare sentences, trailing colons, no codes | Return structured `{ code, message, data }` with context | Fixed (partial) |
| 2 | **P0** | Rendering | `render_*` hard-caps output at 1024 px, no format/size control | Add `format` (PNG/JPEG) and `max_dimension`, or region crop | Open (Canva) |
| 3 | **P1** | Tool surface | No way to list or close open documents | Add `list_documents` / `close_document` | Open (Canva) |
| 4 | **P1** | Tool surface | `render_spread` requires a `sessionUuid` only obtainable via script | Accept `"current"` or add `list_documents` | Open (Canva) |
| 5 | **P1** | Tool surface | Undo/redo and history inspection are script-only | Add `undo` / `redo` / `history` tools | Open (Canva) |
| 6 | **P1** | Rendering | `render_selection` renders an **empty image** when nodes span the spread | Render the selection's bounding box, or error explicitly | Open (Canva) |
| 7 | **P1** | Output shape | `list_sdk_documentation` returns a comma-separated string | Return a JSON array (structured content) | Open (Canva) |
| 8 | **P1** | Output shape | `search_sdk_hints` returns an empty **string** on no match | Return `{ hints: [] }` (structured empty result) | Open (Canva) |
| 9 | **P1** | SDK | `PolyCurveNode` has no `curves` setter (definition only) | Add parity so nodes can be re-shaped in place | Open (Canva) |
| 10 | **P1** | SDK | `doc.addNode()` returns `undefined`; commands return nothing | Return created/modified nodes | Open (Canva) |
| 11 | **P1** | SDK | Descriptors required where plain values are natural (raw `LineStyle` throws) | Auto-wrap, as already done for `Colour` | Open (Canva) |
| 12 | **P1** | SDK | `PolyCurveNodeDefinition.create` crashes on `null` optional args | Tolerate `null`/`undefined` | Open (Canva) |
| 13 | **P2** | SDK | `history.undoDescription` throws `INVALID_OP` when history is empty | Return `null`/`""` | Documented |
| 14 | **P2** | SDK | `Document.all` is a plain Array, not a Collection | Align with `Collection` or document it | Documented |
| 15 | **P2** | SDK | `Document.current` returns a new wrapper each access | Stable wrapper, or document identity caveat | Documented |
| 16 | **P2** | SDK | No `Document.close()` | Add it | Documented |
| 17 | **P2** | Performance | Per-node `addNode` is ~50× slower than one bulk command | Add `addNodes([...])`, or document the bulk path | Documented |
| 18 | **P2** | Errors | Transient `authorization channel closed` on render | Retry internally, or document as retryable | Fixed |
| 19 | **P2** | Protocol | `Unsupported protocol version` doesn't list supported versions | Include the accepted version(s) | Open (Canva) |
| 20 | **P3** | Preamble gate | Hard failure with no actionable hint | Structured error naming the fix, or auto-read | Open (Canva) |
| 21 | **P3** | Protocol | `heartbeat` SSE event is undocumented | Document interval; state that unknown events must be ignored | Fixed |
| 22 | **P3** | Protocol | `resources/subscribe` and `resources/templates/list` undocumented | Document or remove | Open (Canva) |
| 23 | **P3** | Permissions | `PERMISSION_DENIED` doesn't name the setting to change | Include the setting name | Open (Canva) |

**Status counts:** 2 Fixed · 1 Fixed (partial) · 5 Documented · 15 Open (Canva) — 23 total. See
*Implementation status* below for what each means and what has already landed in this repo.

---

## 1. Protocol & transport

**Verified from `liblibmcp.dylib`:**

- **Exactly one protocol version: `2025-11-25`** (2 occurrences). No `2025-06-18`, `2025-03-26`,
  `2024-11-05` or `2024-10-07` strings exist. Version negotiation is enforced
  (`Unsupported protocol version`, `Missing or invalid protocolVersion parameter`,
  `Client requested protocol version:`).
- **Transport is legacy SSE:** path `/sse`, events `endpoint`, `message`, **`heartbeat`**, session
  keyed by `session_id`. Content types present: `text/event-stream` **and** `application/json`.
- **Methods implemented:** `initialize`, `notifications/initialized`, `ping`, `tools/list`,
  `tools/call`, `resources/list`, `resources/read`, `resources/subscribe`,
  `resources/templates/list`.
- **No `prompts/*`, `sampling/*`, `completion/*` or `logging/*`.** Capabilities are therefore
  tools + resources only.
- **The server retries SSE connections itself** (`Maximum retry count reached, stopping SSE
  connection attempts`, `SSE connection actively closed during retry wait`), so retry logic exists
  on both sides of the wire — worth documenting so clients don't duplicate it blindly.
- The library can also **spawn stdio MCP clients as subprocesses** (`Creating MCP stdio client for
  command:`, `Failed to fork process:`), i.e. it is a hub, not only a server.

**Recommendations**

- Since `application/json` is compiled in, confirm whether the POST endpoint may return the
  JSON-RPC response in the body (Streamable-HTTP style) or only over SSE. Clients that assume
  SSE-only will silently drop such responses. **Document which one it is.**
- Document the `heartbeat` event and its interval; state explicitly that clients must ignore unknown
  event types (our bridge does, and it works).
- `Unsupported protocol version:` should include the accepted version(s) — clients currently have to
  brute-force it.

## 2. Tool surface gaps

The 11 tools are all script/document oriented. Notable **missing** capabilities, each currently
requiring `execute_script`:

| Need | Current workaround |
| --- | --- |
| Discover open documents | `Document.all` in a script (an Array, not a Collection) |
| Close a document | **Impossible** — no SDK `close()` and no tool |
| Save / export to a path | SDK `doc.export(...)`, blocked here by `fs.js` permissions |
| Undo / redo | `doc.undo()` / `doc.redo()` in a script |
| Inspect history | `doc.history` in a script |
| Get `sessionUuid` for `render_*` | Run a script first, then copy the value |

Adding `list_documents` would remove the `sessionUuid` chicken-and-egg problem for `render_spread`
and `render_selection`; it is the single highest-value tool addition.

## 3. Error handling

Observed inconsistencies:

| Situation | Actual response |
| --- | --- |
| Bad document uuid | `No document with that Uuid exists.` (bare sentence) |
| Spread index out of range | `Spread index out of bounds.` (no index, no doc, no range) |
| Script throws | `Error: <message>` + stack (good, but unstructured) |
| Preamble not read | `ERROR: The preamble documentation topic has not yet been read.` |
| Internal failures | Strings ending in a colon: `Method not found:`, `Internal error:`, `Invalid JSON arguments:` |
| Render, transient | `authorization channel closed` (no code, no retry hint) |

Recommendations:

- Use JSON-RPC error objects with a stable `code`, and put context in `data`
  (e.g. `{ code: -32602, message: "Spread index out of bounds", data: { spreadIndex: 7, spreadCount: 1, sessionUuid: "…" } }`).
- Drop trailing colons; they read like truncated logs.
- Make `authorization channel closed` either deterministic or self-retried server-side, and give it a
  code so clients can distinguish transient from permanent failures.
- For the preamble gate, return a structured error that names the fix
  (`call read_sdk_documentation_topic("preamble") first`) — or auto-satisfy it.

## 4. Output shape

Two tools return human text where structured data is expected:

- **`list_sdk_documentation`** → one comma-separated string
  (`application.js, artboardinterface.js, …`). Clients must split on `", "`, which breaks if a name
  ever contains a comma. Return a JSON array.
- **`search_sdk_hints`** → an **empty string** when nothing matches, which is indistinguishable from
  a broken/empty response. Return `{ hints: [] }`.

`render_*` returning base64 JPEG is reasonable, but the payload has no metadata (width, height,
scale, document uuid), so clients can't verify what they got. Consider `{ image: base64, mimeType,
width, height, sessionUuid, spreadIndex }`.

## 5. Rendering

- **Hard 1024 px cap** on the longest dimension. For detail work (verifying a 5 px stroke, checking a
  tooth's shape) this forces guesswork. Add `max_dimension`, or a region/crop parameter, and a format
  choice (PNG for line art would be far smaller and crisper than JPEG).
- **`render_selection` returns an empty checkerboard** when the selected nodes span nearly the whole
  spread — verified by selecting two arms on opposite sides of a 600 × 480 doc. It appears to render
  the full spread rather than the selection's bounding box. Either render the selection's bounds
  (with a sensible minimum), or return an explicit error explaining why.
- `render_spread`'s `spread_index` is 0-based; the error message for out-of-range should say so.

## 6. SDK ergonomics (surfaced through the MCP server)

These cost real time during development; each is a small fix on the SDK side that would improve the
server's usability:

1. **`doc.addNode(def)` returns `undefined`.** The only way to obtain the created node is
   `doc.selection.nodes.toArray()[0]` — fragile, because any intermediate selection change breaks it.
2. **Raw `LineStyle` is rejected** by `ShapeNodeDefinition.create` / `PolyCurveNodeDefinition.create`
   (`expected parameter lineStyleDescriptor to be LineStyleDescriptorHandle`), while bare `Colour` is
   auto-wrapped. Inconsistent; auto-wrap `LineStyle` → `LineStyleDescriptor` too.
3. **`PolyCurveNodeDefinition.create` dereferences `.handle` on all five args**, so a `null`
   transparency fill throws instead of defaulting to "none".
4. **`PolyCurveNode` has no `curves` setter** (only the definition does), so re-shaping a node
   requires delete + re-add, which changes z-order.
5. **`doc.history.undoDescription` throws `INVALID_OP`** when the history is empty; `position` is
   safe. Should return `null`.
6. **`Document.all` is a plain Array** (no `.toArray()`), unlike every other collection in the SDK.
7. **`Document.current` returns a fresh wrapper per access**, so `Document.all[i] === Document.current`
   is `false` for the same document. Compare by `sessionUuid`.
8. **No `Document.close()`** — test documents accumulate and can only be closed by hand.
9. **Commands return nothing** (`boolOpUnion`, `applyTransform`, …), even though the result node is
   well-defined and immediately selected.
10. **`history.position` can read stale inside a large undo batch** — after 56 `doc.undo()` calls in
    one script it still reported 56, while the undos had applied (a redo round trip restored the
    document exactly). Batches of 20 reported correctly.

## 7. Performance

Load test on an 800 × 600 px document at 96 dpi, through the bridge
(MCP request → stdin → SSE → Affinity SDK → SSE → stdout → client).

| Phase | Workload | Time | Result |
| --- | --- | --- | --- |
| 1 | Create document | 255 ms | ok |
| 1 | **250 nodes via one `AddChildNodesCommandBuilder` command** | **4 ms** | all created |
| 1 | **50 nodes via per-node `doc.addNode`** | **93 ms (~1.9 ms each)** | ok |
| 2 | Select all 300 nodes | 2 ms | ok |
| 2 | Recolour 300 nodes | 24 ms | ok |
| 2 | Transform 300 nodes | 2 ms | ok |
| 3 | Add 150 overlapping circles | 20 ms | ok |
| 3 | Boolean union of 150 circles | 198 ms | one `PolyCurveNode`, 2 curves (outer + hole) |
| 3 | Render 301-node spread | — | correct image |
| 4 | 6 concurrent `execute_script` calls | — | distinct results A–F, no cross-talk |
| 5 | 4 concurrent errors + 2 successes | — | errors isolated, bridge stayed alive |
| 6 | Undo 56 / redo 56 | 200 ms / 1598 ms | 301 nodes restored exactly |
| 6 | Undo 20 / redo 20 | 220 ms / 41 ms | positions 56 → 36 → 56 |
| 7 | Delete 301 nodes | 149 ms | 0 nodes, selection cleared |

**Findings**

- The **~50× gap** between bulk and per-node creation is the headline. Either expose a bulk
  `addNodes([...])` helper (the command builder already exists) or make `addNode` batch internally when
  called repeatedly.
- **Concurrency is safe.** Six simultaneous `execute_script` calls returned correctly routed results —
  JSON-RPC ids stayed matched and a failing script never disturbed its neighbours, including in mixed
  success/error batches.
- **Undo costs ~11 ms/step vs ~2 ms for redo**, consistent with undo re-executing the inverse of
  heavier commands.
- **`history.position` can read stale** in large undo batches (see §6, item 10) — assert on node counts
  instead.
- **Cleanup is cheap**: `selectAll` + `deleteSelection` removed 301 nodes in 149 ms. There is no SDK
  call to close a document, so test documents must be closed by hand.

## 8. Permissions

Permission state is **user-controlled and changes between sessions**, so findings below are about the
*mechanism*, not a fixed configuration. State observed on 2026-11-01 (after enabling both toggles):

| Capability | State | Boundary / effect |
| --- | --- | --- |
| Filesystem (`fs.js`) | **Disabled** | `PERMISSION_DENIED`; when enabled it is Desktop-only |
| Network (`network.js`) | **Disabled** | `PERMISSION_DENIED` |
| Export to Desktop | **Disabled** | Depends on filesystem access |
| `eval` / `new Function` | **Disabled** | `allowCodeGenerationFromStrings === false` |
| Reading script library | **Disabled** | Reports it clearly |
| Saving to script library | **Disabled** | Reports it clearly |
| Recording hints | **Disabled** | Reports it clearly |

Findings:

- `PERMISSION_DENIED` gives no hint about *which* toggle is off or what the permitted boundary is.
  Include the setting name and the allowed root (e.g. "filesystem access is limited to ~/Desktop").
- The **Desktop-only boundary is enforced**, not advisory: writes to `/tmp` and the project directory
  are rejected. Worth stating explicitly in the error rather than leaving it to be discovered.
- When filesystem access is **off**, `render_*` is the only verification channel — which makes the
  1024 px cap and the empty `render_selection` result disproportionately painful. When it is **on**,
  `doc.export` bypasses both, so the render limits matter less.
- The `network.js` wrapper has no request-body setter and `RequestMethod` supports only `Get`/`Post`,
  which limits POST-based flows.
- Four features can be disabled individually and report it clearly (good): adding hints, reading
  library scripts, saving to the library, reporting SDK issues.

## 9. Open questions (not verified)

Nothing below is assumed anywhere else in this report; each is an unknown that needs measuring.

| # | Question | Status | How to verify |
| --- | --- | --- | --- |
| Q1 | Does the POST endpoint ever return a JSON-RPC body, or is SSE the only response path? | **Verify** | The bridge already forwards `application/json` bodies — watch for one in practice, or probe with a raw POST |
| Q2 | What is the heartbeat interval, and are client acknowledgements required? | **Verify** | Log `event: heartbeat` timestamps over a long session |
| Q3 | Are `resources/subscribe` and `resources/templates/list` functional? | **Verify** | Call `resources/list`, then `resources/subscribe` on a returned URI |
| Q4 | Does the server's own SSE retry recover a session after an Affinity restart, or is a new `initialize` required? | **Verify** | Restart Affinity mid-session and check whether a tool call still works |
| Q5 | Is there a limit on script size or response size? | **Verify** | Send an oversized `execute_script`, and a request returning a large payload |

## 10. Bridge-side notes (client, not server)

Kept separate because these are improvements to the stdio↔SSE bridge, not the server.

- **Implemented:** reconnect with backoff, endpoint-discovery timeout, stale-endpoint (404/410)
  retry, non-fatal request errors, flush-then-exit shutdown, JSON-RPC POST-body forwarding, queued
  stdout writes with backpressure, `EPIPE` handling, per-request timeouts, a single retry for
  read-only tools on transient channel errors, and opt-in debug logging
  (`AFFINITY_BRIDGE_DEBUG=1`).
- **Design constraint:** retries are limited to read-only tools (`render_*`, `*_documentation*`,
  `search_sdk_hints`, `*_library_script*`) so a re-send can never duplicate a mutation such as
  `execute_script`.
- **Verified:** the reconnect loop against an unreachable port
  (`250 → 500 → 1000 → 2000 → 4000 → 5000` ms), and startup reconnect in practice — the bridge was
  started while Affinity was closed and the first tool call succeeded once it came up.
- **Covered by tests:** the paths a live server cannot easily produce — mid-session reconnect, the
  endpoint-discovery timeout, the 404/410 stale-endpoint retry, request timeouts, the transient-error
  retry, POST-body responses, concurrency, large payloads and clean exit — are exercised by the
  fake-server suite in `tests/` (`node --test tests/*.test.mjs`, 18 cases).

## 11. Skill improvements (`SKILL.md`)

The skill already absorbed several lessons from this session (node insertion returns nothing, the
`LineStyleDescriptor` requirement, all-five-args for poly-curves, insertion-order z-order, the missing
`curves` setter, stroke weight units, the empty `render_selection` result, the transient
`authorization channel closed` error, in-place clear-and-redraw, and the curve/capsule maths).
What follows is what is **still missing**, and how the document could be restructured.

### A. Content gaps

| Topic | Where it belongs | Why it cost time |
| --- | --- | --- |
| `Document.all` is a plain **Array** (no `.toArray()`); `Document.current` returns a **new wrapper** each access, so `===` never matches — compare by `sessionUuid`; several documents can be open at once | Object model | A script threw `toArray is not a function` and an identity check silently misled |
| **No `Document.close()`** exists | Gotchas | Test documents accumulate with no way to remove them; agents should be told to avoid creating strays |
| `doc.history.undoDescription` throws **`INVALID_OP`** when history is empty; `position` is safe; undo ≈ 11 ms/step vs redo ≈ 2 ms; `position` can read **stale** inside large undo batches | New "History and undo" section | A verification script died on a harmless property read, and a 56-step batch reported a wrong position |
| Bulk creation via one `AddChildNodesCommandBuilder` command is **~50× faster** than per-node `doc.addNode` (250 nodes: 4 ms vs 1.9 ms each) | Commands / performance note | The first draft used per-node adds and was needlessly slow |
| Tool output formats: `list_sdk_documentation` returns a **comma-separated string**; `search_sdk_hints` returns an **empty string** when nothing matches | Tool map | Naive parsing of the doc list, and mistaking an empty hint result for a failure |
| `render_*` is capped at **1024 px** on the longest side, with no format or size parameter, and `render_spread` needs a `sessionUuid` that only a script can reveal | Verification loop | Detail checks were impossible at full fidelity; every render needed a prior script run |
| Error catalogue: preamble-not-read, `INVALID_OP`, `authorization channel closed`, `PERMISSION_DENIED`, `Spread index out of bounds.`, `No document with that Uuid exists.` | New "Error catalogue" section | Each needed rediscovery; several look like script bugs but are SDK/tool behaviour |
| Transport facts for connectivity debugging: protocol `2025-11-25`, legacy SSE at `/sse` with `endpoint` / `message` / **`heartbeat`** events, and the possibility of a stdio↔SSE bridge in front | New "Transport" section | Diagnosing connection problems was guesswork |
| How to re-check the protocol version after an Affinity update | "SDK sources" | The version lives only in `liblibmcp.dylib`; one `grep` answers it |

### B. Structural changes

- **Split the Gotchas section.** It is now ~25 bullets across documents, nodes, rendering, history and
transport. Grouping them (e.g. "Documents", "Node definitions", "Rendering", "History", "Errors")
would make them findable instead of a wall.
- **Add a "which tool for what" decision table** near the top: script for mutations, `render_spread`
for whole-spread checks, `render_selection` for a single node, doc tools for reference. This session
repeatedly needed that mapping.
- **State the "don't create stray documents" rule explicitly** — since there is no close API, prefer
editing the current document (clear and redraw) over `Document.create`, and say so when a new document
is unavoidable.
- **Add a one-page quick reference** (create doc → draw → select → fill → render → clear) so the first
script of a session does not require reading five sections.
- **Document the two-tier workflow**: `addNode` for one-offs, the command builder for batches — with the
measured numbers, since the difference is two orders of magnitude in practice.

### C. Hint hygiene (preamble bloat)

The preamble now carries four multi-sentence hints (~2.5k characters) delivered to **every** session
before any other doc. That is a real context cost, and it grows monotonically.

- Skill-side: instruct agents to keep hints to **one or two sentences, one fact each**, and to put
explanatory detail in `SKILL.md` rather than in the hint pool.
- Server-side: consider capping hint length and count, or summarising older hints — the current
behaviour makes the mandatory first read progressively more expensive.

### D. Session lessons → concrete edits

| What happened | Edit to `SKILL.md` |
| --- | --- |
| `Document.all.toArray()` threw | Add the Array/Collection discrepancy to the object model |
| Identity comparison of documents silently failed | Document the `sessionUuid` comparison rule |
| A verification script died on `undoDescription` | Add the `INVALID_OP` case and the safe property |
| 250 nodes took 4 ms in bulk vs 1.9 ms each per-node | Add measured bulk-vs-per-node guidance |
| `render_selection` returned a blank checkerboard | Already added — keep, and note the single-node rule |
| `search_sdk_hints` returned `""` | Note that an empty string means "no matches", not an error |
| `list_sdk_documentation` returned a comma string | Note the format so it is not parsed as JSON |
| Detail work was impossible at 1024 px | Document the render cap and the single-node workaround |
| A stray test document could not be closed | Add the no-close-API rule |

---

## Implementation status

**Legend.** `Fixed` — resolved in this repo (bridge, skill or docs). `Fixed (partial)` — partly mitigated
here, server half still open. `Documented` — cannot be changed here; `SKILL.md` records the behaviour and
workaround. `Open (Canva)` — needs a change inside Affinity (`liblibmcp.dylib` / SDK). `Verify` —
unverified assumption (§9).

Per-finding status is the **Status** column of the summary table at the top of this report.

Most recommendations require a change **inside Affinity**: `liblibmcp.dylib` is a signed component of
the app bundle and cannot be modified from this repo.

### Work landed in this repo

No upstream dependency — all of the following is implemented and tested here.

| Item | Where | Status |
| --- | --- | --- |
| Reconnect with exponential backoff (250 ms → 5 s), fast retry after a good connection | `bin/affinity-bridge.mjs` | Done |
| Endpoint-discovery timeout (configurable, default 10 s) | `bin/affinity-bridge.mjs` | Done |
| Stale-endpoint (404/410) recovery with one retry | `bin/affinity-bridge.mjs` | Done |
| Per-request timeout → `-32001` instead of hanging (finding 3) | `bin/affinity-bridge.mjs` | Done |
| Transient render-error retry, read-only tools only (finding 18) | `bin/affinity-bridge.mjs` | Done |
| Structured `{ code, message }` on bridge-generated errors (finding 1, partial) | `bin/affinity-bridge.mjs` | Done |
| JSON-RPC POST-body forwarding (open question Q1) | `bin/affinity-bridge.mjs` | Done |
| Queued stdout writes with backpressure; `EPIPE` as clean exit | `bin/affinity-bridge.mjs` | Done |
| Flush-then-exit shutdown (1.5 s grace) | `bin/affinity-bridge.mjs` | Done |
| Unknown SSE events ignored, `heartbeat` documented (finding 21) | `bin/affinity-bridge.mjs` + `SKILL.md` § Transport | Done |
| Protocol-version translation (`initialize` request and response) | `bin/affinity-bridge.mjs` | Done |
| Fake-SSE integration tests, 18 cases, all passing | `tests/` | Done |
| Live smoke-test checklist, 14 steps | `bin/SMOKE_TESTS.md` | Done |
| Skill: document identity, history semantics, bulk perf, output formats, render cap, error catalogue, transport facts, hint hygiene | `.agents/skills/affinity-mcp/SKILL.md` | Done |

### Requires Canva (server / SDK) — not fixable from here

- Tools: `list_documents`, `close_document`, `undo`/`redo`/`history`.
- Rendering: `format` + `max_dimension`, selection-bounds rendering for `render_selection`.
- Output shape: JSON array for `list_sdk_documentation`, `{ hints: [] }` for `search_sdk_hints`,
  metadata (width/height/mimeType/sessionUuid) alongside base64 images.
- SDK: `PolyCurveNode.curves` setter, `addNode` returning the created node, `LineStyle` auto-wrap,
  `null`-tolerant `PolyCurveNodeDefinition.create`, `undoDescription` returning `null` instead of
  throwing, `Document.all` as a `Collection`, stable `Document.current`, `Document.close()`,
  a bulk `addNodes([...])` helper.
- Errors: supported-version list in `Unsupported protocol version`, setting name in
  `PERMISSION_DENIED`, actionable preamble-gate error.
- Hint hygiene: cap hint length/count so the mandatory preamble read does not grow without bound.

### Keeping this current

1. **A finding is fixed upstream** — change its Status to `Fixed`, note the Affinity build that fixed it,
   and keep the row for history.
2. **A workaround lands here** — set `Documented` (skill/docs) or `Fixed (partial)` (bridge) and add the
   file to the *Work landed* table.
3. **An open question is answered** — replace `Verify` in §9 with the finding; promote it to the summary
   table if it needs a fix.
4. **After any change** — re-run `node --test tests/*.test.mjs` and the checklist in `bin/SMOKE_TESTS.md`.

**Last verified:** 2026-11-01, Affinity 3.3.1 (build 4940), macOS.

---

## Appendix — reproduction commands

```bash
# protocol version(s) compiled into the MCP server
grep -a -o -E "20[0-9]{2}-[0-9]{2}-[0-9]{2}" \
  /Applications/Affinity.app/Contents/Frameworks/liblibmcp.dylib | sort -u

# transport paths / event names
grep -a -o -E "/sse|event: (endpoint|message|heartbeat)" \
  /Applications/Affinity.app/Contents/Frameworks/liblibmcp.dylib | sort -u

# MCP methods
grep -E "^(initialize|ping|tools/|resources/|notifications/)" docs/liblibmcp-strings.txt

# tool names and descriptions
grep -i -E "render|spread|selection|hint|library script|sdk issue" docs/liblibmcp-strings.txt

# full unique string dump (gitignored scratch)
strings -a /Applications/Affinity.app/Contents/Frameworks/liblibmcp.dylib \
  | sort -u > docs/liblibmcp-strings.txt

# server toggle
plutil -p ~/Library/Preferences/com.canva.affinity.plist | grep -i mcp
```
