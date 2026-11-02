# Examples — drawings and specimens built with the Affinity MCP

Nine finished examples produced by driving **Affinity by Canva** through the Affinity MCP server.
Each one is a single self-contained JavaScript file that builds the artwork from scratch with the
Affinity SDK — no images, no imported assets, just curves, fills, strokes and text.

The scripts live in [`scripts/`](scripts/).

> The seven line-art drawings were each drawn in one shot, with no iteration. The two specimens
exercise specific SDK features — gradients and typography — rather than a drawing instruction.

## The drawings

| Script | Character | Instruction | Page | Nodes | Style |
| --- | --- | --- | --- | --- | --- |
| [`pacman.js`](scripts/pacman.js) | Pac-Man | `draw pacman` | 800×800 | 3 | One pie-slice path, no boolean ops, 8 px outline |
| [`stick-figure.js`](scripts/stick-figure.js) | Stick figure | `draw stick figure` | 600×1000 | 2 | Stroke only, no fills at all, 14 px |
| [`south-park-stan.js`](scripts/south-park-stan.js) | Stan Marsh (*South Park*) | `Draw South Park Stan` | 500×800 | 21 | Flat colour, **no outlines** — the show's style |
| [`kirby.js`](scripts/kirby.js) | Kirby | `Draw Kirby` | 720×800 | 13 | 8 px outline |
| [`peppa-pig.js`](scripts/peppa-pig.js) | Peppa Pig | `Draw Peppa Pig` | 560×800 | 19 | Hand-built bezier head, 6 px outline |
| [`dog.js`](scripts/dog.js) | Cartoon dog | `draw dog` | 600×800 | 18 | Floppy ears drawn in front of the head, 8 px outline |
| [`cat.js`](scripts/cat.js) | Cartoon cat | `draw cat` | 520×800 | 22 | Smooth offset-band tail, 8 px outline |

## The specimens

| Script | Shows | Page | Nodes | Style |
| --- | --- | --- | --- | --- |
| [`gradients.js`](scripts/gradients.js) | A sunset built entirely from gradient fills and strokes | 800×600 | 11 | Linear and elliptical gradients, no solid fills |
| [`text.js`](scripts/text.js) | Typography specimen: art text, frame text and styled runs | 800×800 | 9 | Helvetica, with per-paragraph weight, italic and colour |

`gradients.js` is the reference for placing gradient fills. A `GradientFill` passed to
`FillDescriptor.create` without a transform keeps the identity transform, which maps the gradient's
unit square into a 1 px box at the spread origin — Affinity then paints the whole shape in its last
stop. The script therefore gives every gradient an explicit transform: linear gradients ramp along
+x from the transform origin, and elliptical ones are centred on it with radii taken from the
transform's scale. See [`svg-renderer/README.md`](../svg-renderer/README.md#gradient-approximations)
for the two forms.

## How to run one

There is no "run a file from disk" tool — Affinity's filesystem access is scoped to `~/Desktop` and is
disabled by default. So:

1. Open the script you want.
2. Paste its contents into the MCP `execute_script` tool.
3. Render the result with `render_spread` (`document_session_uuid: doc.sessionUuid`, `spread_index: 0`).

Alternatively, render them to SVG offline with [`svg-renderer/`](../svg-renderer/README.md) — it runs the
same scripts under plain Node against a shim of the SDK subset they use, and needs no Affinity at all.
Run it from the repo root:

```bash
node svg-renderer/render.js --all
```

The script logs the node list and the document's `sessionUuid` to `console.log`, which is the only way
to get output back from `execute_script`.

Each script starts with a **document guard** keyed to its own page size:

```js
let doc = Document.current;
if (!doc || doc.widthPixels !== 560 || doc.heightPixels !== 800) {
    // ...create a new document at this size
}
```

The seven line-art drawings each use a distinct page size, so running one never overwrites another
artwork. The two specimens use 800×600 and 800×800, so `text.js` shares its size with `pacman.js` —
running it while that drawing is open clears and redraws it. If a document of the matching size is
already open it is cleared and redrawn in place, which is the recommended pattern — the SDK has no
`Document.close()`, so creating documents repeatedly leaves strays open.

## Shared conventions

Every file follows the same shape: a header comment describing the node stack bottom-to-front, a
palette block, a helper set, then the drawing calls in z-order, then a `console.log` summary.

Reusable helpers, shared across the scripts:

| Helper | Purpose |
| --- | --- |
| `arcTo(b, cx, cy, rx, ry, a1, a2)` | Elliptical arc on a `CurveBuilder`, split into ≤90° beziers. Handles a reverse sweep (`a2 < a1`) because the sign of `k` flips. |
| `ellipseCurve(cx, cy, rx, ry[, rot])` | Closed ellipse, optionally rotated (used for Kirby's splayed feet). |
| `roundedRectCurve(x, y, w, h, rTL, rTR, rBR, rBL)` | Rectangle with an independent radius per corner — the dog's head needs `95/95/75/75`. |
| `capsuleCurve(bx, by, tx, ty, w)` | Constant-width capsule. Use this for limbs, not an ellipse — an ellipse tapers to points at both ends and reads as a pointed leaf. |
| `crescentCurve(...)` | Thin sliver between two concentric ellipse arcs; used for Stan's sideburns so the hair follows the head's curve instead of sitting on it as a blob. |
| `addCurve(curves, brushFill, lineFill, name[, lineStyle])` | Builds a `PolyCurveNode` and returns the new node. The optional line style lets one shape (e.g. the dog's mouth) use a thinner stroke. |

The two specimens keep the same shape but use their own helpers: `gradients.js` builds fills with
`linear(rect, …colours)` and `elliptical(rect, …colours)`, and `text.js` builds stories with
`artText(text, x, y, opts)` and `frameText(paragraphs, rect, opts)`.
