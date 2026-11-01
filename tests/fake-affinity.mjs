// Minimal stand-in for Affinity's MCP server: legacy SSE transport.
//
//   GET  /sse              -> text/event-stream, first event is `endpoint`
//   POST /messages/<conn>  -> 202 (responses are delivered over SSE),
//                             or 200 application/json when jsonBody is set
//
// Every request body is recorded in `state.requests` so tests can assert on what
// the bridge actually forwarded.

import http from "node:http";

const DEFAULT_RESPOND = (message) => {
  if (!message || !Object.hasOwn(message, "id") || typeof message.method !== "string") {
    return null;
  }
  return {
    jsonrpc: "2.0",
    id: message.id,
    result: { ok: true, method: message.method, echo: message.params ?? null },
  };
};

export async function createFakeAffinity(options = {}) {
  const {
    respond = DEFAULT_RESPOND,
    postStatus = () => 202,
    jsonBody = false,
    sendEndpoint = true,
  } = options;

  const state = {
    connections: [],
    requests: [],
    connectionCount: 0,
    currentId: null,
    posts: 0,
  };

  function currentConnection() {
    return state.connections.find((c) => c.id === state.currentId) ?? null;
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (req.method === "GET" && url.pathname === "/sse") {
      state.connectionCount += 1;
      const id = `conn-${state.connectionCount}`;
      state.currentId = id;

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      state.connections.push({ id, res });

      if (sendEndpoint) {
        res.write(`event: endpoint\ndata: /messages/${id}\n\n`);
      }

      req.on("close", () => {
        const index = state.connections.findIndex((c) => c.id === id);
        if (index !== -1) state.connections.splice(index, 1);
      });
      return;
    }

    if (req.method === "POST" && url.pathname.startsWith("/messages/")) {
      const connId = url.pathname.slice("/messages/".length);
      state.posts += 1;

      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        let message = null;
        try {
          message = JSON.parse(body);
        } catch {
          message = null;
        }

        if (message) state.requests.push(message);

        const status = postStatus(message, state, connId);
        if (status >= 400) {
          res.writeHead(status).end();
          return;
        }

        const response = message ? respond(message, state, connId) : null;

        if (jsonBody) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(response ?? {}));
          return;
        }

        res.writeHead(status).end();
        if (response) {
          const conn = state.connections.find((c) => c.id === connId);
          if (conn) {
            conn.res.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
          }
        }
      });
      return;
    }

    res.writeHead(404).end();
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  return {
    url: `http://127.0.0.1:${port}/sse`,
    port,
    state,

    /** Write a raw SSE event to the current connection (e.g. a heartbeat). */
    emit(event, data) {
      const conn = currentConnection();
      if (conn) conn.res.write(`event: ${event}\ndata: ${data}\n\n`);
    },

    /** Close the current SSE stream, as Affinity does on restart. */
    dropStream() {
      const conn = currentConnection();
      if (conn) conn.res.end();
      state.currentId = null;
    },

    close() {
      for (const conn of state.connections) conn.res.end();
      state.connections.length = 0;
      return new Promise((resolve) => server.close(resolve));
    },
  };
}
