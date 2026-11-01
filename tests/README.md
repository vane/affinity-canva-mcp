# Bridge tests

Integration tests for `bin/affinity-bridge.mjs`. Each test spawns the bridge as a real
subprocess, talks JSON-RPC to it over stdio exactly as an MCP client would, and points it at a
**fake Affinity server** that speaks the same legacy SSE transport.

This is how the fault paths that cannot be reproduced against a live Affinity get exercised:
reconnect, endpoint-discovery timeout, stale-endpoint retry, request timeout, transient-error
retry, POST-body responses and clean shutdown.

## Run

```bash
node --test tests/*.test.mjs
```

Requires Node **18+** (`node:test`, global `fetch`). Note `node --test tests/` does **not** work on
Node 24 — it treats the directory as a module — so use the glob form above.

## Files

| File | Purpose |
| --- | --- |
| `fake-affinity.mjs` | Stand-in server: `GET /sse` sends the `endpoint` event, `POST /messages/<conn>` answers over SSE (or as JSON when `jsonBody` is set). Records every forwarded request. |
| `harness.mjs` | `BridgeHarness` — spawns the bridge, sends messages, waits for responses by id, captures stderr, and reports the exit code. |
| `bridge.test.mjs` | The test cases. |

## Coverage

| Test | Verifies |
| --- | --- |
| initialize translation | Client version restored on the response; Affinity receives `2025-11-25` |
| tools/call forwarding | Arguments reach the server, result comes back |
| heartbeat ignored | Unknown SSE events produce no stdout output |
| reconnect | Stream close → new connection → next request succeeds |
| stale endpoint (404) | One reconnect + exactly one retry |
| transient error retry | `authorization channel closed` on a read-only tool is retried once and suppressed |
| mutating tool not retried | `execute_script` is never re-sent |
| non-tool method not retried | A `ping` failure is never re-sent (guards `requestLabel`) |
| tool call without a name | `tools/call` with no `params.name` falls back to `"tools/call"` and is not retried |
| notifications forwarded | No `id`, so no response is expected and nothing is written to stdout |
| invalid client JSON | A malformed stdin line is ignored; the next request still succeeds |
| request timeout | Unanswered request becomes a `-32001` error instead of hanging |
| JSON POST body | Response delivered in the POST body is forwarded |
| concurrency | 8 simultaneous requests stay matched to their ids |
| large payload | 200 KB response arrives intact |
| endpoint timeout | Silent SSE connection is dropped and retried |
| clean exit | Closing stdin exits with code 0 |
| POST 500 | Request errors out; the bridge stays usable |

## Adding a test

Use `setup(t, { fakeOptions, bridgeEnv })` from `bridge.test.mjs` — it creates the fake server and
bridge and registers teardown. Override behaviour through `fakeOptions`:

- `respond(message, state)` — return a JSON-RPC response, or `null` to send nothing.
- `postStatus(message, state, connId)` — return an HTTP status to force 404/410/500 paths.
- `jsonBody: true` — return the response as `application/json` instead of over SSE.
- `sendEndpoint: false` — never emit the `endpoint` event (for discovery-timeout tests).

And through `bridgeEnv`: `AFFINITY_BRIDGE_TIMEOUT_MS`, `AFFINITY_BRIDGE_ENDPOINT_TIMEOUT_MS`,
`AFFINITY_BRIDGE_DEBUG`.
