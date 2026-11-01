// Stick figure: pure stroke line art, no fills at all.
//
// Node structure (bottom to top):
//   Background   - full-bleed rectangle
//   Stick figure - ONE PolyCurve node holding four sub-curves:
//                    head   - closed ellipse ring
//                    spine  - open line from the head's bottom to the hips
//                    arms   - open polyline: hand -> shoulder -> hand
//                    legs   - open polyline: foot -> hip -> foot
//
// Nothing is welded: the limbs meet the spine exactly at their joint points and
// round line joins make those corners clean, so separate sub-curves are enough.
// Both brush fills are noneFill, so only the stroke is painted - the head stays
// open rather than filled.
//
// Fill arguments to PolyCurveNodeDefinition.create must be FillDescriptors, not
// raw Colours - a bare RGB8() throws "expected FillDescriptorHandle".
//
// Run directly with the Affinity MCP `execute_script` tool. It reuses the open
// document only when it is already 600x1000 and otherwise creates a new one, so
// it never clobbers an artwork on a differently-sized page.

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
if (!doc || doc.widthPixels !== 600 || doc.heightPixels !== 1000) {
    const opts = NewDocumentOptions.createDefault();
    opts.units = UnitType.Pixel;
    opts.width = 600;
    opts.height = 1000;
    opts.dpi = 300;
    opts.marginsEnabled = false;
    doc = Document.create(opts);
}
doc.selectAll(false);
doc.deleteSelection(null, false);

const INK   = RGB8(24, 24, 27);
const PAPER = RGB8(246, 242, 233);

const inkFill   = FillDescriptor.createSolid(INK);
const paperFill = FillDescriptor.createSolid(PAPER);
const noneFill  = FillDescriptor.createNone();

// Heavy stroke with round caps and joins - the joins are what make the limb
// corners read as a continuous figure rather than separate sticks.
const ls = LineStyle.create({ weight: 14, cap: LineCap.Round, join: LineJoin.Round, type: LineType.Solid });
const lsd = LineStyleDescriptor.create(ls, { strokeAlignment: StrokeAlignment.Centre });

// ---------- helpers ----------
const TAU = Math.PI * 2;

// Elliptical arc from angle a1 to a2 on a builder, split into <=90deg beziers.
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

// Open polyline through the given points (no close), so it strokes without fill.
function polyline(points) {
    const b = CurveBuilder.create();
    b.beginXY(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) b.lineToXY(points[i].x, points[i].y);
    return b.createCurve();
}

// Adds a poly-curve node. PolyCurveNodeDefinition.create needs all five
// arguments non-null (it dereferences .handle on each), hence noneFill.
function addCurve(curves, brushFill, lineFill, name) {
    const pc = PolyCurve.create();
    for (const c of [].concat(curves)) pc.addCurve(c);
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

// ---------- stick figure ----------
const CX = 300;                             // centre line
const HEAD_R = 78;
const HEAD_CY = 199;                        // head spans 121..277
const HIP_Y = 612;                          // spine 277..612
const SHOULDER_Y = 372;                     // arms attach 95 below the head

addCurve([
    ellipseCurve(CX, HEAD_CY, HEAD_R, HEAD_R),                                  // head
    polyline([{ x: CX, y: HEAD_CY + HEAD_R }, { x: CX, y: HIP_Y }]),            // spine
    polyline([{ x: 145, y: 487 }, { x: CX, y: SHOULDER_Y }, { x: 455, y: 487 }]), // arms
    polyline([{ x: 195, y: 879 }, { x: CX, y: HIP_Y }, { x: 405, y: 879 }]),     // legs
], noneFill, inkFill, 'Stick figure');

doc.selection = null;
console.log('nodes:', doc.currentSpread.children.all.toArray()
    .map(n => n.userDescription || n.constructor.name).join(', '));
console.log('UUID', doc.sessionUuid);
