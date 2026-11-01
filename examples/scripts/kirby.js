// Kirby - round pink body, red feet, bold black outline.
//
// Node structure (bottom to top):
//   Background   - full-bleed rectangle
//   Arm left / right   - pink capsules angled down-out, drawn BEHIND the body so
//                        the body outline stays unbroken where they attach
//   Body               - near-circular pink sphere
//   Foot left / right  - red ellipses, rotated outward, drawn IN FRONT so they
//                        overlap the body's lower edge the way Kirby's do
//   Cheek left / right - flat blush ovals, no outline
//   Eye left / right   - tall dark ovals
//   Highlight left / right - white ovals inside the upper part of each eye
//   Mouth              - the only stroked element (small black smile)
//
// Two spacing traps worth knowing:
//   * The feet must be far enough apart that their 8px outlines don't merge in
//     the middle - a 12px gap is not enough, ~28px reads as two separate feet.
//   * The arms sit BELOW the body's widest point (y 395-470 vs the widest at
//     y 366); placing them at the widest point makes them read as ears.
//
// Fill arguments to PolyCurveNodeDefinition.create must be FillDescriptors, not
// raw Colours - a bare RGB8() throws "expected FillDescriptorHandle".
//
// Run directly with the Affinity MCP `execute_script` tool. It reuses the open
// document only when it is already 720x800 and otherwise creates a new one, so
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
if (!doc || doc.widthPixels !== 720 || doc.heightPixels !== 800) {
    const opts = NewDocumentOptions.createDefault();
    opts.units = UnitType.Pixel;
    opts.width = 720;
    opts.height = 800;
    opts.dpi = 300;
    opts.marginsEnabled = false;
    doc = Document.create(opts);
}
doc.selectAll(false);
doc.deleteSelection(null, false);

// ---------- palette ----------
const PINK     = RGB8(248, 166, 198);
const RED      = RGB8(220, 48, 74);
const CHEEK    = RGB8(236, 110, 158);
const EYE_DARK = RGB8(28, 28, 42);
const WHITE    = RGB8(255, 255, 255);
const INK      = RGB8(30, 30, 34);
const PAPER    = RGB8(246, 242, 233);

const F = (c) => FillDescriptor.createSolid(c);
const pinkFill = F(PINK), redFill = F(RED), cheekFill = F(CHEEK);
const eyeFill = F(EYE_DARK), whiteFill = F(WHITE), inkFill = F(INK), paperFill = F(PAPER);
const noneFill = FillDescriptor.createNone();

// Only the mouth is stroked, but every shape uses this descriptor; the eyes and
// body get the 8px outline from it.
const lsd = LineStyleDescriptor.create(
    LineStyle.create({ weight: 8, cap: LineCap.Round, join: LineJoin.Round, type: LineType.Solid }),
    { strokeAlignment: StrokeAlignment.Centre });

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

// Ellipse with optional rotation (radians, y-down space) - used to splay the feet.
function ellipseCurve(cx, cy, rx, ry, rot) {
    rot = rot || 0;
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const pt = (a) => {
        const ex = rx * Math.cos(a), ey = ry * Math.sin(a);
        return { x: cx + ex * cs - ey * sn, y: cy + ex * sn + ey * cs };
    };
    const tan = (a) => {
        const ex = -rx * Math.sin(a), ey = ry * Math.cos(a);
        return { x: ex * cs - ey * sn, y: ex * sn + ey * cs };
    };
    const b = CurveBuilder.create();
    const p0 = pt(0);
    b.beginXY(p0.x, p0.y);
    for (let i = 1; i <= 4; i++) {
        const a1 = TAU * (i - 1) / 4, a2 = TAU * i / 4;
        const p1 = pt(a1), p2 = pt(a2), t1 = tan(a1), t2 = tan(a2);
        const k = (4 / 3) * Math.tan((a2 - a1) / 4);
        b.addBezierXY(p1.x + k * t1.x, p1.y + k * t1.y, p2.x - k * t2.x, p2.y - k * t2.y, p2.x, p2.y);
    }
    b.close();
    return b.createCurve();
}

