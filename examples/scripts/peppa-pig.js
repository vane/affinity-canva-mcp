// Peppa Pig - pink head with a protruding snout, red bell dress, thin limbs.
//
// Node structure (bottom to top):
//   Background   - full-bleed rectangle
//   Ear left / right   - pink capsules on top of the head, drawn BEFORE the head
//                        so the head covers their bases
//   Arm left / right   - thin pink capsules, drawn BEFORE the dress
//   Leg left / right   - thin pink capsules, drawn BEFORE the dress
//   Shoe left / right  - black ovals
//   Dress              - red bell: narrow shoulders flaring to a rounded hem
//   Head               - one closed path (see below)
//   Eye left / right   - white circles
//   Pupil left / right - small dots offset toward the snout
//   Cheek              - flat blush oval, no outline
//   Nostril left / right - dark ovals on the snout
//   Mouth              - the only stroked element (small black smile)
//
// The head is a single bezier path rather than an ellipse plus a welded snout:
//   * It starts at the TOP of the snout's tip circle, runs up the forehead and
//     over the dome, down the back, along the bottom and jaw, back along the
//     snout's underside, then closes with an arc that forms the snout's rounded
//     tip. That arc is the last thing before close(), so the tip is a true
//     semicircle of radius 34 - a smaller radius makes the snout read as a
//     pointed beak rather than Peppa's blunt nose.
//   * The snout sits at mid-height (circle centre y=268, head spans y 123-380),
//     not down near the chin.
//   * Welding an ellipse to a capsule would leave a sharp crease where they
//     cross, which is why the outline is drawn by hand.
//
// Fill arguments to PolyCurveNodeDefinition.create must be FillDescriptors, not
// raw Colours - a bare RGB8() throws "expected FillDescriptorHandle".
//
// Run directly with the Affinity MCP `execute_script` tool. It reuses the open
// document only when it is already 560x800 and otherwise creates a new one, so
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
if (!doc || doc.widthPixels !== 560 || doc.heightPixels !== 800) {
    const opts = NewDocumentOptions.createDefault();
    opts.units = UnitType.Pixel;
    opts.width = 560;
    opts.height = 800;
    opts.dpi = 300;
    opts.marginsEnabled = false;
    doc = Document.create(opts);
}
doc.selectAll(false);
doc.deleteSelection(null, false);

// ---------- palette ----------
const PINK     = RGB8(250, 178, 200);
const RED      = RGB8(230, 55, 58);
const BLUSH    = RGB8(242, 128, 162);
const WHITE    = RGB8(255, 255, 255);
const PUPIL    = RGB8(30, 28, 32);
const NOSTRIL  = RGB8(80, 48, 54);
const INK      = RGB8(30, 30, 34);
const SHOE     = RGB8(32, 32, 36);
const PAPER    = RGB8(246, 242, 233);

const F = (c) => FillDescriptor.createSolid(c);
const pinkFill = F(PINK), redFill = F(RED), blushFill = F(BLUSH);
const whiteFill = F(WHITE), pupilFill = F(PUPIL), nostrilFill = F(NOSTRIL);
const inkFill = F(INK), shoeFill = F(SHOE), paperFill = F(PAPER);
const noneFill = FillDescriptor.createNone();

