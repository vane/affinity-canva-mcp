---
name: affinity-mcp
description: Use when working with Affinity by Canva via the Affinity MCP server — writing and running Affinity JavaScript SDK scripts with execute_script, inspecting or editing documents, spreads, artboards, nodes, shapes, curves, text, fills and exports, drawing vector line-art illustrations from overlapping parts, and verifying results with render_spread/render_selection. Covers the mandatory preamble/doc-read workflow, the SDK module map, the document/node/selection object model, node definitions and z-order, commands and bool-op welding, geometry and curve building, colour, units, text formatting, raster pixels, export, permission limits, and hint recording.
---

# Affinity MCP

The Affinity MCP runs JavaScript inside Affinity by Canva through the SDK bridge. There is no
"apply effect" tool — everything is a script. Your job is to read the right docs, write one
directly-executable script, run it, and visually confirm the result.

## When to use

Trigger this skill whenever the user asks to create, edit, analyse, automate or script anything in
Affinity — documents, spreads, artboards, layers, shapes, curves, illustrations/line-art, text,
fills, strokes, raster edits, exports, or custom dialogs — and the Affinity MCP tools are present.

## Mandatory start sequence

Skipping step 1 makes every other SDK-doc tool fail with
`ERROR: The preamble documentation topic has not yet been read.`

1. `read_sdk_documentation_topic("preamble")` — required once per Affinity session. An Affinity
   restart resets session state, so re-read it.
2. `search_sdk_hints("<problem>")` — check prior sessions before you experiment.
3. `read_sdk_documentation_topic(...)` for the modules you will actually use.
4. `list_sdk_documentation()` to discover topics, examples and the range JSON files.
5. Confirm the MCP tool names you plan to use are actually available.

After solving something by experimentation, call `add_sdk_hint` immediately with the finding.

## Tool map

| Tool | Purpose | Permission required |
| --- | --- | --- |
| `execute_script` | Run JavaScript in Affinity. Returns **nothing** — use `console.log`. | Script execution |
| `render_spread` | Render a spread. Args: `document_session_uuid` (`doc.sessionUuid`), `spread_index` (0-based). | none |
| `render_selection` | Render the current selection in isolation. Arg: `document_session_uuid`. | none |
| `list_sdk_documentation` | List all SDK doc topics. | none |
| `read_sdk_documentation_topic` | Read one topic. Preamble must be read first. | none |
| `search_api_docs` | Full-text search of the bundled API reference. | none |
| `search_manual_docs` | Full-text search of the Affinity user manual. | none |
| `search_sdk_hints` | Search hints recorded by other sessions. | none |
| `add_sdk_hint` | Record a hard-won finding for future sessions. | **Additional permission** — task hints |
| `list_library_scripts` / `read_library_script` | Read scripts stored in the library. | **Additional permission** — library read |
| `save_script_to_library` | Store a working script for reuse. | **Additional permission** — library write |
| `report_sdk_issue` | Report a genuine SDK bug. | **Additional permission** — SDK issue reporting |

