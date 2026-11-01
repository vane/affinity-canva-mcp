# ai-affinity-mcp

A workspace for driving **Affinity by Canva** from an AI agent through the Affinity MCP server.
Everything in Affinity is done by writing JavaScript against the SDK and running it with
`execute_script` — there is no "apply effect" tool. This repo holds the agent skill that teaches
that workflow, a runnable example, and an optional local mirror of the SDK sources.

## Layout

| Path | Purpose |
| --- | --- |
| `.agents/skills/affinity-mcp/` | The **Affinity MCP skill** — the committable deliverable. |
| `docs/` | Extracted SDK sources, optional (see below). |

### The skill

```
.agents/skills/affinity-mcp/
├── SKILL.md                      # instructions the agent loads
├── README.md                     # skill overview, install and usage
└── examples/
    └── one-eyed-monster.js       # complete working line-art example
```

The skill is self-contained: it needs nothing else from this repo. Start with
[`.agents/skills/affinity-mcp/README.md`](.agents/skills/affinity-mcp/README.md), and treat
[`SKILL.md`](.agents/skills/affinity-mcp/SKILL.md) as the source of truth.

It covers the mandatory preamble/doc-read workflow, the document/node/selection object model, node
definitions and z-order, commands and boolean welding, geometry and curve building, colour, fills,
strokes, units, text, raster pixels, dialogs, export, permission limits, and hint recording — plus a
worked example of drawing line-art from overlapping parts.

### `docs/` — extracted SDK sources

A temporary copy of the SDK's JavaScript library, extracted from the published zip:

```
https://sdk.affinity.studio/33001/JSLib.zip
```

The `33001` path segment is the SDK build; use the one matching your Affinity version. After
extracting, the folder holds `document.js`, `nodes.js`, `shapes.js`, `examples/`, `tests/`,
`param_ranges.min.json`, and so on. Reading these files directly with file tools is faster than
round-tripping through the MCP doc tools. It is a mirror of what `read_sdk_documentation_topic`
returns and does not replace the mandatory preamble step. The skill works without it — if the folder
is absent, fall back to `read_sdk_documentation_topic` and `search_api_docs`. Do not commit it.

## Requirements

- Affinity by Canva (verified against **3.3.1** on macOS) with the **Affinity MCP server** running.
- Script/AI permissions enabled in Affinity. If a call returns `NOT_ALLOWED`, AI, filesystem or
  networking access is disabled in Affinity's settings.
- In this setup `fs.js` and `network.js` throw `PERMISSION_DENIED`, so scripts must not rely on file
  I/O or outbound HTTP; verify visually with `render_spread` / `render_selection` instead of exporting.

## Quick start

1. Load the skill (agents pick it up automatically when the task matches).
2. Follow its mandatory start sequence — read the `preamble` doc topic first, then search hints.
3. Run a script with `execute_script`; output appears only via `console.log(...)`.
4. Render to verify: `render_spread` with `document_session_uuid: doc.sessionUuid, spread_index: 0`,
   or `render_selection` for a single node.
5. Save good scripts with `save_script_to_library` and record new SDK findings with `add_sdk_hint`.

To install the skill globally, copy `.agents/skills/affinity-mcp/` to `~/.agents/skills/affinity-mcp/`.
