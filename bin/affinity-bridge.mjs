#!/usr/bin/env node

import readline from "node:readline";

const SSE_URL = process.env.AFFINITY_MCP_SSE_URL ?? "http://[::1]:6767/sse";
const PROTOCOL_VERSION = process.env.AFFINITY_MCP_PROTOCOL_VERSION ?? "2025-11-25";
const REQUEST_TIMEOUT_MS =
  Number.parseInt(process.env.AFFINITY_BRIDGE_TIMEOUT_MS ?? "300000", 10) || 300000;
const DEBUG = process.env.AFFINITY_BRIDGE_DEBUG === "1";
const LOG_PREFIX = "[affinity-bridge]";

const RECONNECT_MIN_MS = 250;
const RECONNECT_MAX_MS = 5000;
const ENDPOINT_TIMEOUT_MS =
  Number.parseInt(process.env.AFFINITY_BRIDGE_ENDPOINT_TIMEOUT_MS ?? "10000", 10) || 10000;
const EXIT_GRACE_MS = 1500;
const MAX_RETRIES = 1;
const MAX_EXPIRED_IDS = 200;

// Read-only tools only: re-sending them cannot duplicate side effects.
// Mutating tools (execute_script, save_script_to_library, ...) are never retried.
const RETRYABLE_TOOLS = new Set([
  "render_spread",
  "render_selection",
  "read_sdk_documentation_topic",
  "list_sdk_documentation",
  "search_sdk_hints",
  "list_library_scripts",
  "read_library_script",
]);

// Affinity reports a closed render channel that is transient in practice.
const RETRYABLE_ERROR = /authorization channel closed|channel closed/i;

// Client protocol versions keyed by initialize request id, so the client's own
// version can be restored on the matching response.
const pendingClientProtocolVersions = new Map();

// Requests awaiting a response: id -> { message, attempts, timer }.
const pendingRequests = new Map();
// Ids that already timed out; a late response for them is dropped.
const expiredIds = new Set();

let messageEndpoint = null;
let endpointDeferred = null;
let discoveryTimer = null;
let sseController = null;
let input = null;
let shuttingDown = false;
let writeChain = Promise.resolve();

// ---- helpers ---------------------------------------------------------------

function log(message) {
  process.stderr.write(`${LOG_PREFIX} ${message}\n`);
}

function debug(message) {
  if (DEBUG) log(message);
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseJson(raw, source) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    log(`Ignoring invalid JSON from ${source}: ${error.message}`);
    return null;
  }
}

// ---- stdout ----------------------------------------------------------------

// Writes are queued and honour backpressure, so a large render payload cannot
// be truncated or reordered.
function writeJsonRpc(message) {
  const line = `${JSON.stringify(message)}\n`;
  writeChain = writeChain.then(() => writeLine(line));
  return writeChain;
}

async function writeLine(line) {
  if (!process.stdout.write(line)) {
    await new Promise((resolve) => process.stdout.once("drain", resolve));
  }
}

function writeErrorResponse(id, message, code = -32001) {
  writeJsonRpc({ jsonrpc: "2.0", id, error: { code, message } });
}

// ---- lifecycle -------------------------------------------------------------

function resetEndpoint() {
  messageEndpoint = null;

  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  promise.catch(() => {});

  endpointDeferred = { promise, resolve, reject };
}

function clearPending(id) {
  const entry = pendingRequests.get(id);
  if (entry) {
    clearTimeout(entry.timer);
    pendingRequests.delete(id);
  }
}

function shutdown(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`Shutting down (exit ${exitCode})`);

  for (const id of [...pendingRequests.keys()]) {
    clearPending(id);
  }

  endpointDeferred?.reject(new Error("bridge shutting down"));
  sseController?.abort();
  input?.close();

  process.exitCode = exitCode;
  setTimeout(() => process.exit(exitCode), EXIT_GRACE_MS).unref();
}

function fail(error) {
  log(`Fatal error: ${messageOf(error)}`);
  shutdown(1);
}

// ---- protocol version translation ------------------------------------------

function toAffinityProtocolVersion(message) {
  const params = message.params;
  if (
    message.method !== "initialize" ||
    typeof params !== "object" ||
    params === null
  ) {
    return message;
  }

  const clientProtocolVersion = params.protocolVersion;
  if (clientProtocolVersion !== undefined && Object.hasOwn(message, "id")) {
    pendingClientProtocolVersions.set(message.id, clientProtocolVersion);
  }

  log(`Translating initialize protocol ${clientProtocolVersion} -> ${PROTOCOL_VERSION}`);
  return { ...message, params: { ...params, protocolVersion: PROTOCOL_VERSION } };
}

