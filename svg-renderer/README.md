# SVG renderer — run the drawings without Affinity

The drawing scripts in `../examples/scripts/` are written against the Affinity SDK, but they
only touch a small part of it. The `shim/` folder implements exactly that part, so the same scripts run
under plain Node and emit SVG — no Affinity, no MCP, no filesystem permission.

This exists because `doc.export()` writes to disk and filesystem access is disabled in Affinity by
default (`PERMISSION_DENIED`). The shim sidesteps the permission entirely: it never talks to Affinity,
it just computes the geometry and writes the file itself.

## Layout

```
svg-renderer/
├── render.js          # CLI
├── README.md
├── shim/
│   ├── index.js       # module map + runner (renderScriptToSvg / renderFileToSvg)
│   ├── enums.js       # enum helper + UnitType, LineCap, LineJoin, LineType,
│   │                  # StrokeAlignment, FillType, ShapeCornerType, ShapeType,
│   │                  # ShapeArrowEndStyle, ShapeSpiralStyle, ShapeCornerIndex,
│   │                  # ParagraphAlignXType, ParagraphLeadingType, FontWeight, …
│   ├── colours.js     # RGB8, Gradient
│   ├── fills.js       # Fill, SolidFill, GradientFill, FillDescriptor
│   ├── linestyle.js   # LineStyle, LineStyleDescriptor
│   ├── geometry.js    # Rectangle, Curve, CurveBuilder, PolyCurve
│   ├── shapes.js      # Shape + every Shape* class
│   ├── fonts.js       # Font, FontFamily, FontCollection, FontWeight, FontWidth
│   ├── glyphatts.js   # GlyphAtts + character formatting enums
│   ├── paragraphatts.js # ParagraphAtts + paragraph formatting enums
│   ├── storybuilder.js # StoryBuilder
│   ├── storydelta.js  # StoryDelta + formatting delta factories
│   ├── nodes.js       # PolyCurve/Shape/FrameText/ArtText node definitions
│   ├── document.js    # ShimDocument, NewDocumentOptions
│   ├── svg.js         # document -> SVG string
│   └── warnings.js    # approximation warnings, reset per run
└── test/
    ├── shapes-reference.json   # reference shape curves captured from Affinity
    ├── shim-core.test.mjs      # enums, colours, fills, line styles, geometry
    ├── shim-shapes.test.mjs    # shape geometry + reference comparison
    ├── shim-gradients.test.mjs # gradient colours/fills and SVG gradient defs
    ├── shim-document.test.mjs  # document, node definitions, SVG writer
    ├── shim-text.test.mjs      # fonts, glyph/paragraph atts, stories, text SVG
    └── shim-runner.test.mjs    # script runner, module map, warnings
```

`shim/index.js` is the entry point: it builds the `require('/x.js')` module map from the
sibling files and runs the script.

## Usage

```bash
# one drawing (output goes to /tmp/svg-renderer)
node render.js ../examples/scripts/cat.js

# one drawing, explicit output
node render.js ../examples/scripts/cat.js /tmp/cat.svg

# every drawing (input defaults to ../examples/scripts, output to /tmp/svg-renderer)
node render.js --all

# every drawing, explicit in/out folders
node render.js --all ../examples/scripts /tmp/drawings
```

With no output path, SVGs are written to `/tmp/svg-renderer`, so a run never leaves files in the
repository. `--help` prints the resolved path.

Requires Node **18+** (`node:vm`, `node:fs`). No dependencies, nothing to install.

Output looks like:

```
cat.js                   520x800  22 nodes  4955 bytes -> /tmp/svg-renderer/cat.svg
    nodes: Background, Tail, Ear left, Ear right, ...
```

## What it supports

The shim provides these modules, which is everything the drawings require:

| Module | Provided |
| --- | --- |
| `/document.js` | `Document`, `NewDocumentOptions` |
| `/nodes.js` | `PolyCurveNodeDefinition`, `ShapeNodeDefinition`, `TextNodeDefinition`, `FrameTextNodeDefinition`, `ArtTextNodeDefinition` |
| `/shapes.js` | `Shape`, `ShapeRectangle`, `ShapeEllipse`, `ShapeTriangle`, `ShapeDiamond`, `ShapeTrapezoid`, `ShapePolygon`, `ShapeStar`, `ShapeSquareStar`, `ShapeDoubleStar`, `ShapeCloud`, `ShapeCog`, `ShapeArrow`, `ShapePie`, `ShapeCrescent`, `ShapeSegment`, `ShapeTear`, `ShapeHeart`, `ShapeSpiral`, `ShapeCalloutRectangle`, `ShapeCalloutEllipse`, `ShapeQRCode`, `ShapeCat`–`ShapeCat4`, `ShapeType`, `ShapeCornerType`, `ShapeCornerIndex`, `ShapeArrowEndStyle`, `ShapeSpiralStyle` |
| `/geometry.js` | `Rectangle`, `Transform`, `Curve`, `CurveBuilder`, `PolyCurve` |
| `/colours.js` | `RGB8`, `Gradient` |
| `/fills.js` | `Fill`, `SolidFill`, `GradientFill`, `FillDescriptor`, `FillType`, `GradientFillType`, `makeFillDescriptor` |
| `/linestyle.js` | `LineStyle`, `LineStyleDescriptor`, `LineCap`, `LineJoin`, `LineType`, `StrokeAlignment` |
| `/fonts.js` | `Font`, `FontFamily`, `FontCollection`, `FontField`, `FontWeight`, `FontWidth` |
| `/glyphatts.js` | `GlyphAtts`, `TypographicLineType`, `SuperSubType`, `CapsType`, `LeadingOverrideType`, `OpticalAlignmentType`, `TocRoleType`, `GlyphAttDoubleType`, `GlyphAttStringType` |
| `/paragraphatts.js` | `ParagraphAtts`, `ParagraphAlignXType`, `ParagraphLeadingType`, `ParagraphAttDoubleType`, `ParagraphAttStringType` |
| `/storybuilder.js` | `StoryBuilder` |
| `/storydelta.js` | `StoryDelta` plus the formatting enums |
| `/units.js` | `UnitType` |

Anything else throws `SVG shim does not implement /x.js`, so a script that starts using more of the SDK
fails loudly instead of rendering something subtly wrong.

Each script runs in a fresh `vm` context with a custom `require`, so `require('/document.js')` resolves
to the shim instead of the filesystem root. State is per-run — rendering two drawings in sequence cannot
leak nodes between them.

The shim also reproduces two real SDK behaviours that the drawings depend on:

- `PolyCurveNodeDefinition.create` rejects anything that isn't a `FillDescriptor`, with the same
  `expected FillDescriptorHandle` error. Passing a raw `RGB8(...)` fails here too.
- `close()` emits the implied segment back to the start point, which is how Affinity represents a closed
  path. The comparison uses a `1e-6` epsilon: arc endpoints come from `cos`/`sin`, so a point that is
  geometrically the start can differ by ~1e-16 and would otherwise emit a degenerate cubic.

## Fidelity

Verified against geometry exported from Affinity itself. For the cat, every path is byte-identical to
Affinity's own SVG except the background rectangle, where the two differ only in winding start point
(Affinity begins at `(520,0)` counter-clockwise, the shim at `(0,0)` clockwise) — the same rectangle
either way. Shapes are compared separately; see *Shape support* and *Tests*.

## Tests

Unit tests for the shim live in `test/*.test.mjs` and use Node's built-in test runner. Run them from
`svg-renderer/`:

```bash
node --test test/*.test.mjs
```

| File | Covers |
| --- | --- |
| `shim-core.test.mjs` | enums, colours, fills, line styles, warnings, geometry builders |
| `shim-shapes.test.mjs` | every shape's structure and parameter behaviour, plus a comparison with reference curves captured from Affinity |
| `shim-gradients.test.mjs` | gradient colours, gradient fills/strokes and the SVG writer's gradient defs |
| `shim-document.test.mjs` | `ShimDocument`, both node definitions, and the SVG writer |
| `shim-text.test.mjs` | fonts, glyph and paragraph attributes, story building, deltas, text node definitions and the SVG writer's `<text>` output |
| `shim-runner.test.mjs` | the script runner: module map, per-run isolation, warning plumbing |

