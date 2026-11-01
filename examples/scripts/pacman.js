// Pac-Man as flat vector line art: golden-yellow wedge, bold black outline.
//
// Node structure (bottom to top):
//   Background - full-bleed rectangle
//   Body       - one closed path: mouth apex -> upper mouth edge -> arc the
//                long way round the circle -> close back to the apex
//   Eye        - small black circle
//
// The body is a single pie-slice path rather than a circle with a subtracted
// wedge, so it needs no boolean operation. Angles are in y-down space
// (0 = right, PI/2 = down), so the mouth opens to the right with its upper
// edge at -HALF and its lower edge at +HALF.
//
// Fill arguments to PolyCurveNodeDefinition.create must be FillDescriptors, not
// raw Colours - a bare RGB8() throws "expected FillDescriptorHandle".
//
// Run directly with the Affinity MCP `execute_script` tool. It reuses the open
// document when it is already 800x800 and otherwise creates a new one, so it
// never clobbers an artwork on a differently-sized page.

const { Document, NewDocumentOptions } = require('/document.js');
const { ShapeNodeDefinition, PolyCurveNodeDefinition } = require('/nodes.js');
const { ShapeRectangle } = require('/shapes.js');
const { Rectangle, CurveBuilder, PolyCurve } = require('/geometry.js');
const { RGB8 } = require('/colours.js');
const { FillDescriptor } = require('/fills.js');
const {
    LineStyle, LineStyleDescriptor,
    LineCap, LineJoin, LineType, StrokeAlignment,
} = require('/linestyle.js');
const { UnitType } = require('/units.js');

// ---------- document ----------
let doc = Document.current;
if (!doc || doc.widthPixels !== 800 || doc.heightPixels !== 800) {
    const opts = NewDocumentOptions.createDefault();
    opts.units = UnitType.Pixel;
    opts.width = 800;
    opts.height = 800;
    opts.dpi = 300;
    opts.marginsEnabled = false;
    doc = Document.create(opts);
}
doc.selectAll(false);
doc.deleteSelection(null, false);

const YELLOW = RGB8(255, 212, 0);
const INK    = RGB8(24, 24, 27);
const PAPER  = RGB8(246, 242, 233);

const yellowFill = FillDescriptor.createSolid(YELLOW);
const inkFill    = FillDescriptor.createSolid(INK);
const paperFill  = FillDescriptor.createSolid(PAPER);
const noneFill   = FillDescriptor.createNone();

const ls = LineStyle.create({ weight: 8, cap: LineCap.Round, join: LineJoin.Round, type: LineType.Solid });
const lsd = LineStyleDescriptor.create(ls, { strokeAlignment: StrokeAlignment.Centre });

// ---------- helpers ----------
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

// Elliptical arc from angle a1 to a2 on a builder, split into <=90deg beziers.
// Handles a2 < a1 (the sign of k flips), so it can sweep either way.
function arcTo(b, cx, cy, rx, ry, a1, a2) {
    const n = Math.max(1, Math.ceil(Math.abs(a2 - a1) / (Math.PI / 2)));
    for (let i = 0; i < n; i++) {
        const s = a1 + (a2 - a1) * i / n;
        const e = a1 + (a2 - a1) * (i + 1) / n;
        const cs1 = Math.cos(s), sn1 = Math.sin(s);
        const cs2 = Math.cos(e), sn2 = Math.sin(e);
        const p1 = { x: cx + rx * cs1, y: cy + ry * sn1 };
        const p2 = { x: cx + rx * cs2, y: cy + ry * sn2 };
        const t1 = { x: -rx * sn1, y: ry * cs1 };
        const t2 = { x: -rx * sn2, y: ry * cs2 };
        const k = (4 / 3) * Math.tan((e - s) / 4);
        b.addBezierXY(p1.x + k * t1.x, p1.y + k * t1.y,
                      p2.x - k * t2.x, p2.y - k * t2.y, p2.x, p2.y);
    }
}

function ellipseCurve(cx, cy, rx, ry) {
    const b = CurveBuilder.create();
    b.beginXY(cx + rx, cy);
    arcTo(b, cx, cy, rx, ry, 0, TAU);
    b.close();
    return b.createCurve();
}

// Adds a poly-curve node. PolyCurveNodeDefinition.create needs all five
// arguments non-null (it dereferences .handle on each), hence noneFill.
function addCurve(curve, brushFill, lineFill, name) {
    const pc = PolyCurve.create();
    pc.addCurve(curve);
    const def = PolyCurveNodeDefinition.create(pc, brushFill, lineFill, lsd, noneFill);
    if (name) def.userDescription = name;
    doc.addNode(def);                       // returns undefined; new node is selected
    return doc.selection.nodes.toArray()[0];
}

// ---------- background ----------
const bgDef = ShapeNodeDefinition.create(
    ShapeRectangle.create(),
    new Rectangle(0, 0, doc.widthPixels, doc.heightPixels),
    paperFill, noneFill, lsd, noneFill);
bgDef.userDescription = 'Background';
doc.addNode(bgDef);

// ---------- body: circle with a wedge bitten out of the right side ----------
const CX = 400, CY = 400, R = 300;
const HALF = 27 * DEG;                  // half the mouth angle -> 54 deg total

const b = CurveBuilder.create();
b.beginXY(CX, CY);                                              // mouth apex
b.lineToXY(CX + R * Math.cos(-HALF), CY + R * Math.sin(-HALF));  // upper mouth edge
arcTo(b, CX, CY, R, R, -HALF, -(TAU - HALF));                    // long way round the body
b.close();                                                       // lower mouth edge back to apex
addCurve(b.createCurve(), yellowFill, inkFill, 'Body');

// ---------- eye ----------
addCurve(ellipseCurve(438, 219, 27, 27), inkFill, inkFill, 'Eye');

doc.selection = null;
console.log('nodes:', doc.currentSpread.children.all.toArray()
    .map(n => n.userDescription || n.constructor.name).join(', '));
console.log('UUID', doc.sessionUuid);