function toClientProtocolVersion(message) {
  if (
    !Object.hasOwn(message, "id") ||
    !pendingClientProtocolVersions.has(message.id)
  ) {
    return message;
  }

  const clientProtocolVersion = pendingClientProtocolVersions.get(message.id);
  pendingClientProtocolVersions.delete(message.id);

  if (!message.result || typeof message.result !== "object") {
    return message;
  }
  return {
    ...message,
    result: { ...message.result, protocolVersion: clientProtocolVersion },
  };
}

// ---- request tracking ------------------------------------------------------

function registerPending(message, attempts = 0) {
  if (!Object.hasOwn(message, "id") || typeof message.method !== "string") {
    return;
  }

  clearPending(message.id);
  const timer = setTimeout(() => expirePending(message.id), REQUEST_TIMEOUT_MS);
  timer.unref();
  pendingRequests.set(message.id, { message, attempts, timer });
}

function expirePending(id) {
  const entry = pendingRequests.get(id);
  if (!entry) return;

  clearPending(id);
  if (expiredIds.size >= MAX_EXPIRED_IDS) {
    expiredIds.clear();
  }
  expiredIds.add(id);

  log(`Request ${id} (${entry.message.method}) timed out after ${REQUEST_TIMEOUT_MS} ms`);
  writeErrorResponse(id, `Affinity did not respond within ${REQUEST_TIMEOUT_MS} ms`);
}

// A tool call carries the tool name in params.name; everything else is the method.
function requestLabel(request) {
  if (request.method === "tools/call") {
    return request.params?.name ?? "tools/call";
  }
  return request.method ?? "";
}

function isRetryableFailure(request, error) {
  if (!RETRYABLE_TOOLS.has(requestLabel(request))) {
    return false;
  }
  const text = typeof error === "string" ? error : error?.message ?? "";
  return RETRYABLE_ERROR.test(text);
}

function retryRequest(entry) {
  const attempts = entry.attempts + 1;
  log(`Retrying ${entry.message.method} (id ${entry.message.id}), attempt ${attempts}`);

  registerPending(entry.message, attempts);
  postToAffinity(entry.message).catch((error) => {
    clearPending(entry.message.id);
    const text = messageOf(error);
    log(`Retry failed: ${text}`);
    writeErrorResponse(entry.message.id, text);
  });
}

// ---- SSE -------------------------------------------------------------------

function createSseParser(onEvent) {
  let eventName = "message";
  let dataLines = [];

  function dispatch() {
    if (dataLines.length > 0) {
      onEvent(eventName, dataLines.join("\n"));
    }
    eventName = "message";
    dataLines = [];
  }

  function feed(line) {
    if (line === "") {
      dispatch();
      return;
    }
    if (line.startsWith(":")) {
      return; // comment line
    }

    const separator = line.indexOf(":");
    const field = separator === -1 ? line : line.slice(0, separator);
    let value = separator === -1 ? "" : line.slice(separator + 1);
    if (value.startsWith(" ")) {
      value = value.slice(1);
    }

    if (field === "event") {
      eventName = value;
    } else if (field === "data") {
      dataLines.push(value);
    }
  }

  return { feed, flush: dispatch };
}

function handleSseEvent(eventName, data) {
  if (eventName === "endpoint") {
    if (messageEndpoint) {
      log("Ignoring duplicate endpoint event");
      return;
    }
    messageEndpoint = new URL(data, SSE_URL).href;
    clearTimeout(discoveryTimer);
    log("Affinity SSE connected; message endpoint discovered");
    endpointDeferred.resolve(messageEndpoint);
    return;
  }

  // `heartbeat` and any other event type are intentionally ignored.
  if (eventName === "message") {
    const message = parseJson(data, "Affinity");
    if (message) {
      handleRemoteMessage(message);
    }
  }
}

// Takes an already-parsed JSON-RPC message (from SSE or a POST body).
function handleRemoteMessage(message) {
  const hasId = Object.hasOwn(message, "id");
  const id = hasId ? message.id : null;

  if (hasId && expiredIds.has(id)) {
    expiredIds.delete(id);
    debug(`<- id=${id} dropped (already timed out)`);
    return;
  }

  debug(
    hasId
      ? `<- id=${id} ${message.error ? "error" : "result"}`
      : `<- notification ${message.method ?? ""}`,
  );

  if (hasId) {
    const entry = pendingRequests.get(id);
    if (entry) {
      clearPending(id);
      if (message.error && isRetryableFailure(entry.message, message.error)) {
        if (entry.attempts < MAX_RETRIES) {
          retryRequest(entry);
          return; // suppress this error; the retry's response will be forwarded
        }
      }
    }
  }

  writeJsonRpc(toClientProtocolVersion(message));
}

