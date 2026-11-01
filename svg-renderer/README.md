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
│   │                  # StrokeAlignment, FillType, ShapeCornerType, ShapeType
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
    └── shapes.js      # shape coverage fixture (4x4 grid)
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
| `/shapes.js` | `Shape`, `ShapeRectangle`, `ShapeEllipse`, `ShapeTriangle`, `ShapeDiamond`, `ShapeTrapezoid`, `ShapePolygon`, `ShapeStar`, `ShapeSquareStar`, `ShapeDoubleStar`, `ShapeCloud`, `ShapeCog`, `ShapeArrow`, `ShapePie`, `ShapeCrescent`, `ShapeSegment`, `ShapeTear`, `ShapeHeart`, `ShapeSpiral`, `ShapeCalloutRectangle`, `ShapeCalloutEllipse`, `ShapeQRCode`, `ShapeCat`–`ShapeCat4`, `ShapeType`, `ShapeCornerType` |
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
either way.

## Shape support

`ShapeNodeDefinition` runs the real geometry generator: every shape has a `getCurves(bounds)` that
returns a `PolyCurve`, exactly as the SDK's `ShapeApi.getCurves` does. The output was checked against
geometry exported from Affinity for the same bounds.

**Exact** — matches Affinity's own output for default parameters:

| Shape | Parameters honoured |
| --- | --- |
| `ShapeRectangle` | per-corner radius + `cornerType` |
| `ShapePolygon` | `sides` |
| `ShapeStar` | `points`, `innerRadius` |
| `ShapeTriangle` | `position` |
| `ShapeDiamond` | `position` |
| `ShapeTrapezoid` | `left`, `right` |
| `ShapeHeart` | fixed outline |
| `ShapeTear` | `tailPosition` |
| `ShapePie` | `startAngle`, `endAngle`, `innerRadius` |
| `ShapeSegment` | `lowerLine` |
| `ShapeCloud` | `bubbles`, `innerRadius` |

**Sub-pixel differences** — same shape, slightly different bezier fitting: `ShapeEllipse` (Affinity's
circle control points differ by ~0.02 px from the standard `k = 0.5523`), and arcs longer than 90° are
subdivided differently (`ShapeSegment`'s 240° arc becomes 3 segments here, 4 in Affinity).

**Approximated** — renders a plausible shape and prints a warning via the CLI:

| Shape | Approximation |
| --- | --- |
| `ShapeSquareStar` | plain star using `cutout` as the inner radius |
| `ShapeDoubleStar` | 2n-point star, `pointRadius` ignored |
| `ShapeCog` | 2n-point star plus a circular hole (hole matches; teeth do not) |
| `ShapeArrow` | horizontal double-headed arrow |
| `ShapeCrescent` | outer half-ellipse plus an inner bulge; `leftArc` ignored |
| `ShapeSpiral` | evenly decaying polyline spiral; `decay`/style ignored |
| `ShapeCalloutRectangle` / `ShapeCalloutEllipse` | shape plus a triangular tail |
| `ShapeQRCode`, `ShapeCat`–`ShapeCat4` | bounding rectangle / ellipse |

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
- **Shape approximations are listed above.** Anything not in the "exact" table may differ from
  Affinity, and the CLI prints a `WARN:` line when that happens.
