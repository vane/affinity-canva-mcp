# Smoke tests — Affinity MCP server

A short, ordered checklist to confirm the **live** MCP server still works after a change to Affinity,
the MCP server, or the stdio↔SSE bridge. Run these by calling the MCP tools directly (agent or human);
they complement the automated bridge tests in [`../tests/`](../tests/README.md), which use a fake server
and cannot exercise real Affinity.

**Run order matters:** test 1 establishes the session. Tests 4–6 need a document; tests 7–9 need the
document from test 4.

## Prerequisites

- Affinity is running with the MCP server enabled
  (`EnableMCPServer => true` in `~/Library/Preferences/com.canva.affinity.plist`).
- The MCP client is pointed at the server — directly or through `bin/run`.
- Script execution is enabled in Affinity. Filesystem, network, export, script-library and hint
  permissions are **separate toggles** — this checklist needs none of them, so it runs with all of them
  off. Verification uses the render tools throughout.
- **After any restart, test 1 must be run first** — every other doc tool fails until the preamble has
  been read in that session.

## Quick checklist

| # | Check | Tool | Expect |
| --- | --- | --- | --- |
| 1 | Session handshake | `read_sdk_documentation_topic("preamble")` | Preamble text returned |
| 2 | Doc topic list | `list_sdk_documentation` | Comma-separated string containing `preamble` |
| 3 | Hint search (no match) | `search_sdk_hints` | Empty string — **not** an error |
| 4 | SDK runtime + doc enumeration | `execute_script` | Version string, doc count, `sessionUuid` |
| 5 | Create document | `execute_script` | New uuid, 0 nodes, 600×480 |
| 6 | Draw + weld | `execute_script` | 3 nodes → 1 `PolyCurveNode` |
| 7 | Render spread | `render_spread` | Image, ≤ 1024 px |
| 8 | Render selection | `render_selection` | Image of the single selected node |
| 9 | Script error | `execute_script` | Error + stack; bridge still alive |
| 10 | Render error | `render_spread` (bad uuid) | `No document with that Uuid exists.` |
| 11 | History | `execute_script` | Undo/redo restores node count |
| 12 | Concurrency | 6 × `execute_script` | Each returns its own marker |
| 13 | Cleanup | `execute_script` | 0 nodes |
| 14 | Bridge tests (optional) | `node --test tests/*.test.mjs` | 18/18 pass |

---

## 1. Session handshake

```
read_sdk_documentation_topic(filename: "preamble")
```

**Expect:** the preamble text, including the "Hints you recorded from previous sessions" block.

**Fail signs:** `ERROR: The preamble documentation topic has not yet been read.` on later calls, a
timeout, or no response at all (bridge/transport problem — check the SSE endpoint before suspecting
the SDK).

## 2. Documentation topic list

```
list_sdk_documentation()
```

**Expect:** one comma-separated string containing `preamble`, `document.js`, `nodes.js`,
`geometry.js`, and the `param_ranges.min.json` family. It is **not** JSON — split on `", "`.

## 3. Hint search with no matches

```
search_sdk_hints(prompt: "zzz-no-such-hint-12345")
```

**Expect:** an empty string. That means "no hints", not a failure. A thrown error here is a
regression.

## 4. SDK runtime and document enumeration

```js
const { Application } = require('/application.js');
const { Document } = require('/document.js');

console.log('version:', Application.version);
console.log('docs:', Document.all.length);          // Document.all is an ARRAY, no .toArray()
for (let i = 0; i < Document.all.length; i++) {
    const d = Document.all[i];
    console.log(i, d.title, d.sessionUuid, d.widthPixels, d.heightPixels);
}
const doc = Document.current;
console.log('current:', doc ? doc.sessionUuid : 'null');
```

**Expect:** an `Affinity 3.3.x …` version string, a document count matching what is actually open, and
`current: null` when nothing is open.

**Regression signs:** `Document.all.toArray is not a function` (expected — it is an Array), or
`Document.current` throwing.

## 5. Create a document