async function consumeSse(response) {
  if (!response.body) {
    throw new Error("Affinity SSE response had no body");
  }

  const reader = response.body.getReader();

  const decoder = new TextDecoder();
  const parser = createSseParser(handleSseEvent);
  let buffer = "";
  let ended = false;

  for (;;) {
    const { value, done } = await reader.read();
    if (done) {
      ended = true;
      buffer += decoder.decode();
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      parser.feed(line);
    }
  }

  // Only flush on a clean end: a cancelled stream may stop mid-event.
  if (ended) {
    if (buffer.length > 0) {
      parser.feed(buffer);
    }
    parser.flush();
  }
}

function dropConnection(reason) {
  if (shuttingDown) return;
  log(`Dropping SSE connection: ${reason}`);
  if (messageEndpoint !== null) {
    resetEndpoint();
  }
  sseController?.abort();
}

async function connectToAffinity() {
  sseController = new AbortController();

  clearTimeout(discoveryTimer);
  discoveryTimer = setTimeout(() => {
    if (messageEndpoint || shuttingDown) return;
    log(`No endpoint event after ${ENDPOINT_TIMEOUT_MS} ms; dropping connection`);
    sseController?.abort();
  }, ENDPOINT_TIMEOUT_MS);

  try {
    const response = await fetch(SSE_URL, {
      headers: { Accept: "text/event-stream" },
      signal: sseController.signal,
    });

    if (!response.ok) {
      throw new Error(`Affinity SSE connection returned HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("text/event-stream")) {
      throw new Error(
        `Affinity returned unexpected content type: ${contentType || "(none)"}`,
      );
    }

    await consumeSse(response);
  } finally {
    clearTimeout(discoveryTimer);
  }
}

// Posts one message. Retries once against a freshly discovered endpoint when the
// current one has rotated (404/410).
async function postToAffinity(message) {
  for (let attempt = 0; ; attempt++) {
    const endpoint = await endpointDeferred.promise;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    if (response.status === 404 || response.status === 410) {
      await response.body?.cancel();
      if (attempt >= 1) {
        throw new Error(
          `Affinity message endpoint returned HTTP ${response.status}`,
        );
      }
      dropConnection(`message endpoint returned HTTP ${response.status}`);
      continue;
    }

    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(
        `Affinity message endpoint returned HTTP ${response.status}`,
      );
    }

    // Some transports return the JSON-RPC response in the POST body instead of
    // over SSE; forward it rather than discarding it.
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const text = await response.text();
      if (text.trim().length > 0) {
        const body = parseJson(text, "Affinity (POST body)");
        if (body) {
          for (const item of Array.isArray(body) ? body : [body]) {
            handleRemoteMessage(item);
          }
        }
      }
      return;
    }

    // SSE transport: responses arrive on the stream, so drain this socket.
    await response.body?.cancel();
    return;
  }
}

// ---- reconnect loop --------------------------------------------------------

async function run() {
  let delay = RECONNECT_MIN_MS;

  for (;;) {
    try {
      await connectToAffinity();
      if (shuttingDown) return;

      throw new Error(
        messageEndpoint
          ? "Affinity closed the SSE stream"
          : "Affinity closed the SSE stream before sending an endpoint event",
      );
    } catch (error) {
      if (shuttingDown) return;

      const wasConnected = messageEndpoint !== null;
      log(`SSE connection lost: ${messageOf(error)}`);

      if (messageEndpoint !== null) {
        resetEndpoint();
      }
      if (wasConnected) {
        delay = RECONNECT_MIN_MS;
      }

      log(`Reconnecting in ${delay} ms`);
      await sleep(delay);
      if (shuttingDown) return;
      delay = Math.min(delay * 2, RECONNECT_MAX_MS);
    }
  }
}

// ---- stdio -----------------------------------------------------------------

async function handleClientLine(line) {
  if (!line.trim()) {
    return;
  }

  const message = parseJson(line, "client");
  if (!message) {
    return;
  }

  const request = toAffinityProtocolVersion(message);
  debug(
    request.method
      ? `-> ${requestLabel(request)} id=${Object.hasOwn(request, "id") ? request.id : "-"}`
      : `-> response id=${request.id ?? "-"}`,
  );

  registerPending(request);

  try {
    await postToAffinity(request);
  } catch (error) {
    clearPending(request.id);
    const text = messageOf(error);
    log(`Request failed: ${text}`);
    if (Object.hasOwn(request, "id")) {
      writeErrorResponse(request.id, text);
    }
  }
}

function start() {
  resetEndpoint();
  run().catch(fail);

  // A closed stdout means the client is gone; anything else is fatal.
  process.stdout.on("error", (error) => {
    if (error.code === "EPIPE") {
      shutdown(0);
    } else {
      fail(error);
    }
  });

  input = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
    terminal: false,
  });

  let queue = Promise.resolve();
  input.on("line", (line) => {
    queue = queue.then(() => handleClientLine(line)).catch(fail);
  });

  input.on("close", () => shutdown(0));
  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));
}

start();