// Peppa's line is thinner than the rest of this series; only the mouth is
// stroked, but the body/head/eyes all use this descriptor.
const lsd = LineStyleDescriptor.create(
    LineStyle.create({ weight: 6, cap: LineCap.Round, join: LineJoin.Round, type: LineType.Solid }),
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

function ellipseCurve(cx, cy, rx, ry) {
    const b = CurveBuilder.create();
    b.beginXY(cx + rx, cy);
    arcTo(b, cx, cy, rx, ry, 0, TAU);
    b.close();
    return b.createCurve();
}

// Capsule: straight sides, semicircular caps - used for ears and limbs so they
// keep a constant width instead of tapering to points.
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

// ---------- ears (behind the head) ----------
addCurve(capsuleCurve(250, 149, 238, 96, 44), pinkFill, inkFill, 'Ear left');
addCurve(capsuleCurve(320, 142, 338, 92, 44), pinkFill, inkFill, 'Ear right');

// ---------- arms (behind the dress) ----------
addCurve(capsuleCurve(205, 405, 150, 465, 24), pinkFill, inkFill, 'Arm left');
addCurve(capsuleCurve(385, 405, 440, 465, 24), pinkFill, inkFill, 'Arm right');

// ---------- legs (behind the dress) ----------
addCurve(capsuleCurve(255, 569, 255, 684, 24), pinkFill, inkFill, 'Leg left');
addCurve(capsuleCurve(335, 569, 335, 684, 24), pinkFill, inkFill, 'Leg right');

// ---------- shoes ----------
addCurve(ellipseCurve(255, 704, 32, 22), shoeFill, inkFill, 'Shoe left');
addCurve(ellipseCurve(335, 704, 32, 22), shoeFill, inkFill, 'Shoe right');

// ---------- dress: bell shape with a rounded hem ----------
(function () {
    const b = CurveBuilder.create();
    b.beginXY(215, 369);
    b.addBezierXY(200, 444, 190, 514, 188, 574);   // left side flares out
    b.addBezierXY(205, 604, 385, 604, 402, 574);   // rounded hem
    b.addBezierXY(400, 514, 390, 444, 375, 369);   // right side
    b.close();                                      // straight top, hidden by the head
    addCurve(b.createCurve(), redFill, inkFill, 'Dress');
})();

// ---------- head ----------
// Snout tip circle: centre (145, 268), r 34 -> tip at x=111, spans y 234-302.
(function () {
    const b = CurveBuilder.create();
    b.beginXY(145, 234);                            // top of the snout tip circle
    b.addBezierXY(158, 195, 172, 165, 200, 150);    // forehead rising from the snout
    b.addBezierXY(250, 118, 310, 115, 360, 129);    // over the dome
    b.addBezierXY(400, 132, 428, 175, 430, 240);    // down the back
    b.addBezierXY(432, 285, 428, 312, 415, 330);    // back to the bottom
    b.addBezierXY(400, 355, 360, 373, 320, 379);    // bottom, right half
    b.addBezierXY(290, 381, 258, 375, 235, 368);    // bottom, left half
    b.addBezierXY(215, 362, 192, 352, 175, 340);    // jaw
    b.addBezierXY(162, 330, 152, 315, 145, 302);    // snout underside
    arcTo(b, 145, 268, 34, 34, Math.PI / 2, Math.PI * 1.5);  // blunt rounded tip
    b.close();
    addCurve(b.createCurve(), pinkFill, inkFill, 'Head');
})();

// ---------- eyes ----------
addCurve(ellipseCurve(198, 185, 20, 20), whiteFill, inkFill, 'Eye left');
addCurve(ellipseCurve(254, 185, 20, 20), whiteFill, inkFill, 'Eye right');
addCurve(ellipseCurve(194, 187, 7, 7), pupilFill, noneFill, 'Pupil left');
addCurve(ellipseCurve(250, 187, 7, 7), pupilFill, noneFill, 'Pupil right');

// ---------- cheek blush, forward on the face beside the snout ----------
addCurve(ellipseCurve(228, 248, 34, 32), blushFill, noneFill, 'Cheek');

// ---------- nostrils ----------
addCurve(ellipseCurve(128, 250, 7, 8), nostrilFill, noneFill, 'Nostril left');
addCurve(ellipseCurve(150, 250, 7, 8), nostrilFill, noneFill, 'Nostril right');

// ---------- mouth ----------
(function () {
    const b = CurveBuilder.create();
    b.beginXY(186, 325);
    b.addBezierXY(198, 336, 218, 336, 230, 325);
    addCurve(b.createCurve(), noneFill, inkFill, 'Mouth');
})();

doc.selection = null;
console.log('nodes:', doc.currentSpread.children.all.toArray()
    .map(n => n.userDescription || n.constructor.name).join(', '));
console.log('UUID', doc.sessionUuid);
