// Spawns bin/affinity-bridge.mjs as a real subprocess and talks MCP-style
// JSON-RPC over its stdio, exactly as an MCP client would.

import { spawn } from "node:child_process";
import readline from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const BRIDGE_PATH = path.resolve(HERE, "..", "bin", "affinity-bridge.mjs");

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class BridgeHarness {
  constructor({ sseUrl, env = {} } = {}) {
    this.sseUrl = sseUrl;
    this.env = env;
    this.messages = [];
    this.stderr = "";
    this.proc = null;
    this.exited = null;
  }

  start() {
    this.proc = spawn(process.execPath, [BRIDGE_PATH], {
      env: {
        ...process.env,
        AFFINITY_MCP_SSE_URL: this.sseUrl,
        // Keep reconnect fast in tests; individual tests may override.
        AFFINITY_BRIDGE_ENDPOINT_TIMEOUT_MS: "3000",
        ...this.env,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    readline
      .createInterface({ input: this.proc.stdout })
      .on("line", (line) => {
        try {
          this.messages.push(JSON.parse(line));
        } catch {
          this.messages.push({ raw: line });
        }
      });

    this.proc.stderr.on("data", (chunk) => {
      this.stderr += chunk.toString();
    });

    this.exited = new Promise((resolve) => {
      this.proc.on("exit", (code, signal) => resolve({ code, signal }));
    });

    return this;
  }

  /** Send one JSON-RPC message to the bridge's stdin. */
  send(message) {
    this.proc.stdin.write(`${JSON.stringify(message)}\n`);
  }

  /** All responses received so far for a given id. */
  responsesFor(id) {
    return this.messages.filter((m) => m.id === id);
  }

  async waitFor(predicate, { timeoutMs = 5000, what = "condition" } = {}) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (predicate()) return true;
      await sleep(20);
    }
    throw new Error(`Timed out waiting for ${what}. stderr:\n${this.stderr}`);
  }

  async waitForResponse(id, { timeoutMs = 5000 } = {}) {
    await this.waitFor(() => this.responsesFor(id).length > 0, {
      timeoutMs,
      what: `a response for id ${id}`,
    });
    return this.responsesFor(id)[0];
  }

  /** Close stdin (as an exiting client would) and wait for process exit. */
  async stop({ timeoutMs = 5000 } = {}) {
    if (!this.proc) return null;
    this.proc.stdin.end();
    const result = await Promise.race([this.exited, sleep(timeoutMs).then(() => null)]);
    if (result === null) {
      this.proc.kill("SIGKILL");
      return this.exited;
    }
    return result;
  }

  kill() {
    this.proc?.kill("SIGKILL");
  }
}

/** A minimal `initialize` request, as an MCP client would send. */
export function initializeRequest(id = 1, protocolVersion = "2025-06-18") {
  return {
    jsonrpc: "2.0",
    id,
    method: "initialize",
    params: {
      protocolVersion,
      capabilities: {},
      clientInfo: { name: "bridge-test", version: "1.0.0" },
    },
  };
}

/** A `tools/call` request. */
export function toolCallRequest(id, name, args = {}) {
  return {
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: { name, arguments: args },
  };
}