```js
const { Document, NewDocumentOptions } = require('/document.js');
const { UnitType } = require('/units.js');

const opts = NewDocumentOptions.createDefault();
opts.units = UnitType.Pixel;
opts.width = 600;
opts.height = 480;
opts.dpi = 96;
const doc = Document.create(opts);

console.log('uuid:', doc.sessionUuid);
console.log('nodes:', doc.currentSpread.children.all.toArray().length);
console.log('size:', doc.widthPixels + 'x' + doc.heightPixels);
```

**Expect:** a fresh uuid, `nodes: 0`, `size: 600x480`. Record the uuid — tests 7–13 need it.

**Note:** there is no `Document.close()`; leave the document open and tell the user, or reuse it for
later tests and clear it in test 13.

## 6. Draw and weld

```js
const { Document } = require('/document.js');
const { ShapeNodeDefinition } = require('/nodes.js');
const { ShapeEllipse } = require('/shapes.js');
const { Rectangle } = require('/geometry.js');
const { RGB8 } = require('/colours.js');
const { AddChildNodesCommandBuilder } = require('/commands.js');

const doc = Document.current;
const builder = AddChildNodesCommandBuilder.create();
for (let i = 0; i < 3; i++) {
    builder.addNode(ShapeNodeDefinition.create(ShapeEllipse.create(),
        new Rectangle(100 + i * 40, 100, 120, 120), RGB8(40, 120, 220)));
}

const t0 = Date.now();
doc.executeCommand(builder.createCommand(true));   // andSelect
console.log('added:', doc.selection.nodes.toArray().length, 'ms:', Date.now() - t0);

doc.boolOpUnion(null, false);
const merged = doc.selection.nodes.toArray()[0];
console.log('merged:', merged.constructor.name, 'curves:', merged.polyCurve.curveCount);
```

**Expect:** `added: 3`, a few ms, then `merged: PolyCurveNode curves: 1`.

**Regression signs:** `added: 0` (selection not applied), `ms` in the hundreds (bulk path broken), or
the union leaving 3 nodes.

## 7. Render the spread

```
render_spread(document_session_uuid: <uuid from test 5>, spread_index: 0)
```

**Expect:** an image showing the welded blue shape, longest side ≤ 1024 px.

**Fail signs:** empty/blank image, or a transport error.

## 8. Render a single node

```js
const { Document } = require('/document.js');
const { Selection } = require('/selections.js');
const doc = Document.current;
const node = doc.currentSpread.children.all.toArray()[0];
doc.selection = Selection.create(doc, [node]);
console.log('selected:', doc.selection.nodes.toArray().length, doc.sessionUuid);
```

then

```
render_selection(document_session_uuid: <uuid>)
```

**Expect:** an image of that one node on a transparent checkerboard.

**Do not** select several widely separated nodes — that renders an empty checkerboard by design (see
Known quirks).

## 9. Script error propagates, bridge survives

```js
throw new Error('smoke test error');
```

**Expect:** `Error: smoke test error` plus a stack trace.

Then immediately run any trivial script (e.g. `console.log('alive')`) and confirm it succeeds — that
proves the bridge treated the failure as non-fatal.

## 10. Render error

```
render_spread(document_session_uuid: "00000000-0000-0000-0000-000000000000", spread_index: 0)
```

**Expect:** `No document with that Uuid exists.` — a clean error, not a hang.

Optional: `spread_index: 9` on a single-spread document should return `Spread index out of bounds.`

## 11. History

```js
const { Document } = require('/document.js');
const { ShapeNodeDefinition } = require('/nodes.js');
const { ShapeRectangle } = require('/shapes.js');
const { Rectangle } = require('/geometry.js');
const { RGB8 } = require('/colours.js');

const doc = Document.current;
const count = () => doc.currentSpread.children.all.toArray().length;

let undoDesc;
try { undoDesc = doc.history.undoDescription; } catch (e) { undoDesc = `unavailable (${e.message})`; }

console.log('start:', count(), 'pos:', doc.history.position, 'undo:', undoDesc);

doc.addNode(ShapeNodeDefinition.create(ShapeRectangle.create(),
    new Rectangle(10, 10, 40, 30), RGB8(200, 60, 60)));
console.log('added:', count(), 'undo:', doc.history.undoDescription);

doc.undo();
console.log('undone:', count());
doc.redo();
console.log('redone:', count());
```