// Capsule: straight sides, semicircular caps - keeps a constant width, unlike
// an ellipse which tapers to points at both ends.
function capsuleCurve(bx, by, tx, ty, w) {
    const len = Math.hypot(tx - bx, ty - by);
    const ux = (tx - bx) / len, uy = (ty - by) / len;
    const nx = -uy, ny = ux;
    const r = w / 2;
    const cp = (cx, cy, a) => ({
        x: cx + r * (Math.cos(a) * ux + Math.sin(a) * nx),
        y: cy + r * (Math.cos(a) * uy + Math.sin(a) * ny),
    });
    const tg = (a) => ({
        x: r * (-Math.sin(a) * ux + Math.cos(a) * nx),
        y: r * (-Math.sin(a) * uy + Math.cos(a) * ny),
    });
    const b = CurveBuilder.create();
    const arc = (cx, cy, a1, a2) => {
        const n = Math.max(1, Math.ceil(Math.abs(a2 - a1) / (Math.PI / 2)));
        for (let i = 0; i < n; i++) {
            const s = a1 + (a2 - a1) * i / n;
            const e = a1 + (a2 - a1) * (i + 1) / n;
            const p1 = cp(cx, cy, s), p2 = cp(cx, cy, e);
            const t1 = tg(s), t2 = tg(e);
            const k = (4 / 3) * Math.tan((e - s) / 4);
            b.addBezierXY(p1.x + k * t1.x, p1.y + k * t1.y,
                          p2.x - k * t2.x, p2.y - k * t2.y, p2.x, p2.y);
        }
    };
    let p = cp(bx, by, Math.PI / 2);
    b.beginXY(p.x, p.y);
    p = cp(tx, ty, Math.PI / 2);
    b.lineToXY(p.x, p.y);
    arc(tx, ty, Math.PI / 2, -Math.PI / 2);
    p = cp(bx, by, -Math.PI / 2);
    b.lineToXY(p.x, p.y);
    arc(bx, by, -Math.PI / 2, -3 * Math.PI / 2);
    b.close();
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

// ---------- arms (behind the body) ----------
addCurve(capsuleCurve(165, 395, 100, 470, 72), pinkFill, inkFill, 'Arm left');
addCurve(capsuleCurve(555, 395, 620, 470, 72), pinkFill, inkFill, 'Arm right');

// ---------- body ----------
addCurve(ellipseCurve(360, 366, 260, 255), pinkFill, inkFill, 'Body');

// ---------- feet (in front, splayed outward) ----------
addCurve(ellipseCurve(270, 631, 76, 56, -0.16), redFill, inkFill, 'Foot left');
addCurve(ellipseCurve(450, 631, 76, 56, 0.16), redFill, inkFill, 'Foot right');

// ---------- cheeks (flat blush, no outline) ----------
addCurve(ellipseCurve(230, 418, 32, 22), cheekFill, noneFill, 'Cheek left');
addCurve(ellipseCurve(490, 418, 32, 22), cheekFill, noneFill, 'Cheek right');

// ---------- eyes ----------
addCurve(ellipseCurve(310, 344, 42, 66), eyeFill, inkFill, 'Eye left');
addCurve(ellipseCurve(410, 344, 42, 66), eyeFill, inkFill, 'Eye right');

// ---------- highlights (inside the upper part of each eye, offset inward) ----------
addCurve(ellipseCurve(320, 312, 13, 22), whiteFill, noneFill, 'Highlight left');
addCurve(ellipseCurve(400, 312, 13, 22), whiteFill, noneFill, 'Highlight right');

// ---------- mouth ----------
(function () {
    const b = CurveBuilder.create();
    b.beginXY(336, 426);
    b.addBezierXY(348, 438, 372, 438, 384, 426);
    addCurve(b.createCurve(), noneFill, inkFill, 'Mouth');
})();

doc.selection = null;
console.log('nodes:', doc.currentSpread.children.all.toArray()
    .map(n => n.userDescription || n.constructor.name).join(', '));
console.log('UUID', doc.sessionUuid);
