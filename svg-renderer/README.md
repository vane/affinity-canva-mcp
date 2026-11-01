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
│   │                  # ShapeArrowEndStyle, ShapeSpiralStyle, ShapeCornerIndex
│   ├── colours.js     # RGB8
│   ├── fills.js       # FillDescriptor
│   ├── linestyle.js   # LineStyle, LineStyleDescriptor
│   ├── geometry.js    # Rectangle, Curve, CurveBuilder, PolyCurve
│   ├── shapes.js      # Shape + every Shape* class
│   ├── nodes.js       # PolyCurveNodeDefinition, ShapeNodeDefinition
│   ├── document.js    # ShimDocument, NewDocumentOptions
│   ├── svg.js         # document -> SVG string
│   └── warnings.js    # approximation warnings, reset per run
└── test/
    ├── shapes-reference.json   # reference shape curves captured from Affinity
    ├── shim-core.test.mjs      # enums, colours, fills, line styles, geometry
    ├── shim-shapes.test.mjs    # shape geometry + reference comparison
    ├── shim-document.test.mjs  # document, node definitions, SVG writer
    └── shim-runner.test.mjs    # script runner, module map, warnings
```

`shim/index.js` is the entry point: it builds the `require('/x.js')` module map from the
sibling files and runs the script.

## Usage

```bash
# one drawing, output next to the input
node render.js ../examples/scripts/cat.js

# one drawing, explicit output
node render.js ../examples/scripts/cat.js out/cat.svg

# every drawing (input defaults to ../examples/scripts, output to ./out)
node render.js --all

# every drawing, explicit in/out folders
node render.js --all ../examples/scripts out
```

Requires Node **18+** (`node:vm`, `node:fs`). No dependencies, nothing to install.

Output looks like:

```
cat.js                   520x800  22 nodes  4955 bytes -> out/cat.svg
    nodes: Background, Tail, Ear left, Ear right, ...
```

## What it supports

The shim provides these modules, which is everything the drawings require:

| Module | Provided |
| --- | --- |
| `/document.js` | `Document`, `NewDocumentOptions` |
| `/nodes.js` | `PolyCurveNodeDefinition`, `ShapeNodeDefinition` |
| `/shapes.js` | `Shape`, `ShapeRectangle`, `ShapeEllipse`, `ShapeTriangle`, `ShapeDiamond`, `ShapeTrapezoid`, `ShapePolygon`, `ShapeStar`, `ShapeSquareStar`, `ShapeDoubleStar`, `ShapeCloud`, `ShapeCog`, `ShapeArrow`, `ShapePie`, `ShapeCrescent`, `ShapeSegment`, `ShapeTear`, `ShapeHeart`, `ShapeSpiral`, `ShapeCalloutRectangle`, `ShapeCalloutEllipse`, `ShapeQRCode`, `ShapeCat`–`ShapeCat4`, `ShapeType`, `ShapeCornerType`, `ShapeCornerIndex`, `ShapeArrowEndStyle`, `ShapeSpiralStyle` |
| `/geometry.js` | `Rectangle`, `Curve`, `CurveBuilder`, `PolyCurve` |
| `/colours.js` | `RGB8` |
| `/fills.js` | `FillDescriptor`, `FillType` |
| `/linestyle.js` | `LineStyle`, `LineStyleDescriptor`, `LineCap`, `LineJoin`, `LineType`, `StrokeAlignment` |
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
| `shim-document.test.mjs` | `ShimDocument`, both node definitions, and the SVG writer |
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

## Limitations

- **Solid fills and solid strokes only.** Gradients, hatch/mesh/bitmap fills and `FillDescriptor`
  blend modes are ignored.
- **No text, images or raster nodes.** Only `PolyCurveNodeDefinition` and `ShapeNodeDefinition`
  produce output.
- **No dash patterns or stroke alignment.** Only weight, cap and join are emitted.
- **Nodes are assumed to sit in spread space.** True for every script here, since they build curves
  directly in spread coordinates and never set a transform. A script that transforms nodes would need
  the transform baked into the coordinates.
- **No boolean operations.** `doc.boolOpUnion` isn't implemented, so a script that welds parts will
  throw rather than produce a wrong silhouette.
- **The remaining shape approximations are listed above.** Anything not in the "Remaining approximations"
  table reproduces Affinity to well under a pixel, and the CLI prints a `WARN:` line when a shape falls
  back to an approximation.