Tools marked **Additional permission** need that toggle enabled in Affinity's settings. When it is off the
call fails with a specific message (e.g. *"Adding hints to the preamble has been disabled in Affinity
settings."*) — tell the user which permission is missing instead of retrying. Tools marked `none` work
with every toggle disabled. See *Permissions* for the state observed in the current session.

**Filesystem and network are not tools.** They gate `fs.js` and `network.js` *inside* `execute_script`,
so a script using them fails with `PERMISSION_DENIED` even though the tool itself is available — they
also need **additional permission**. See *Permissions*.

**Output formats to expect** (verified; the server does not return structured JSON for these):

- `list_sdk_documentation` returns **one comma-separated string**, not a JSON array — split on `", "`.
- `search_sdk_hints` returns an **empty string** when nothing matches. That means "no hints", not a
  failed call.
- `render_spread` / `render_selection` return a base64 JPEG capped at **1024 px** on the longest side,
  with no format or size parameter — plan detail checks around that limit.
- Errors arrive as plain sentences (e.g. `No document with that Uuid exists.`), sometimes ending in a
  colon. See the Error catalogue.

### Which tool for what

| Need | Use |
| --- | --- |
| Change anything in a document | `execute_script` |
| Check the whole spread | `render_spread` |
| Inspect a single node closely | `render_selection` with only that node selected |
| Look up SDK behaviour | `read_sdk_documentation_topic`, `search_api_docs` |
| Check what earlier sessions found | `search_sdk_hints` |
| Reuse a proven script | `list_library_scripts` → `read_library_script` → `save_script_to_library` — requires the library permissions; if unavailable, hand the script over inline |
| Record a finding for later sessions | `add_sdk_hint` — requires the task-hints permission; if unavailable, state it in your reply |
| Report a real SDK defect | `report_sdk_issue` |

`execute_blender_code*`, `get_blendfile_summary_*`, `render_viewport_to_path`,
`render_thumbnail_to_path` and `jump_to_view3d_*` belong to a **separate Blender MCP server**.
Do not use them for Affinity work.

## SDK sources (JSLib.zip — optional, but preferred)

The SDK's JavaScript library — the same sources behind `read_sdk_documentation_topic` — is published
as a zip per SDK build:

```
https://sdk.affinity.studio/33001/JSLib.zip
```

The path segment (`33001` here) identifies the SDK build; use the segment matching your installed
Affinity version.

**How to use it**

1. Download the zip and extract it to a scratch location outside this skill folder (for example
   `docs/` in the workspace, or a temp directory). Do **not** commit the extracted files — they are
   large and disposable.
2. Read the extracted `.js` files with the normal file tools instead of the MCP doc tools. This is
   much faster and immune to context-server timeouts. Expect the same layout as the doc topics:
   - `document.js`, `nodes.js`, `commands.js`, `selections.js`, `geometry.js`, `shapes.js`, `fills.js`,
     `colours.js`, `linestyle.js`, `story.js`, `storybuilder.js`, `fonts.js`, `units.js`, `dialog.js`,
     `rasterobject.js`, `pixelaccessor.js`, … — the wrappers you `require('/…')`.
   - `examples/*.js` — runnable patterns (`makeGrid`, `stepAndRepeat`, `textOnCurvesAndShapes`, …).
   - `tests/*.js` — sometimes stale; use for ideas only, don't trust them.
   - `param_ranges.min.json`, `struct_ranges.min.json`, `struct_array_sizes.min.json` — the parameter
     range and fixed-array data referenced under Script rules.
3. When a symbol's signature or a struct field is unclear, read the relevant source file directly
   (`docs/nodes.js`, `docs/geometry.js`, …) rather than round-tripping through
   `read_sdk_documentation_topic`.

**It is a mirror, not a replacement for the preamble step.** Still call
`read_sdk_documentation_topic("preamble")` first — skipping it makes every other doc tool fail. If
network access is unavailable, fall back to `read_sdk_documentation_topic` and `search_api_docs`.

**Protocol version check.** The MCP server implements exactly one protocol version (`2025-11-25` in
Affinity 3.3.1). It lives in the MCP library, not in `Contents/Resources`:

```bash
grep -a -o -E "20[0-9]{2}-[0-9]{2}-[0-9]{2}" \
  /Applications/Affinity.app/Contents/Frameworks/liblibmcp.dylib | sort -u
```

## Transport and connectivity

The server speaks **legacy SSE**, not Streamable HTTP:

- `GET /sse` (default `http://[::1]:6767/sse`) opens the stream.
- The first event is `event: endpoint` — the URL to POST JSON-RPC messages to.
- Responses arrive as `event: message`. `event: heartbeat` also occurs and must be **ignored**; unknown
  event types are not errors.
- Protocol version `2025-11-25`; anything else is rejected with `Unsupported protocol version`.
- Methods implemented: `initialize`, `notifications/initialized`, `ping`, `tools/list`, `tools/call`,
  `resources/list`, `resources/read`, `resources/subscribe`, `resources/templates/list`. There is
  **no** `prompts/*`, `sampling/*`, `completion/*` or `logging/*` — don't plan around them.
- The server may be fronted by a **stdio↔SSE bridge**; tool behaviour is identical either way. If
  calls cannot connect, check the bridge/endpoint before suspecting your script.

Server toggles live in `~/Library/Preferences/com.canva.affinity.plist` (`EnableMCPServer`). Four
features can be disabled individually and report it clearly: hint recording, library reads, library
saves, and issue reporting.

## Script rules

- SDK wrappers: `require('/document.js')`, `require('/nodes.js')`, … — leading slash.
- Native APIs: `require('affinity:dom')`, `require('affinity:geometry')`, `require('affinity:common')`,
  `require('affinity:story')`, `require('affinity:fills')`, `require('affinity:raster')`,
  `require('affinity:linestyles')`, `require('affinity:fonts')`, `require('affinity:ui')`, …
- Scripts must be **directly executable**. Do not copy the examples' `module.exports.main = main;`
  — call your code at top level.
- Output only via `console.log(...)`. Prefer `const { inspect } = require('/inspect.js')` and
  `console.log(inspect(obj, { depth: 3, getters: true }))` over dumping raw handle objects.
- Enum values are objects; compare with `.value` (`FillType.Solid.value`). Inspect valid members
  with `.keys`, `.values`, `.entries` (properties, not methods).
- If a native call returns `NOT_ALLOWED`, the user has disabled AI, filesystem or networking in
  Affinity settings — tell them rather than retrying.
- Check `param_ranges.min.json`, `struct_ranges.min.json` and `struct_array_sizes.min.json` before
  passing numeric parameters to native APIs or setting struct fields.

Verified enum members (Affinity 3.3.1):

```
UnitType.keys        = Number, Percentage, Permille, Degree, Radian, Pixel, Inch, Point,
                       Millimetre, Centimetre, Metre, Foot, Yard, Cat, Pica, Kilometre, Mile, Byte, …
FillType.keys        = Unknown, None, Solid, Gradient, Bitmap, Mesh, Hatch, Diffusion
RasterFormat.keys    = RGBA8, RGBA16, IA8, IA16, CMYKA8, LABA16, M8, M16, EMPTY, RGBAUF, MF
FontWeight.keys      = Thin, ExtraLight, Light, Normal, Medium, SemiBold, Bold, ExtraBold, Black
FontWidth.keys       = UltraCondensed, ExtraCondensed, Condensed, SemiCondensed, Normal,
                       SemiExpanded, Expanded, ExtraExpanded, UltraExpanded
LineCap.keys         = Butt, Square, Round
LineJoin.keys        = MiterLegacy, Miter, Round, Bevel
LineType.keys        = None, Solid, Dash, Texture
StrokeAlignment.keys = Centre, Inside, Outside
NodeChildType.keys   = Main, Enclosure, MasterSpread, WrapShape, StoryPin
InsertionMode.keys   = Default, Inside_AtBack, Inside_AtFront, Behind, Top
DialogResult.keys    = Cancel, Ok
ShapeCornerType.keys = Round, Straight, RoundInverse, Cutout, None
SpatialAnchor.keys   = None, TopLeft, CentreLeft, BottomLeft, TopCentre, Centre, BottomCentre,
                       TopRight, CentreRight, BottomRight, FocalPoint
```

Note `FontWeight` uses `Normal`, not `Regular`.

## Permissions (this setup)

Every capability below is a **user-controlled toggle** in Affinity's settings, and they change between
sessions. **Check the live state before relying on any of them:**

```js
const { Application } = require('/application.js');
const fs = require('/fs.js');
console.log('desktop:', Application.userDesktopPath);
console.log('code-from-strings:', Application.settings.allowCodeGenerationFromStrings);
try { console.log('fs ok:', fs.exists(Application.userDesktopPath)); }
catch (e) { console.log('fs:', e.message); }
```

State observed on **2026-11-01** (Affinity 3.3.1, macOS):

| Capability | State | Effect when off |
| --- | --- | --- |
| **Filesystem** (`fs.js`) | **DISABLED** | `fs.*`, `File.*` → `PERMISSION_DENIED` |
| **Network** (`network.js`) | **DISABLED** | `HttpRequest.do()` → `PERMISSION_DENIED` |
| **Export to Desktop** (`doc.export`) | **DISABLED** | Depends on filesystem access → `PERMISSION_DENIED` |
| **`eval` / `new Function`** | **DISABLED** | `allowCodeGenerationFromStrings` is `false` |
| **Reading script library** | **DISABLED** | `list_library_scripts`, `read_library_script` → *"Reading library scripts has been disabled in Affinity settings."* |
| **Saving to script library** | **DISABLED** | `save_script_to_library` → *"Saving to the scripts library has been disabled in Affinity settings."* |
| **Recording task hints** | **DISABLED** | `add_sdk_hint` → *"Adding hints to the preamble has been disabled in Affinity settings."* |

**Still working:** `execute_script`, `render_spread`, `render_selection`, `read_sdk_documentation_topic`,
`list_sdk_documentation`, `search_sdk_hints`, `search_api_docs`, `search_manual_docs`.

When a call returns `PERMISSION_DENIED` or one of the "disabled in Affinity settings" messages, the
matching toggle is off — **tell the user which one and what you would do if it were enabled**; do not
retry.

### Consequences for your workflow

- **Verify with renders only.** `render_spread` / `render_selection` are the sole visual channel; the
  1024 px cap cannot be bypassed while export is blocked.
- **Do not attempt file I/O** — no reading inputs, no writing outputs, no `doc.saveAs`.
- **Do not rely on the script library.** You cannot save a script for reuse or read one back, so keep
  any reusable script in your reply (or in the conversation) instead.
- **You cannot record hints** via `add_sdk_hint`. Surface findings to the user in your reply instead, and
  note that the shared hint pool will not learn from this session.

### Filesystem API (if the toggle is on)

`require('/fs.js')` exposes **synchronous** helpers directly (`exists`, `getFileSize`, `remove`,
`rename`, `createDirectory`, …), plus `*Async` variants and a `promises` namespace. Read/write goes
through `File`:

```js
const { File } = require('/fs.js');
const fs = require('/fs.js');
const { Application } = require('/application.js');

const path = Application.userDesktopPath + '/out.txt';
const w = File.create(path, 'w');        // 'w' truncates, 'r'/'rb' reads
w.writeStringAsUtf8('hello');
w.close();

const buf = File.readAll(path);          // → Buffer
console.log(buf.toString(), buf.length);

fs.remove(path);
```

Access is scoped to `Application.userDesktopPath` (`~/Desktop`); `/tmp` and repo paths fail with
`PERMISSION_DENIED` even when the toggle is on.

### Network API (if the toggle is on)

```js
const { HttpRequest, RequestMethod } = require('/network.js');
const req = HttpRequest.create('https://example.com', RequestMethod.Get);
req.setTimeoutInSec(15);
const res = req.do().response;
console.log(res.statusCode, res.content.length);
```

- `RequestMethod` has only **`Get`** and **`Post`**.
- `res.statusCode` is a **`HttpStatusCode` enum name** (`Ok`, `Forbidden`, …), not a number.
- Headers via `req.setHeaderValue(key, value)`; the wrapper exposes **no request-body setter**, so
  POSTs cannot carry a payload.
- `req.do()` is synchronous; `doAsync(callback)` exists for non-blocking use.

## Object model

```
Document
 ├─ rootNode (DocumentNode)
 │   └─ spreads (SpreadNode) → layers (GroupNode/ContainerNode/…) → leaf nodes
 └─ selection (Selection) → SelectionItem → Node
```

Entry points:

- `Document.current` — front document or `null`. `Document.all` — every open document.
- `Document.load(path)`, `Document.create(options)`, `Document.createFromPreset(preset, isLandscape)`.
- `NewDocumentOptions.createDefault()` — then set `units`, `width`, `height`, `dpi`, `viewDpi`,
  `margins`, `marginsEnabled`, `bleed`, `rasterFormat`, `colourProfile`, `createArtboard`,
  `pageCount`, `isMultiPage`, `isFacing`, `isVerticalStack`, `isDoublePageStart`, `imagePlacement`,
  `useDrawingScale`, `drawingScale`, `createMaster`.
- `DocumentPreset.all` — available presets.
- `doc.addNode(nodeDefinition, targetNode = null, childList = NodeChildType.Main, preview)`.
- `doc.executeCommand(command, preview)`.
- `doc.selection` — get/set. Set with `Selection.create(doc, nodes)`; `null` clears.
- `doc.selection.nodes` — a lazy `Collection`; call `.toArray()` to materialise.
- `doc.currentSpread`, `doc.spreads`, `doc.layers`, `doc.artboards`, `doc.hasArtboards`.
- `doc.dpi`, `doc.units`, `doc.rasterFormat`, `doc.unitValueConverter`.
- `doc.undo()`, `doc.redo()`, `doc.history` (`items`, `position`, `undoDescription`).
- `doc.sessionUuid` — pass to `render_spread` / `render_selection`.
- `doc.sizePixels` / `widthPixels` / `heightPixels`.
- `doc.pageCount`, `doc.spreadCount`, `doc.isDirty`, `doc.isReadOnly`, `doc.title`, `doc.path`.

**Critical:** setting `doc.currentSpread` clears the selection. Set the spread first, then select.

### Working with documents

- `Document.all` is a **plain Array**, not a `Collection` — `Document.all.toArray()` throws
  `toArray is not a function`. Use `length` and index access.
- `Document.current` returns a **new wrapper object on every access**, so
  `Document.all[i] === Document.current` is `false` even for the same document. Compare by
  `sessionUuid` (or `title`) instead.
- **Several documents can be open at once.** Confirm which one you are editing via `doc.sessionUuid`
  before mutating; never assume the front document is the one you drew into.
- There is **no `Document.close()`** — a document created by a script cannot be closed through the
  SDK. Prefer editing the current document (clear and redraw) over `Document.create`, and tell the
  user when you leave a new document open.
- `doc.sessionUuid` is the only way to address a document for `render_spread` / `render_selection`,
  and no tool lists documents — log the uuid whenever you create or select one.

Spread/artboard sizing and properties:

- `doc.setSpreadSizeWithAnchor(spreadNode, width, height, anchor)`
- `doc.setArtboardSizeWithAnchor(artboardInterface, width, height, anchor)`
- `doc.setDocumentProperties(props)`, `doc.setSpreadDocumentProperties(spreadNode, props)`,
  `doc.setArtboardDocumentProperties(artboardInterface, props)`,
  `doc.setPageDocumentProperties(spreadNode, page, props)`
- `DocumentProperties.create()` — `dimensions`, `dpi`, `units`, `margin`, `bleed`, `isPortrait`,
  `isFacingPages`, `isVerticalStack`, `isTransparent`, `colourFormat`, `colourProfile`, …

## Node definitions

Create nodes from a `*NodeDefinition`, then insert with `doc.addNode(def)`.

**`doc.addNode` returns `undefined`** — the new node is left selected, so capture it:

```js
const def = PolyCurveNodeDefinition.create(pc, brushFill, lineFill, lsd, noneFill);
def.userDescription = 'Body';
doc.addNode(def);
const node = doc.selection.nodes.toArray()[0];
```

**Z-order is insertion order**: each new node lands on top of the spread. Create back-most parts
first and front-most last (e.g. horns/legs/arms → body → face).

`ShapeNodeDefinition.create` and `PolyCurveNodeDefinition.create` take a **`LineStyleDescriptor`**,
not a raw `LineStyle` (a `LineStyle` throws
`expected parameter lineStyleDescriptor to be LineStyleDescriptorHandle`):

```js
const ls  = LineStyle.create({ weight: 5, cap: LineCap.Round, join: LineJoin.Round });
const lsd = LineStyleDescriptor.create(ls, { strokeAlignment: StrokeAlignment.Centre });
```

`PolyCurveNodeDefinition.create(curve, brushFill, lineFill, lineStyle, transparencyFill)`
dereferences `.handle` on **every** argument, so all five must be non-null — pass
`FillDescriptor.createNone()` for the transparency fill.

| Definition | Construction |
| --- | --- |
| `ShapeNodeDefinition` | `create(shape, rect, brushFill, lineFill, lineStyle, transparencyFill)` (Colours or FillDescriptors), or `createDefault()` then `.shape = …`, `.setBoundingRectangle(rect)` |
| `FrameTextNodeDefinition` | `createFromStoryBuilder(frameBox, storyBuilder)` |
| `ArtTextNodeDefinition` | `createFromStoryBuilder(position, storyBuilder)` |
| `PolyCurveNodeDefinition` | `createDefault()` then `.setCurves(polyCurve)`, or `create(polyCurve, brushFill, lineFill, lsd, transparencyFill)` — first arg is a **`PolyCurve`**, not a `Curve` (add yours with `pc.addCurve(curve)`), and all five args are required |
| `ImageNodeDefinition` | `create(rasterFormat)` then `.setBitmap(rasterObject)` |
| `RasterNodeDefinition` | `create(rasterFormat)` then `.setBitmap(rasterObject)` |
| `GroupNodeDefinition` | `createDefault()` |
| `ContainerNodeDefinition` | `create(name)` |
| `TableTextNodeDefinition` | `create(box, size)` |
| `MeasurementNodeDefinition` | `create(start, end, factor, unitType)` |

Every `VectorNodeDefinition` (shapes, images, poly-curves) also supports:

- `.setPictureFrameEnabled(true)` — turn a shape into a picture frame
- `.addBrushFillDescriptor(colourOrDescriptor)`, `.addLineDescriptors(fill, lineStyle)`
- `.setTransparencyDescriptor(descriptor)`
- `.transform = xf`, `.userDescription = "…"`

Typed nodes come back from `createTypedNode(handle)` and from anything that returns nodes. Test type
with the boolean flags: `isShapeNode`, `isVectorNode`, `isTextNode`, `isFrameTextNode`,
`isImageNode`, `isRasterNode`, `isGroupNode`, `isContainerNode`, `isSpreadNode`,
`isPolyCurveNode`, `isEmbeddedDocumentNode`, `isMeasurementNode`, …

Node geometry and identity:

- `node.getSpreadBaseBox(includeClips = true)` → `Rectangle` in spread space — use for layout.
- `node.baseBox`, `node.spreadBaseBox`, `node.localVisibleBox`, `node.getSpreadVisibleBox()`.
- `node.transform`, `node.baseToSpreadTransform`, `node.localToSpreadTransform`.
- `node.children` (`NodeChildren`, `.all` descends), `node.parent`, `node.nextSibling`.
- `node.selfSelection`, `node.duplicate(transform)`, `node.delete()`.

Node editing shortcuts on `doc` (all `(value, selection, options, preview)`; pass `null` selection to
use the current one): `setBrushFillDescriptor`, `setPenFillDescriptor`,
`setTransparencyFillDescriptor`, `setLineStyle`, `setLineStyleDescriptor`, `setLineWeight`,
`setLineWeightPts`, `setLineCap`/`setLineJoin`/`setLineType`, `setDashPattern`, `setDashPhase`,
`setBalancedDashes`, `setStrokeAlignment`, `setOpacity`, `setBrushFillOpacity`,
`setLineFillOpacity`, `setBlendMode`, `setTagColour`, `setLayerDescription`, `setShape`,
`setShapeFloatParam`/`IntParam`/`BoolParam`/`EnumParam`.

Structural/geometry commands: `boolOpUnion`/`Subtract`/`Intersect`/`Xor`, `divideShapes`,
`convertToCurves`, `smoothCurves`, `breakCurves`, `joinCurves`, `mergeCurves`, `separateCurves`,
`reverseCurves`, `rasteriseObjects`, `flatten`, `mergeDown`, `mergeSelected`, `mergeVisible`,
`applyTransform(transform, selection, options, preview)`,
`applyGroupTransform(xData, yData, selection, preview)`, `flipCanvas(isHorizontal)`.

AI/raster commands: `generateImage(prompt)`, `generativeEditImage(prompt)`, `removeBackground()`,
`selectSubject()`, `detectDepth()`, `colourise()`,
`imageTrace(edgeThreshold, curveFittingTolerance, selection, preview)`, plus the `raster*`
selection/adjustment/fill commands.

`boolOpUnion(selection, preview)` returns `undefined` and leaves the merged `PolyCurveNode`
**selected**. It keeps the brush fill and stroke, so welding several white-filled, black-stroked
shapes yields one clean silhouette with **no internal seam lines** — the standard way to build
cartoon-style artwork out of overlapping parts. Note it produces sharp corners where the source
shapes intersect. See the welded line-art recipe below.

## Selections

```js
const { Selection, TextSelection } = require('/selections.js');
doc.selection = Selection.create(doc, nodes);   // select nodes
doc.selection = null;                            // clear
console.log(doc.selection.nodes.toArray().length);
```

`Selection.create(document, items, removeNested)` accepts a node, a `SelectionItem`, a `Selectable`
or any iterable of them. Sub-selections cover curve nodes/edges, fills, line fills, transparency,
tables and text: `TextSelection.create([{ begin, end }])` then
`selection.addSubSelectionForNode(node, subSel)`.

## Commands

```js
const { DocumentCommand, AddChildNodesCommandBuilder, CompoundCommandBuilder } = require('/commands.js');

const builder = AddChildNodesCommandBuilder.create();
builder.setInsertionTarget(parentNode);        // optional
builder.setInsertionMode(InsertionMode.Top);    // Default | Inside_AtBack | Inside_AtFront | Behind | Top
builder.autoName = true;
builder.addNode(definition);
const cmd = builder.createCommand(true /* andSelect */);
doc.executeCommand(cmd);
console.log(cmd.newNodes.length);
```

`AddChildNodesCommandBuilder` also has typed adders: `addShapeNode`, `addImageNode`,
`addPolyCurveNode`, `addRasterNode`, `addContainerNode`, `addTableTextNode`, `addMeasurementNode`,
plus adders for every adjustment/filter raster node. Flags: `autoName`, `forcePixelAlignment`,
`clearCurrentSelection`, `appendCurrentSelection`, `setInsertionTarget`,
`setInsertionTargetSelection`, `setInsertionMode`.

**Batch creation is ~50× faster.** Measured on an 800×600 px document: **250 nodes via one
`AddChildNodesCommandBuilder` command took 4 ms**, while **50 nodes via per-node `doc.addNode` took
93 ms** (~1.9 ms each). For more than a handful of nodes, build one command and call
`createCommand(true)` so the new nodes come back selected. Other measured costs: select 300 nodes
2 ms, recolour 300 nodes 24 ms, transform 300 nodes 2 ms, boolean union of 150 circles 198 ms, delete
301 nodes 149 ms.

Compound and transform commands:

```js
const compound = CompoundCommandBuilder.create();
compound.addCommand(cmdA);
compound.addCommand(cmdB);
doc.executeCommand(compound.createCommand());

doc.executeCommand(DocumentCommand.createTransform(
    selection, transform, { mergeable: true, duplicateNodes: false }));
```

`DocumentCommand.createTransform(selection, xf, { mergeable, cloneRaster, correctChildren,
duplicateNodes })`. `DocumentCommand.createSetBrushFill(selection, colourOrDescriptor,
{ contentType, fillMask, copyTransform, useTextSelection, maintainBlendMode, restoreAspectRatio })`.
`DocumentCommand` also exposes `createSetSelection`, `createDeleteSelection`, `createSetCurrentSpread`,
`createSetDocumentProperties`, `createSetExportConfig`, `createUndo`/`createRedo`,
`createClearPreviews`, and a `create*` factory for essentially every document operation. Commands
expose `newNodes` after execution.

## History and undo

- `doc.undo()` / `doc.redo()` work, but **undo is slower than redo** (~11 ms vs ~2 ms per step on a
  300-node document).
- `doc.history.undoDescription` **throws `INVALID_OP`** when the history is empty (a freshly opened
  document). Guard the read, or check `doc.history.position > 0` first — `position` is always safe.
- `doc.history.position` can read **stale inside a large batch**: after 56 `doc.undo()` calls in one
  script it still reported 56, even though the undos had applied (a redo round trip restored the
  document exactly). Batches of ~20 report correctly. **Assert on node counts, not on `position`.**
- Undo is cheap for experimentation, but for repeated redraws prefer clear-and-redraw in place
  (see Recipes) so the history does not grow without bound.

## Geometry, colour, fills, strokes

```js
const { Point, Vector, Rectangle, Size, Transform, Curve, CurveBuilder, PolyCurve, Polygon, Spline } =
    require('/geometry.js');
new Rectangle(x, y, width, height);
Transform.createTranslate(x, y).multiply(Transform.createScale(sx, sy));
Transform.createRotate(rads); Transform.createIdentity();
Curve.createRectangle(rect); Curve.createEllipse(rect); Curve.createLineXY(x1, y1, x2, y2);
```

`CurveBuilder` builds curves directly in spread coordinates — the reliable way to make precise
custom shapes (better than fighting node transforms):

```js
const b = CurveBuilder.create()
    .beginXY(x0, y0)
    .lineToXY(x1, y1)
    .addBezierXY(c1x, c1y, c2x, c2y, endx, endy)
    .close();
const curve = b.createCurve();      // → Curve
const pc = PolyCurve.create();      // node definitions want a PolyCurve
pc.addCurve(curve);
```

Circular/elliptical arcs as beziers — for an arc from angle `a1` to `a2`, with point `p` and
derivative `t` taken from the ellipse parametrisation:

```js
const k = (4 / 3) * Math.tan((a2 - a1) / 4);   // ≈ 0.5523 for a quarter arc
b.addBezierXY(p1.x + k * t1.x, p1.y + k * t1.y,
              p2.x - k * t2.x, p2.y - k * t2.y, p2.x, p2.y);
```

`k` flips sign automatically when `a2 < a1`, so the same formula draws arcs either way. Use it for
circles (4 quarter arcs), ellipses, and **capsules** (straight sides + two semicircular caps, which
hold a constant width — unlike an ellipse, which tapers to points at both ends).

`PolyCurveNode` (the node) has **no** `curves` setter — only `PolyCurveNodeDefinition` does. To
change an existing node's geometry, delete it and add a replacement.

```js
const { RGB8, RGBA8, RGB16, CMYK8, HSLf, LAB16, SVG11, Colour, Gradient, ColourProfile } =
    require('/colours.js');
RGB8(255, 0, 0); RGBA8(0, 128, 255, 128); SVG11.tomato;
Gradient.create([{ colour: RGB8(255,0,0), position: 0 }, { colour: RGB8(0,0,255), position: 1 }]);
```

```js
const { SolidFill, GradientFill, HatchFill, BitmapFill, MeshFill, DiffusionFill,
        FillDescriptor, makeFillDescriptor, FillType } = require('/fills.js');
FillDescriptor.createSolid(colour);          // most doc setters accept a bare Colour too
SolidFill.create(colour);
GradientFill.create(gradient, gradientFillType);
```

```js
const { LineStyle, LineStyleDescriptor, LineStyleMask, LineCap, LineJoin, LineType,
        StrokeAlignment, ArrowHead, ArrowHeadStyle } = require('/linestyle.js');
const ls = LineStyle.create({ weight: 4, cap: LineCap.Round, join: LineJoin.Round });
doc.setLineStyle(ls, selection, { lineStyleMask: LineStyleMask.Weight });
const lsd = LineStyleDescriptor.create(ls, { strokeAlignment: StrokeAlignment.Centre });
```

## Shapes

`require('/shapes.js')` exports `Shape` plus every concrete class, all with `.create()`:
`ShapeRectangle`, `ShapeEllipse`, `ShapePolygon`, `ShapeStar`, `ShapeDoubleStar`,
`ShapeSquareStar`, `ShapeTriangle`, `ShapeDiamond`, `ShapeTrapezoid`, `ShapeArrow`, `ShapePie`,
`ShapeCloud`, `ShapeCog`, `ShapeCrescent`, `ShapeHeart`, `ShapeSpiral`, `ShapeTear`,
`ShapeCalloutRectangle`, `ShapeCalloutEllipse`, `ShapeSegment`, `ShapeQRCode`, `ShapeCat`…`ShapeCat4`.
Parameters are properties or `set*` methods, e.g.
`rect.topLeft.setRadius(12, w, h)`, `rect.cornerType = ShapeCornerType.…`,
`star.points = 5`, `poly.sides = 6`.

## Text

```js
const { StoryBuilder } = require('/storybuilder.js');
const { FrameTextNodeDefinition, ArtTextNodeDefinition } = require('/nodes.js');

const sb = StoryBuilder.create();
sb.setToFrameTextDefaultStyle(doc.dpi, doc.rasterFormat);   // or setToArtisticTextDefaultStyle
sb.addText("Hello");
sb.addParagraphBreak();
sb.addText("World");

doc.addNode(FrameTextNodeDefinition.createFromStoryBuilder(new Rectangle(x, y, w, h), sb));
```

Styling while building:

- `GlyphAtts` (`/glyphatts.js`): `font`, `height`, `characterSpacing`, `baselineAdvance`,
  `leadingOverrideType`, `capsType`, `superSubType`, `underlineType`, `strikeoutType`,
  `brushFill`/`penFill`/`transparency`/`highlightFill`/`underlineFill`/`strikeoutFill`,
  `lineStyleDescriptor`. Generic access via `getDoubleValue`/`setDoubleValue(GlyphAttDoubleType.X)`.
- `ParagraphAtts` (`/paragraphatts.js`): `alignXType` (`ParagraphAlignXType`), `leadingType`,
  `relativeLeading`, `absoluteLeading`, `leftIndent`, `rightIndent`, `firstLineIndent`,
  `spaceBefore`, `spaceAfter`, `isAutoHyphenate`, `isKeepTogether`, …
- Apply to the builder with `sb.setGlyphAtts(...)`, `sb.setParagraphAtts(...)`,
  `sb.applyGlyphDelta(...)`, `sb.applyParagraphDelta(...)`.

Editing existing text nodes: `node.text`, `node.getText(startPos, maxLength, format)`,
`node.setText(str)`, `node.storyRange`, `node.story`, `node.storyInterface`.

`Story` (`/story.js`) offers `getGlyphAtts(pos)`, `getParagraphAtts(pos)`, `attRuns`,
`wordRanges`, `paragraphRanges`, `getTextRange(range)`. Format a range with `StoryDelta`
(`/storydelta.js`): `StoryDelta.createFont(fields, font)`, `createItalic(true)`,
`createAlignX(type)`, `createBrushFill(descriptor)`, `createComposite([...])`; then
`doc.formatText(delta, selection, preview)` with a `TextSelection` sub-selection.

Fonts (`/fonts.js`): `Font.all`, `Font.create(family, weight, isItalic, width)`,
`FontFamily.all`, `FontWeight`, `FontWidth`, `FontField`. `doc.getFontNames()` lists installed
font names.

## Units and DPI

- Spread coordinates are **pixels** at `doc.dpi`. Points→pixels is `doc.dpi / 72`; use
  `doc.unitValueConverter` and `UnitType` (`/units.js`) for anything user-facing.
- Guides are in 96-DPI pixels: `doc.addGuide(horizontal, pixels96, preview)`,
  `doc.moveGuide(...)`, `doc.removeGuide(...)`, `doc.setGuidesColour(...)`.

## Export

```js
const { FileExportOptions, FileExportArea } = require('/document.js');
const opts = FileExportOptions.createWithPresetName(FileExportOptions.allPresetNames[0]);
const records = doc.export(path, opts, FileExportArea.createForWholeDocument());
records.all.forEach(r => console.log(r.path, r.isSuccess, r.errorMessage));
```

Areas: `createForWholeDocument`, `createForCurrentSpread`, `createForCurrentPage`,
`createForArtboard(artboard)`, `createForSelection(selection)`, `createForSelectionArea(...)`,
`createForPages([...])`, `createForSpreads([...])`.

**Export requires filesystem permission, which is currently DISABLED** — `doc.export(...)` fails with
`PERMISSION_DENIED`, as do `doc.saveAs` / `doc.saveAsPackage` / `doc.save`. If the user enables it,
export writes to `~/Desktop` only; presets include `PNG`, `JPEG (High quality)`,
`SVG (digital - high quality)`, `PDF (digital - high quality)`, `TIFF`, `PSD`, `WebP` — enumerate with
`FileExportOptions.allPresetNames`. Exporting at full resolution bypasses the 1024 px render cap, so it
is the better verification channel when available.

For per-node export settings use `node.exportConfig` (`ExportConfig` from `/exportconfig.js`) with
`ExportFormat`/`ExportScale`/`ExportSize`, and apply it via
`DocumentCommand.createSetExportConfig(...)` or `doc.setDocumentProperties`. Save with
`doc.saveAs(path)` / `doc.saveAsPackage(path, policy)` / `doc.save()`.

## Raster pixels

```js
const { Bitmap, PixelBuffer, NodeRenderingEngine, RasterFormat } = require('/rasterobject.js');
const { createPixelReader, createPixelReaderWriter } = require('/pixelaccessor.js');

const bmp = Bitmap.create(w, h, RasterFormat.RGBA8);      // or Bitmap.loadFromFile(path, format)
const rw = createPixelReaderWriter(bmp);
rw.writePixel(10, 10, { r: 255, g: 0, b: 0, alpha: 255 });
console.log(rw.readPixel(10, 10));
rw.dispose();                                             // always dispose accessors
```

`PixelBuffer.buffer` exposes the raw `ArrayBuffer`. `NodeRenderingEngine.create(node, format,
options)` renders a node into a raster object. Pixel accessors exist per format (RGBA8/16, RGBAuf,
IA8/16, CMYKA8, LABA16, M8/16, Mf).

## Dialogs

Use the Dialog API for any UI the user asks for — never build ad-hoc UI. Structure is
`Dialog → DialogColumn → DialogGroup → controls`.

```js
const { Dialog, DialogResult } = require('/dialog.js');
const { UnitType } = require('/units.js');

const dlg = Dialog.create("Title");
const col = dlg.addColumn();
const group = col.addGroup("Options");

dlg.amount = group.addUnitValueEditor("Amount", UnitType.Number, UnitType.Number, 10, 1, 1000);
dlg.preview = group.addSwitch("Preview", true);
dlg.mode = group.addComboBox("Mode", ["A", "B"], 0);
dlg.onControlValueChangedHandler = () => update(true /* preview */);

while (dlg.runModal().value === DialogResult.Ok.value) { /* commit */ }
```

`DialogGroup.add*`: `addUnitValueEditor(label, units, displayUnits, initialValue, minValue = null,
maxValue = null)`, `addUserUnitValueEditor(...)`, `addSwitch(label, initial)`,
`addCheckBox(label, initial)`, `addComboBox(label, items, initialItem)`,
`addRadioGroup(label, items, initialItem)`, `addButtonSet(label, items, initialItem)`,
`addStaticText(label, text)`, `addTextBox(label, text)`, `addButton(label)`,
`addSpatialAnchor(label, initial)`, `addColourPicker(label, initial)`, `addFontPicker(label)`,
`addFillEditor(label, initial)`, `addStrokeEditor(label, initial)`, `addColumnStack()`.

`Dialog` also has `initialWidth`, `isResizable`, `findControl(id)`, `setItemsVisibility(show, hide)`.
Controls expose `isEnabled`, `label`, `description`, `onValueChangedHandler`, `setIsEnabledBy(...)`.
Previews mutate the document, so capture geometry (boxes, transforms) **before** building preview
commands, and call `doc.clearPreviews()` when done.

## Application and UI

```js
const { Application } = require('/application.js');
Application.version;            // e.g. "Affinity 3.3.1.4940 MacOS …"
Application.platformName;
Application.userDesktopPath;    // the only writable folder, if fs access is granted
Application.settings.allowCodeGenerationFromStrings;
Application.alert(message, title);   // also a global alert(...)
Application.confirm(...); Application.prompt(...); Application.chooseFile();
```

## Module map

| Module | Contents |
| --- | --- |
| `document.js` | `Document`, `DocumentPreset`, `NewDocumentOptions`, `DocumentHistory`, `DocumentSnapshot`, `FileExportOptions`, `FileExportArea`, `LoadDocumentOptions`, `DocumentPromises` |
| `nodes.js` | Every node class and `*NodeDefinition`, adjustment/filter parameters, `createTypedNode`, `NodeChildType` |
| `selections.js` | `Selection`, `SelectionItem`, sub-selections, `TextSelection` |
| `commands.js` | `DocumentCommand`, `AddChildNodesCommandBuilder`, `CompoundCommandBuilder`, `InsertionMode`, `SetHatchFillAttributesCommandBuilder` |
| `geometry.js` | `Point`, `Vector`, `Rectangle`, `Size`, `Transform`, `Curve`, `CurveBuilder`, `PolyCurve`, `PolyPolyCurve`, `Polygon`, `Spline`, `Mesh` |
| `shapes.js` | `Shape` plus every `ShapeX` class, `ShapeType`, corner/enum params |
| `fills.js` | Solid/gradient/hatch/bitmap/mesh/diffusion fills, `FillDescriptor`, `makeFillDescriptor` |
| `colours.js` | `Colour`, `RGB8`/`RGBA8`/`CMYK8`/`HSLf`/`LAB16`, `SVG11`, `Gradient`, `ColourProfile` |
| `linestyle.js` | `LineStyle`, `LineStyleDescriptor`, `LineStyleMask`, `LineCap`/`LineJoin`/`LineType`/`StrokeAlignment`, `ArrowHead` |
| `story.js`, `storybuilder.js`, `storydelta.js` | Story access, building and formatting deltas |
| `glyphatts.js`, `paragraphatts.js` | Character/paragraph formatting |
| `fonts.js` | `Font`, `FontFamily`, `FontCollection`, `FontWeight`/`FontWidth` |
| `units.js` | `UnitType`, `UnitValue`, `UnitValueConverter` |
| `dialog.js` | `Dialog`, `DialogResult`, all dialog controls |
| `documentproperties.js` | `DocumentProperties`, `PageDocumentProperties`, `ArtboardDocumentProperties`, `SpreadDocumentProperties` |
| `exportconfig.js` | `ExportConfig`, `ExportFormat`, `ExportScale`, `ExportSize` |
| `rasterobject.js` | `RasterObject`, `Bitmap`, `PixelBuffer`, `NodeRenderingEngine` |
| `pixelaccessor.js` | `createPixelReader`, `createPixelReaderWriter`, per-format accessors |
| `rasterselection.js` | `RasterSelection` |
| `application.js` | `Application`, `ApplicationSettings`, `app` |
| `inspect.js` | Node-style `inspect`/`format`/`patchConsole` |
| `collection.js` | Lazy `Collection`/`SpanCollection` (`toArray`, `map`, `filter`, `first`, `length`, …) |
| `handleobject.js` | `HandleObject` base, `livePoint`/`liveStruct`/`liveStructArray` |
| `fs.js`, `network.js` | Filesystem and HTTP — gated by permission toggles; see *Permissions* |
| `*interface.js` | Per-node facets: `artboardinterface`, `baseboxinterface`, `blendmodeinterface`, `brushfillinterface`, `curvesinterface`, `descriptioninterface`, `editabilityinterface`, `exportableinterface`, `imageresourceinterface`, `layereffectsinterface`, `linestyleinterface`, `marginsinterface`, `pageboxinterface`, `physicalrootinterface`, `pictureframeinterface`, `rasterinterface`, `shapeinterface`, `taginterface`, `textframeinterface`, `transforminterface`, `transparencyinterface`, `visibilityinterface` |
| `examples/*.js` | Runnable patterns: `makeGrid`, `stepAndRepeat`, `textOnCurvesAndShapes`, `tableFromJson`, `addGuides`, `alignToPage`, … |
| `tests/*.js` | Sometimes stale — use for ideas only |

## Recipes

**Create a document and a full-bleed rectangle**

```js
const { Document, NewDocumentOptions } = require('/document.js');
const { ShapeNodeDefinition } = require('/nodes.js');
const { ShapeRectangle } = require('/shapes.js');
const { Rectangle } = require('/geometry.js');
const { RGB8 } = require('/colours.js');
const { UnitType } = require('/units.js');

const opts = NewDocumentOptions.createDefault();
opts.units = UnitType.Millimetre;
opts.width = 210;
opts.height = 297;
opts.dpi = 300;
const doc = Document.create(opts);

const def = ShapeNodeDefinition.create(
    ShapeRectangle.create(),
    new Rectangle(0, 0, doc.widthPixels, doc.heightPixels),
    RGB8(30, 144, 255));          // brush fill
doc.addNode(def);

console.log(doc.sessionUuid, doc.spreadCount);
```

Then call `render_spread` with `document_session_uuid: doc.sessionUuid, spread_index: 0`.

**Transform the current selection**

```js
const { Transform } = require('/geometry.js');
doc.applyTransform(Transform.createTranslate(40, 40), null, null, false);
```

**Recolour everything selected**

```js
const { RGB8 } = require('/colours.js');
doc.setBrushFillDescriptor(RGB8(255, 120, 0), null, null, false);
```

**Add a text frame and fill it**

```js
const { StoryBuilder } = require('/storybuilder.js');
const { FrameTextNodeDefinition } = require('/nodes.js');
const { Rectangle } = require('/geometry.js');
const { Font, FontWeight, FontWidth } = require('/fonts.js');

const sb = StoryBuilder.create();
sb.setToFrameTextDefaultStyle(doc.dpi, doc.rasterFormat);
const atts = sb.glyphAtts;
atts.font = Font.create("Helvetica", FontWeight.Normal, false, FontWidth.Normal);
atts.height = 48 * doc.dpi / 72;
sb.setGlyphAtts(atts);
sb.addText("Headline");

doc.addNode(FrameTextNodeDefinition.createFromStoryBuilder(
    new Rectangle(40, 40, 400, 200), sb));
```

Validated end-to-end: the definition builds, the brush fill resolves to `FillType.Solid`, and the
glyph height is applied.

**Build welded line-art from overlapping parts**

Draw each part as its own node, then merge the ones that should share one outline. Fills and strokes
survive the union, so white-filled + black-stroked parts weld into a single silhouette:

```js
const parts = [];
parts.push(addCurve(ellipseCurve(310, 240, 150, 150), whiteFill, blackFill, lsd, 'body'));
// …horns, legs, feet…

doc.selection = Selection.create(doc, parts);
doc.boolOpUnion(null, false);            // result stays selected
const welded = doc.selection.nodes.toArray()[0];
welded.userDescription = 'Body';
```

Practical rules learned the hard way:

- **Ellipse vs capsule**: an ellipse tapers to a point at both ends, so limbs built from ellipses
  look like pointed leaves. Use capsules for arms/fingers/tubes; ellipses for palms and blobs.
- **Hide junctions by z-order**: draw an appendage *behind* the body and extend its root well
  inside the body's fill. The body's fill then covers the join and the body's outline stays
  unbroken. A part that merely *touches* the outline will look detached — push the root 15–25 px
  inside.
- **Group only what should share an outline**: welding a whole character into one node destroys
  per-part editability. Weld within a part (arm + palm + fingers) and keep parts separate.
- **Sharp corners** appear where welded shapes intersect — fine for cartoon silhouettes, but avoid
  welding shapes that need a smooth blend.

**Clear a document in place and redraw**

Useful when iterating on the current document instead of spawning a new one:

```js
const doc = Document.current;
doc.selectAll(false);                    // across all layers
doc.deleteSelection(null, false);
console.log(doc.currentSpread.children.all.toArray().length);   // 0
```

## Error catalogue

Messages are plain sentences, sometimes with a trailing colon, and carry no structured context —
match on the text, not on a code.

| Message | Meaning | Action |
| --- | --- | --- |
| `ERROR: The preamble documentation topic has not yet been read.` | Mandatory start skipped | Call `read_sdk_documentation_topic("preamble")` |
| `You MUST read the 'preamble' documentation before using the SDK.` | Same, from the script path | Same |
| `Error: INVALID_OP` when reading `history.undoDescription` | Undo history is empty | Guard the read |
| `authorization channel closed` | Transient render failure | Retry once |
| `No document with that Uuid exists.` | Wrong `sessionUuid` | Re-read `doc.sessionUuid` |
| `Spread index out of bounds.` | `spread_index` out of range (0-based) | Max is `doc.spreadCount - 1` |
| `NOT_ALLOWED` | AI / filesystem / networking disabled in Affinity settings | Tell the user; do not retry |
| `PERMISSION_DENIED` | Filesystem, network or export is toggled off (or a path outside `~/Desktop`) | Tell the user which toggle; do not retry |
| `Reading library scripts has been disabled in Affinity settings.` | `list_library_scripts` / `read_library_script` blocked | Ask the user for the script instead |
| `Saving to the scripts library has been disabled in Affinity settings.` | `save_script_to_library` blocked | Give the script inline in your reply |
| `Adding hints to the preamble has been disabled in Affinity settings.` | `add_sdk_hint` blocked | Surface the finding in your reply |
| `Error: <message>` + stack | Your script threw | Fix the script |

## Gotchas

### Documents

- `Document.current` is `null` when no document is open — guard before doing anything.
- Setting `doc.currentSpread` clears the selection. Order: spread → selection → edit.
- Several documents may be open; identify the target by `sessionUuid` before mutating.
- There is no `Document.close()` — avoid creating stray documents.
- If an operation silently does nothing, check `doc.isReadOnly`, `node.isEditable`/`isLocked`, and
  whether you actually changed the current spread.

### Collections and handles

- `Collection` is lazy; `.length` walks the generator. Prefer `.toArray()` once.
- `Document.all` is an **Array**, not a `Collection` — it has no `.toArray()`.
- Wrap raw handles with `createTypedNode(handle)`, not `new Node(handle)`.
- `HandleObject` requires a non-null handle — never construct one yourself from `null`.

### Node definitions

- `doc.addNode(def)` returns `undefined` — take the new node from `doc.selection` instead.
- `ShapeNodeDefinition.create` / `PolyCurveNodeDefinition.create` need a `LineStyleDescriptor`; a raw
  `LineStyle` throws `expected parameter lineStyleDescriptor to be LineStyleDescriptorHandle`.
- `PolyCurveNodeDefinition.create` requires **all five** args (`FillDescriptor.createNone()` for the
  transparency fill); it dereferences `.handle` on each.
- Nodes stack in insertion order — later `addNode` calls sit on top. Create back-to-front.
- `PolyCurveNode` has no `curves` setter; to re-shape it, delete and re-add the node.
- `LineStyle` weight is in **pixels at `doc.dpi`** (`setLineWeight` sets it directly; use
  `setLineWeightPts` for points).

### Rendering

- `render_spread`'s `spread_index` is 0-based, not a page number.
- `render_selection` renders an **empty checkerboard** when the selected nodes span nearly the whole
  spread (e.g. two arms on opposite sides) — select a single node for a usable close-up.
- Output is capped at **1024 px** on the longest side; there is no format or size parameter. For full
  resolution, export to the Desktop instead (see Export).
- A render can fail with `authorization channel closed`. That is transient, not a script bug — retry
  once.

### Scripts and runtime

- Previews (`preview = true`) actually modify the document. Capture boxes/transforms first.
- `require('/…')` takes a leading slash; native modules use the `affinity:` scheme.
- Examples end with `module.exports.main = main;` — do not copy that.
- Pixel accessors must be `dispose()`d; they are not garbage-collected.

## Verification loop

1. Run the script.
2. `render_spread` the affected spread (or `render_selection` for an isolated look).
3. Log a summary with `inspect` when geometry matters (`getSpreadBaseBox`, counts, colours).
4. Iterate; `doc.undo()` is cheap when experimenting on a real document. For repeated iterations on
   the same document, clear and redraw in place (see Recipes) rather than creating new documents.
5. For detail work, `render_selection` a **single** node — selecting several widely separated nodes
   renders empty, and the output is capped at 1024 px.
6. Retry a failed render once (`authorization channel closed` is transient).
7. When the user is happy, **tell them the script inline** — `save_script_to_library` is disabled, so it
   cannot be stored for reuse.

## Recording knowledge

Call `add_sdk_hint` immediately after discovering something non-obvious by experimentation — a
parameter range, a permission quirk, a working command sequence.

**`add_sdk_hint` is currently disabled** (*"Adding hints to the preamble has been disabled in Affinity
settings."*). When it is off, state the finding in your reply to the user instead, and note that the
shared pool will not learn from this session.

**Keep hints short when they are enabled.** The preamble is delivered to every session before anything
else, and hints accumulate there — each one is a permanent context cost. Write **one or two sentences,
one fact each**, and put explanatory detail in this skill file rather than in the hint pool.
