# Affinity MCP skill

An agent skill for driving **Affinity by Canva** through the Affinity MCP server. Everything in
Affinity is done by writing JavaScript against the SDK and running it with `execute_script` — there
is no "apply effect" tool. This skill teaches the agent to read the right docs, write one
directly-executable script, run it, and confirm the result visually with the render tools.

## What it covers

- The mandatory start sequence: read the `preamble` doc topic, search hints, then read the topics
  actually needed (skipping step 1 makes every other doc tool fail).
- The document / node / selection object model, spreads, artboards and layers.
- Creating nodes from `*NodeDefinition`s, and **node z-order** (insertion order = stacking order).
- Commands, including `boolOpUnion` for welding overlapping shapes into one clean silhouette.
- Geometry and curve building: `CurveBuilder`, bezier arcs, ellipses, capsules.
- Colour, fills, strokes, line styles, units/DPI, text formatting, raster pixels, dialogs and export.
- Drawing vector line-art illustrations from overlapping parts.
- Permission limits in this setup and how to verify work without exporting files.

## Contents

| Path | Purpose |
| --- | --- |
| `SKILL.md` | The skill itself — the instructions the agent loads. |
| `README.md` | This file. |

The skill is self-contained: it needs nothing from the host repository. The SDK sources it refers to
can be fetched as a zip (`https://sdk.affinity.studio/33001/JSLib.zip`) and read locally — see the
"SDK sources" section of `SKILL.md`. Without that zip, fall back to the MCP doc tools
(`read_sdk_documentation_topic`, `search_api_docs`).

## Requirements

- Affinity by Canva (verified against **3.3.1** on macOS) with the **Affinity MCP server** running.
- The agent must have access to the Affinity MCP tools: `execute_script`, `render_spread`,
  `render_selection`, `read_sdk_documentation_topic`, `search_sdk_hints`, `add_sdk_hint`,
  `list_sdk_documentation`, `save_script_to_library`, and the rest of the tool map.
- Script/AI permissions enabled in Affinity. If a call returns `NOT_ALLOWED`, the user has turned
  off AI, filesystem or networking access in Affinity's settings.

## Using the skill

1. Load `SKILL.md` (agents do this automatically when the skill matches the task).
2. Follow its mandatory start sequence before writing any script.
3. Run scripts with `execute_script`; output only appears via `console.log(...)`.
4. Verify with `render_spread` (`document_session_uuid: doc.sessionUuid`, `spread_index: 0`) or
   `render_selection` for an isolated close-up of a single node.
5. Save good scripts with `save_script_to_library`, and record new SDK findings with `add_sdk_hint`.

### Installing

Copy this folder to either location:

- **Project-local** — `<repo>/.agents/skills/affinity-mcp/` (what this copy is).
- **Global** — `~/.agents/skills/affinity-mcp/` to make it available in every workspace.

## Environment notes (this setup)

Recorded against Affinity 3.3.1 on macOS:

- The SDK bridge, script execution and render tools work.
- `fs.js` and `network.js` throw `PERMISSION_DENIED`; `allowCodeGenerationFromStrings` is `false`.
  So: no file I/O, no outbound HTTP, no `eval`/`new Function`. Use the render tools to verify.
- `render_selection` renders an empty checkerboard when the selected nodes span nearly the whole
  spread — select a single node for a close-up.
- A render can fail with `authorization channel closed`; that is a transient bridge error, retry once.

## Maintaining the skill

`SKILL.md` is the source of truth. When you discover non-obvious SDK behaviour by experiment:

1. Add the finding to `SKILL.md` (Gotchas / Recipes / Node definitions as appropriate).
2. Record a short, factual hint with `add_sdk_hint` so other sessions benefit.
3. Keep any scripts you save directly executable — no `module.exports.main`, matching the Script
   rules in `SKILL.md`.