The shape comparison uses `test/shapes-reference.json` (Affinity's own curves for the same bounds) and
allows at most one pixel of difference per coordinate, so it doubles as the regression test for the
fidelity claims above.

Requires Node **18+**. Use the glob form: `node --test test/` treats the directory as a module on
Node 24.

## Shape support

`ShapeNodeDefinition` runs the real geometry generator: every shape has a `getCurves(bounds)` that
returns a `PolyCurve`, exactly as the SDK's `ShapeApi.getCurves` does. The output was checked against
geometry captured from Affinity for the same bounds; the unit tests keep that comparison and allow at
most one pixel of difference.

| Shape | Parameters honoured |
| --- | --- |
| `ShapeRectangle` | per-corner radius + `cornerType` |
| `ShapeEllipse` | bounds |
| `ShapePolygon` | `sides` |
| `ShapeStar` | `points`, `innerRadius` |
| `ShapeSquareStar` | `sides`, `cutout` |
| `ShapeDoubleStar` | `points`, `innerRadius`, `pointRadius` |
| `ShapeCloud` | `bubbles`, `innerRadius` |
| `ShapeTriangle` | `position` |
| `ShapeDiamond` | `position` |
| `ShapeTrapezoid` | `left`, `right` |
| `ShapeHeart` | fixed outline |
| `ShapeTear` | `tailPosition` |
| `ShapePie` | `startAngle`, `endAngle`, `innerRadius` |
| `ShapeSegment` | `lowerLine` |
| `ShapeArrow` | `thickness`, both ends' `length`/`innerOffset`, styles `Arrow` and `None` |
| `ShapeCog` | `teeth`, `innerRadius`, `holeRadius`, `toothSize`, `notchSize`, `curvature` |
| `ShapeCrescent` | `leftArc`, `rightArc` (clamped so `leftArc <= rightArc`) |
| `ShapeSpiral` | `turns`, `partTurn`, `segmentAngle`, `innerRadius`, `flip` (style `SegmentedLinear`) |
| `ShapeCalloutRectangle` | tail `startPosition`/`endPosition`/`width`/`height`, per-corner radii, `useSingleRadius` |
| `ShapeCalloutEllipse` | tail `angle`/`endPosition`/`height` (angle clamped to the tangent points) |

Several parameter behaviours that are easy to get wrong:

- **`ShapeSquareStar`** — a point's flat tip sits at radius `1 - cutout`, and its two corners sit
  `cutout * cos(PI/sides)` further out along the point's edges. `cutout = 0` collapses to a plain n-gon;
  `cutout = 1` leaves only the paired corners.
- **`ShapeDoubleStar`** — four vertices per point: `[1, innerRadius, pointRadius, innerRadius]`.
- **`ShapeCog`** — per tooth: a tip arc at radius 1 spanning `toothSize` of the tooth angle, a flank, a
  notch arc at `innerRadius` spanning `notchSize`, and a flank back. `curvature = 0` gives straight
  flanks; positive/negative values bend them.
- **`ShapeCrescent`** — each arc interpolates its control points between the centre line (arc 0) and a
  quarter circle (arc 1), so the tips are cusps. The setters clamp the pair.
- **`ShapeSpiral`** — a chain of tangent arcs; the radius decreases linearly and the last arc is
  truncated so the spiral covers exactly `turns` revolutions. `turns` is truncated to an integer.
- **`ShapeCalloutRectangle`** — the box is `h * (1 - tail.height)` tall, corner radii are fractions of
  `min(width, boxHeight)`, and the tail base is centred on `startPosition` and slid inwards when a
  corner radius would clip it.
- **`ShapeArrow`** — a head is `length * height` long (Affinity measures the length against the height,
  not the width), the shaft is `thickness * height` tall, and `innerOffset` slides the shaft end by
  `innerOffset * height`, clipped by the head's edge and the opposite head's base.

### Fitting differences

The shapes are built from the same arcs Affinity uses, so the geometry is within a fraction of a pixel.
The new shapes use Affinity's precision quarter-circle constant (`0.551915`) for exact quarter turns,
matching Affinity's ellipse code. The older shapes (`ShapeEllipse`, `ShapeRectangle` corners, `ShapePie`,
`ShapeSegment`, `ShapeTear`) still use the standard `k = 4/3 * tan(PI/8) = 0.552285`, which differs by
about `0.0004 * radius` (~0.02 px on a 110 px shape). Arcs longer than 90° may also be split into a
different number of segments (`ShapeSegment`'s 240° arc becomes 3 segments here, 4 in Affinity).

### Remaining approximations

These are the only places the shim does not reproduce Affinity. Each prints a `WARN:` line via the CLI:

| Item | Behaviour |
| --- | --- |
| `ShapeQRCode` | renders its bounding rectangle; generating the module pattern needs a QR encoder |
| `ShapeCat`–`ShapeCat4` | render as an ellipse; the silhouettes are baked into Affinity with no formula |
| `ShapeArrow` end styles other than `Arrow`/`None` | drawn as `Arrow` (`TailTriangular`, `Circle`, `Barb`, … are not implemented) |
| `ShapeSpiral` styles other than `SegmentedLinear` | drawn as `SegmentedLinear` |
| `ShapeSegment` with `upperLine < 1` | the top chord is ignored |
| `ShapeTear` with `bend != 0` | the bend is ignored |

Two more parameter ranges are close but not exact: `ShapeCloud` with a non-canonical `innerRadius`
(apexes and valleys still match, the arc fitting can differ by a few px), and `ShapeCog` with extreme
`innerRadius`/wide flanks and `curvature != 0` (up to ~0.6 px).

### Two rectangle gotchas found by testing against Affinity

- **`setRadius` takes a fraction, not pixels.** `setRadius(0.2, 110, 110)` on a 110 px square gives a
  22 px corner; `setRadius(20, ...)` clamps to a full ellipse. The shim scales the value by
  `min(width, height)`.
- **A corner's `cornerType` defaults to `None`, and the radius is silently ignored until it is set to
  `Round`.** A script that calls `setRadius` without setting `cornerType` gets square corners in both
  Affinity and the shim.

## Gradient support

Gradient fills and strokes are built with `Gradient` and `GradientFill`:

```js
const { RGB8, Gradient } = require('/colours.js');
const { GradientFill, GradientFillType, FillDescriptor } = require('/fills.js');

const gradient = Gradient.create([
    { colour: RGB8(255, 90, 40), position: 0 },
    { colour: RGB8(30, 90, 220), position: 1 },
]);

const fill = FillDescriptor.create(
    GradientFill.create(gradient, GradientFillType.Linear));

doc.addNode(ShapeNodeDefinition.create(
    shape, rect, fill, FillDescriptor.createNone(), lsd, FillDescriptor.createNone()));
```

`FillDescriptor.createSolid(colour)` still handles solid fills, and `makeFillDescriptor`/`asFill`
accept a `GradientFill` directly where a fill is expected.

| Gradient type | SVG output |
| --- | --- |
| `Linear` | `<linearGradient>` spanning the node's bounding box left to right |
| `Elliptical` | `<radialGradient>` centred on the bounding box |
| `Radial` | `<radialGradient>` (approximated as elliptical) |
| `Conical` | `<linearGradient>` (approximated; SVG has no conical gradient) |

Stops keep their colour, position and alpha. A stop `midpoint` other than `0.5` is approximated by
inserting a synthetic 50%-blend stop at the midpoint position; `smoothness` is ignored. Gradient
`alpha` multiplies each stop's alpha. `Gradient.create()` with no stops returns a black-to-white
default, and a gradient needs at least two stops. Gradient fills and strokes work on shapes,
polycurves and text runs.

### Gradient approximations

- **Affinity's default extent is degenerate, the shim's is not.** A gradient fill handed to
  `FillDescriptor.create` without a transform keeps the identity transform, so Affinity maps the
  gradient's unit square into a 1 px box at the spread origin and the shape renders in its last
  stop. The shim has no such transform to apply and spans the node's bounds instead, so a script
  that omits the transform looks right here and gradient-less in Affinity. Pass one explicitly:
  `Transform.createTranslate(box.x, box.y).multiply(Transform.createScale(box.width, box.height))`
  for a left-to-right linear ramp, and
  `Transform.createTranslate(cx, cy).multiply(Transform.createScale(box.width / 2, box.height / 2))`
  to centre an elliptical gradient on the box, where `cx`/`cy` are the box's centre.
- **Gradient coordinates are object-relative.** Gradients use `objectBoundingBox` units: linear runs
  left-to-right across the node's bounds and radial/elliptical is centred on them. Gradient tool
  handles and `FillDescriptor` transforms are ignored (with a `WARN:` line when a transform is
  supplied).
- **Conical gradients become linear, and radial becomes elliptical** (with `WARN:` lines).
- **Noise, tint, intensity and non-linear mapping are ignored** (with `WARN:` lines when set).
- **Stop smoothness is ignored.** Midpoints are approximated with a synthetic stop.

## Text support

Text nodes are built with `StoryBuilder` and rendered as SVG `<text>` with one `<tspan>` per
styled run:

```js
const { StoryBuilder } = require('/storybuilder.js');
const { FrameTextNodeDefinition } = require('/nodes.js');
const { Rectangle } = require('/geometry.js');

const sb = StoryBuilder.create();
sb.setToFrameTextDefaultStyle(doc.dpi, doc.rasterFormat);
sb.addText("Hello");
sb.addParagraphBreak();
sb.addText("World");

doc.addNode(FrameTextNodeDefinition.createFromStoryBuilder(
    new Rectangle(40, 40, 400, 200), sb));
```

Both `FrameTextNodeDefinition` and `ArtTextNodeDefinition` are supported. The story is copied when
the definition is created, so reusing the builder afterwards does not change an existing node.

| Feature | Behaviour |
| --- | --- |
| Font | family, weight (`font-weight`) and italic (`font-style`) |
| Size | `glyphAtts.height`, in spread pixels; `setTo*TextDefaultStyle` uses 12 pt at `doc.dpi` |
| Colour | solid or gradient `brushFill` and solid or gradient `penFill` stroke |
| Spacing | `characterSpacing` becomes `letter-spacing` |
| Decorations | `underlineType`/`strikeoutType` become `text-decoration`; `superSubType` becomes `baseline-shift` |
| Caps | `AllCaps`, `Titling` and `Unicase` uppercase; small/petite caps uppercase with a warning |
| Paragraphs | `addParagraphBreak()` starts a new line; each paragraph is one line (no wrapping) |
| Alignment | `Left`, `Centre` and `Right`; justification and spine-relative alignment fall back with a warning |
| Leading | relative or absolute paragraph leading, plus `spaceBefore`/`spaceAfter` |
| Indents | `leftIndent`, `rightIndent` and `firstLineIndent` (each paragraph is one line) |
| Deltas | `applyGlyphDelta`/`applyParagraphDelta` with the `StoryDelta` factories |

Styling can be set either through the attributes or with deltas:

```js
const atts = sb.glyphAtts;
atts.font = Font.create("Helvetica", FontWeight.Bold, false, FontWidth.Normal);
atts.height = 48 * doc.dpi / 72;
atts.brushFill = FillDescriptor.createSolid(RGB8(220, 60, 40));
sb.setGlyphAtts(atts);

sb.applyParagraphDelta(StoryDelta.createAlignX(ParagraphAlignXType.Centre));
```

### Text approximations

- **No word wrapping.** Frame text renders each paragraph as a single line, even when it overflows
  the frame; overflow is neither wrapped nor clipped.
- **Justification is not implemented.** `JustifyLeft`/`JustifyCentre`/`JustifyRight` use the
  corresponding plain alignment, `JustifyAll` uses left alignment, and each prints a `WARN:` line.
- **Small caps are approximated by uppercasing.** `SmallCaps`, `PetiteCaps` and their variants
  uppercase the run and print a `WARN:` line.
- **Fonts are not measured.** Baselines use a fixed ascent of `0.8 * font size`; the viewer's own
  font metrics decide the exact glyph extents. `Font.all` and `FontFamily.all` are empty because
  Node cannot enumerate Affinity's installed fonts.
- **Glyph transparency and highlight fills are ignored** (with a `WARN:` line when set).
- **Glyph transforms are ignored.** `offsetX`/`offsetY`, `scaleX`/`scaleY`, `shearX` and
  `baselineAdvance` do not move or distort the glyphs.
- **Art text is anchored at its position.** The first baseline sits at `position.y`; centre/right
  paragraph alignment anchors on `position.x`.

## Limitations

- **Solid and gradient fills and strokes only.** Hatch/mesh/bitmap/diffusion fills and
  `FillDescriptor` blend modes are ignored. Gradient transforms and non-linear mappings are
  approximated; see *Gradient approximations* above.
- **No images or raster nodes.** Only `PolyCurveNodeDefinition`, `ShapeNodeDefinition` and the text
  definitions produce output.
- **No text wrapping or justification.** See *Text approximations* above.
- **No dash patterns or stroke alignment.** Only weight, cap and join are emitted.
- **Nodes are assumed to sit in spread space.** True for every script here, since they build curves
  directly in spread coordinates and never set a transform. A script that transforms nodes would need
  the transform baked into the coordinates.
- **No boolean operations.** `doc.boolOpUnion` isn't implemented, so a script that welds parts will
  throw rather than produce a wrong silhouette.
- **The remaining shape approximations are listed above.** Anything not in the "Remaining approximations"
  table reproduces Affinity to well under a pixel, and the CLI prints a `WARN:` line when a shape falls
  back to an approximation.