**Expect:** count rises by 1, undo returns it, redo restores it. `undoDescription` reads fine when the
history is non-empty; on an empty history it throws `INVALID_OP`, which is why the script guards it.

## 12. Concurrency

Issue six `execute_script` calls **in parallel**, each logging a distinct marker:

```js
const { Document } = require('/document.js');
console.log('marker=A nodes=' + Document.current.currentSpread.children.all.toArray().length);
```

Repeat with `B` … `F`.

**Expect:** six results, each with its own marker and the same node count — no cross-talk, no
reordering-induced mix-ups.

## 13. Cleanup

```js
const { Document } = require('/document.js');
const doc = Document.current;
doc.selectAll(false);
doc.deleteSelection(null, false);
console.log('nodes:', doc.currentSpread.children.all.toArray().length);
console.log('uuid:', doc.sessionUuid);
```

**Expect:** `nodes: 0`. Report the uuid so the user can close the document by hand.

## 14. Bridge fault paths (optional)

Automated, against a fake SSE server. Run from the **repo root**:

```bash
node --test tests/*.test.mjs
```

**Expect:** 18/18 pass. Note `node --test tests/` does **not** work on Node 24 — use the glob form.

Two live-only checks that the suite cannot cover:

- **Startup reconnect** — start the bridge while Affinity is closed, then open Affinity. The first
  tool call should succeed.
- **Mid-session reconnect** — restart Affinity while the bridge is running. The next tool call should
  succeed once Affinity is back (look for `Reconnecting in …` on stderr).

---

## Known quirks — not failures

These are current behaviour; do not file them as regressions.

| Behaviour | Why |
| --- | --- |
| `Document.all.toArray()` throws | `Document.all` is a plain Array |
| `Document.all[i] === Document.current` is `false` | `Document.current` returns a new wrapper each access; compare `sessionUuid` |
| `history.undoDescription` throws `INVALID_OP` | Empty undo history |
| `search_sdk_hints` returns `""` | No matches |
| `list_sdk_documentation` returns a comma string | Not JSON |
| `render_selection` returns a blank checkerboard | Selected nodes span nearly the whole spread |
| Renders capped at 1024 px | No size/format parameter |
| `doc.addNode()` returns `undefined` | New node is selected instead |
| Raw `LineStyle` rejected by node definitions | Use `LineStyleDescriptor.create(...)` |
| `PolyCurveNode` has no `curves` setter | Delete and re-add to re-shape |
| No `Document.close()` | Documents must be closed by hand |

## Baseline timings (Affinity 3.3.1, 800×600 px @ 96 dpi)

Use as loose sanity bounds; anything an order of magnitude slower suggests a regression.

| Operation | Baseline |
| --- | --- |
| Create document | ~250 ms |
| 250 nodes, one command | ~4 ms |
| 50 nodes, per-node `addNode` | ~93 ms |
| Select 300 nodes | ~2 ms |
| Recolour 300 nodes | ~24 ms |
| Transform 300 nodes | ~2 ms |
| Union of 150 circles | ~200 ms |
| Delete 301 nodes | ~150 ms |
| Undo one step | ~11 ms |
| Redo one step | ~2 ms |

## Results template

```
Environment: Affinity <version>, <platform>
Date:
Bridge: direct / bin/run
Document: <uuid>

[ ] 1  Session handshake
[ ] 2  Doc topic list
[ ] 3  Hint search (no match)
[ ] 4  SDK runtime + enumeration
[ ] 5  Create document
[ ] 6  Draw + weld
[ ] 7  Render spread
[ ] 8  Render selection
[ ] 9  Script error + liveness
[ ] 10 Render error
[ ] 11 History
[ ] 12 Concurrency
[ ] 13 Cleanup
[ ] 14 Bridge tests (optional)

Notes / anomalies:
```
