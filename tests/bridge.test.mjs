// Integration tests for bin/affinity-bridge.mjs against a fake Affinity SSE
// server. Run with:  node --test tests/
//
// These cover the paths that cannot be exercised against a live Affinity:
// reconnect, endpoint discovery timeout, stale-endpoint retry, request timeout,
// transient-error retry, POST-body responses and clean shutdown.

import test from "node:test";
import assert from "node:assert/strict";

import { createFakeAffinity } from "./fake-affinity.mjs";
import {
  BridgeHarness,
  initializeRequest,
  toolCallRequest,
  sleep,
} from "./harness.mjs";

/** Starts a fake server + bridge, registers teardown. */
async function setup(t, { fakeOptions = {}, bridgeEnv = {} } = {}) {
  const fake = await createFakeAffinity(fakeOptions);
  const bridge = new BridgeHarness({ sseUrl: fake.url, env: bridgeEnv }).start();

  t.after(async () => {
    await bridge.stop();
    await fake.close();
  });

  return { fake, bridge };
}

test("translates initialize protocol version and restores the client's", async (t) => {
  const { fake, bridge } = await setup(t, {
    fakeOptions: {
      respond: (message) => ({
        jsonrpc: "2.0",
        id: message.id,
        result: { protocolVersion: "2025-11-25", capabilities: {}, serverInfo: {} },
      }),
    },
  });

  bridge.send(initializeRequest(1, "2025-06-18"));
  const response = await bridge.waitForResponse(1);

  // The client must see its own version back, not Affinity's.
  assert.equal(response.result.protocolVersion, "2025-06-18");

  const forwarded = fake.state.requests.find((r) => r.method === "initialize");
  assert.ok(forwarded, "initialize should have been forwarded");
  assert.equal(forwarded.params.protocolVersion, "2025-11-25");
  assert.equal(forwarded.params.clientInfo.name, "bridge-test");
});

test("forwards tools/call and returns the result", async (t) => {
  const { fake, bridge } = await setup(t);

  bridge.send(toolCallRequest(2, "render_spread", { document_session_uuid: "abc" }));
  const response = await bridge.waitForResponse(2);

  assert.equal(response.result.ok, true);
  assert.equal(response.result.method, "tools/call");

  const forwarded = fake.state.requests.at(-1);
  assert.equal(forwarded.params.name, "render_spread");
  assert.equal(forwarded.params.arguments.document_session_uuid, "abc");
});

test("ignores heartbeat events", async (t) => {
  const { fake, bridge } = await setup(t);

  bridge.send(toolCallRequest(3, "list_sdk_documentation"));
  await bridge.waitForResponse(3);

  fake.emit("heartbeat", JSON.stringify({ seq: 1 }));
  fake.emit("something-unknown", "{}");
  await sleep(150);

  // Only the one real response should have reached stdout.
  assert.equal(bridge.messages.length, 1);
  assert.equal(bridge.messages[0].id, 3);
});

test("reconnects after the SSE stream closes", async (t) => {
  const { fake, bridge } = await setup(t);

  bridge.send(toolCallRequest(1, "ping"));
  await bridge.waitForResponse(1);

  fake.dropStream(); // simulate Affinity restarting

  await bridge.waitFor(() => fake.state.connectionCount >= 2, {
    timeoutMs: 5000,
    what: "the bridge to reconnect",
  });

  bridge.send(toolCallRequest(2, "ping"));
  const response = await bridge.waitForResponse(2);
  assert.equal(response.id, 2);
  assert.equal(response.result.ok, true);
});

test("retries once when the message endpoint has rotated (404)", async (t) => {
  let firstPost = true;

  const { fake, bridge } = await setup(t, {
    fakeOptions: {
      postStatus: () => {
        if (firstPost) {
          firstPost = false;
          return 404;
        }
        return 202;
      },
    },
  });

  bridge.send(toolCallRequest(1, "render_spread"));
  const response = await bridge.waitForResponse(1);

  assert.equal(response.error, undefined);
  assert.equal(response.result.ok, true);
  assert.ok(
    fake.state.connectionCount >= 2,
    "bridge should have reconnected to discover a new endpoint",
  );
  assert.equal(fake.state.posts, 2, "exactly one retry");
});

test("retries a read-only tool once on 'authorization channel closed'", async (t) => {
  let calls = 0;

  const { fake, bridge } = await setup(t, {
    fakeOptions: {
      respond: (message) => {
        calls += 1;
        if (calls === 1) {
          return {
            jsonrpc: "2.0",
            id: message.id,
            error: { code: -32603, message: "authorization channel closed" },
          };
        }
        return { jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text" }] } };
      },
    },
  });

  bridge.send(toolCallRequest(1, "render_spread"));
  const response = await bridge.waitForResponse(1);

  assert.equal(response.error, undefined, "the transient error must be suppressed");
  assert.ok(response.result, "the retry's result should be forwarded");
  assert.equal(calls, 2, "one retry");
  assert.equal(fake.state.requests.length, 2);
});

test("does not retry a non-tool method on a transient error", async (t) => {
  let calls = 0;

  const { fake, bridge } = await setup(t, {
    fakeOptions: {
      respond: (message) => {
        calls += 1;
        return {
          jsonrpc: "2.0",
          id: message.id,
          error: { code: -32603, message: "authorization channel closed" },
        };
      },
    },
  });

  // `ping` is not a tool call, so requestLabel() returns "ping" — not retryable.
  bridge.send({ jsonrpc: "2.0", id: 1, method: "ping" });
  const response = await bridge.waitForResponse(1);

  assert.equal(response.error.message, "authorization channel closed");
  assert.equal(calls, 1, "non-tool methods must never be re-sent");
  assert.equal(fake.state.requests.length, 1);
});

test("does not retry a tool call with no tool name", async (t) => {
  let calls = 0;

  const { bridge } = await setup(t, {
    fakeOptions: {
      respond: (message) => {
        calls += 1;
        return {
          jsonrpc: "2.0",
          id: message.id,
          error: { code: -32603, message: "authorization channel closed" },
        };
      },
    },
  });

  // requestLabel() falls back to "tools/call", which is not in RETRYABLE_TOOLS.
  bridge.send({ jsonrpc: "2.0", id: 1, method: "tools/call", params: {} });
  const response = await bridge.waitForResponse(1);

  assert.equal(response.error.message, "authorization channel closed");
  assert.equal(calls, 1);
});

test("forwards notifications without expecting a response", async (t) => {
  const { fake, bridge } = await setup(t);

  bridge.send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });

  await bridge.waitFor(
    () => fake.state.requests.some((r) => r.method === "notifications/initialized"),
    { what: "the notification to be forwarded" },
  );

  await sleep(150);
  assert.equal(bridge.messages.length, 0, "notifications have no id and must not produce output");
});

test("ignores invalid JSON from the client and keeps working", async (t) => {
  const { bridge } = await setup(t);

  bridge.sendRaw("this is not json");
  bridge.send(toolCallRequest(1, "ping"));

  const response = await bridge.waitForResponse(1);
  assert.equal(response.result.ok, true);
});

test("does not retry a mutating tool", async (t) => {
  let calls = 0;

  const { fake, bridge } = await setup(t, {
    fakeOptions: {
      respond: (message) => {
        calls += 1;
        return {
          jsonrpc: "2.0",
          id: message.id,
          error: { code: -32603, message: "authorization channel closed" },
        };
      },
    },
  });

  bridge.send(toolCallRequest(1, "execute_script", { script: "throw new Error('x')" }));
  const response = await bridge.waitForResponse(1);

  assert.equal(response.error.message, "authorization channel closed");
  assert.equal(calls, 1, "execute_script must never be re-sent");
  assert.equal(fake.state.requests.length, 1);
});

test("times out an unanswered request instead of hanging", async (t) => {
  const { bridge } = await setup(t, {
    fakeOptions: { respond: () => null },
    bridgeEnv: { AFFINITY_BRIDGE_TIMEOUT_MS: "300" },
  });

  bridge.send(toolCallRequest(1, "ping"));
  const response = await bridge.waitForResponse(1, { timeoutMs: 4000 });

  assert.equal(response.error.code, -32001);
  assert.match(response.error.message, /did not respond/);
});

test("forwards a JSON-RPC response returned in the POST body", async (t) => {
  const { bridge } = await setup(t, {
    fakeOptions: { jsonBody: true },
  });

  bridge.send(toolCallRequest(1, "ping"));
  const response = await bridge.waitForResponse(1);

  assert.equal(response.id, 1);
  assert.equal(response.result.ok, true);
});

test("keeps responses matched to ids under concurrency", async (t) => {
  const { bridge } = await setup(t);

  const count = 8;
  for (let id = 1; id <= count; id++) {
    bridge.send({ jsonrpc: "2.0", id, method: "ping", params: { n: id } });
  }

  for (let id = 1; id <= count; id++) {
    const response = await bridge.waitForResponse(id);
    assert.equal(response.id, id);
    assert.equal(response.result.echo.n, id, `id ${id} got someone else's payload`);
  }
});

test("delivers a large payload intact", async (t) => {
  const payload = "A".repeat(200_000);

  const { bridge } = await setup(t, {
    fakeOptions: {
      respond: (message) => ({
        jsonrpc: "2.0",
        id: message.id,
        result: { content: [{ type: "image", data: payload }] },
      }),
    },
  });

  bridge.send(toolCallRequest(1, "render_spread"));
  const response = await bridge.waitForResponse(1);

  assert.equal(response.result.content[0].data.length, payload.length);
});

test("recovers when no endpoint event ever arrives", async (t) => {
  const { fake, bridge } = await setup(t, {
    fakeOptions: { sendEndpoint: false },
    bridgeEnv: { AFFINITY_BRIDGE_ENDPOINT_TIMEOUT_MS: "200" },
  });

  // The bridge must drop the silent connection and try again rather than wait.
  await bridge.waitFor(() => fake.state.connectionCount >= 2, {
    timeoutMs: 5000,
    what: "the bridge to retry after the endpoint timeout",
  });
});

test("exits cleanly when the client closes stdin", async (t) => {
  const fake = await createFakeAffinity();
  const bridge = new BridgeHarness({ sseUrl: fake.url }).start();

  bridge.send(initializeRequest(1));
  await bridge.waitForResponse(1);

  const result = await bridge.stop({ timeoutMs: 6000 });
  await fake.close();

  assert.equal(result.code, 0, `expected a clean exit, got ${JSON.stringify(result)}`);
});

test("reports a request error instead of dying when the endpoint rejects it", async (t) => {
  const { bridge } = await setup(t, {
    fakeOptions: { postStatus: () => 500 },
  });

  bridge.send(toolCallRequest(1, "ping"));
  const response = await bridge.waitForResponse(1);

  assert.equal(response.error.code, -32001);
  assert.match(response.error.message, /HTTP 500/);

  // The bridge must still be usable afterwards.
  bridge.send(toolCallRequest(2, "ping"));
  const second = await bridge.waitForResponse(2);
  assert.equal(second.error.code, -32001);
});
