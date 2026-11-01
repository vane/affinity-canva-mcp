// Cartoon cat - grey fur, pointed ears, green slit-pupil eyes, whiskers, curled tail.
//
// Node structure (bottom to top):
//   Background   - full-bleed rectangle
//   Tail               - one closed band, drawn BEFORE the body so it hides the base
//   Ear left / right   - pointed ears, drawn BEFORE the head
//   Inner ear left / right - pink insets, drawn after the ears but before the head so
//                        the head hides their lower edge
//   Leg left / right   - front legs, drawn BEFORE the body
//   Paw left / right   - rounded paws over the leg ends
//   Body               - sitting torso
//   Head               - rounded rectangle with big top corners
//   Muzzle             - cream oval
//   Nose               - small pink shape, flat top and rounded bottom
//   Eye left / right   - green ovals
//   Pupil left / right - narrow vertical slits (what makes it read as a cat)
//   Highlight left / right - small white dots at upper-left of each eye
//   Mouth              - centre line plus two curves (thinner stroke)
//   Whiskers           - six thin curves, the thinnest stroke in the drawing
//
// The tail is the fiddly part. Three welded capsules left visible notches along the
// outer edge where the union corners met. It is now a single closed path: an outer
// edge, a rounded tip, an inner edge, then close() across the base (hidden inside
// the body). Both edges are offset ~22 px from the same centreline, so the band
// keeps a constant width.
//
// A thick stroked curve is tempting for a tail but gives a solid ink shape, not a
// fur-coloured one - it needs a fill to pick up the fur colour and an outline.
//
// Four stroke weights are in play (8 body, 6 mouth, 4 whiskers), so addCurve()
// takes an optional line-style argument.
//
// Fill arguments to PolyCurveNodeDefinition.create must be FillDescriptors, not
// raw Colours - a bare RGB8() throws "expected FillDescriptorHandle".
//
// Run directly with the Affinity MCP `execute_script` tool. It reuses the open
// document only when it is already 520x800 and otherwise creates a new one, so
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
if (!doc || doc.widthPixels !== 520 || doc.heightPixels !== 800) {
    const opts = NewDocumentOptions.createDefault();
    opts.units = UnitType.Pixel;
    opts.width = 520;
    opts.height = 800;
    opts.dpi = 300;
    opts.marginsEnabled = false;
    doc = Document.create(opts);
}
doc.selectAll(false);
doc.deleteSelection(null, false);

// ---------- palette ----------
const FUR     = RGB8(160, 158, 155);
const EAR_IN  = RGB8(232, 168, 178);
const MUZZLE  = RGB8(248, 242, 232);
const NOSE    = RGB8(226, 138, 150);
const EYE     = RGB8(196, 214, 120);
const PUPIL   = RGB8(32, 30, 34);
const WHITE   = RGB8(255, 255, 255);
const INK     = RGB8(32, 30, 34);
const PAPER   = RGB8(246, 242, 233);

const F = (c) => FillDescriptor.createSolid(c);
const furFill = F(FUR), earInFill = F(EAR_IN), muzzleFill = F(MUZZLE);
const noseFill = F(NOSE), eyeFill = F(EYE), pupilFill = F(PUPIL);
const whiteFill = F(WHITE), inkFill = F(INK), paperFill = F(PAPER);
const noneFill = FillDescriptor.createNone();

const mkLsd = (w) => LineStyleDescriptor.create(
    LineStyle.create({ weight: w, cap: LineCap.Round, join: LineJoin.Round, type: LineType.Solid }),
    { strokeAlignment: StrokeAlignment.Centre });
const lsd = mkLsd(8);
const lsdMouth = mkLsd(6);
const lsdWhisker = mkLsd(4);

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

function roundedRectCurve(x, y, w, h, rTL, rTR, rBR, rBL) {
    const b = CurveBuilder.create();
    b.beginXY(x + rTL, y);
    b.lineToXY(x + w - rTR, y);
    if (rTR > 0) arcTo(b, x + w - rTR, y + rTR, rTR, rTR, -Math.PI / 2, 0);
    b.lineToXY(x + w, y + h - rBR);
    if (rBR > 0) arcTo(b, x + w - rBR, y + h - rBR, rBR, rBR, 0, Math.PI / 2);
    b.lineToXY(x + rBL, y + h);
    if (rBL > 0) arcTo(b, x + rBL, y + h - rBL, rBL, rBL, Math.PI / 2, Math.PI);
    b.lineToXY(x, y + rTL);
    if (rTL > 0) arcTo(b, x + rTL, y + rTL, rTL, rTL, Math.PI, Math.PI * 1.5);
    b.close();
    return b.createCurve();
}

// Capsule: straight sides, semicircular caps - constant width for legs.
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
function addCurve(curves, brushFill, lineFill, name, lineStyle) {
    const pc = PolyCurve.create();
    for (const c of [].concat(curves)) pc.addCurve(c);
    const def = PolyCurveNodeDefinition.create(pc, brushFill, lineFill, lineStyle || lsd, noneFill);
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

// ---------- tail: one closed band, offset from a centreline ----------
(function () {
    const b = CurveBuilder.create();
    b.beginXY(356.3, 596.1);                                // outer base, inside the body
    b.addBezierXY(418, 572.6, 456.2, 516, 451.9, 453);      // outer edge
    b.addBezierXY(444, 430, 416, 430, 408.1, 457);          // rounded tip
    b.addBezierXY(413.8, 504, 382, 547.4, 343.7, 553.9);    // inner edge
    b.close();                                              // base, hidden by the body
    addCurve(b.createCurve(), furFill, inkFill, 'Tail');
})();

// ---------- ears (behind the head) ----------
(function () {
    const b = CurveBuilder.create();
    b.beginXY(155, 205);
    b.addBezierXY(168, 150, 178, 125, 188, 116);
    b.addBezierXY(198, 125, 222, 158, 248, 195);
    b.close();
    addCurve(b.createCurve(), furFill, inkFill, 'Ear left');
})();

(function () {
    const b = CurveBuilder.create();
    b.beginXY(365, 205);
    b.addBezierXY(352, 150, 342, 125, 332, 116);
    b.addBezierXY(322, 125, 298, 158, 272, 195);
    b.close();
    addCurve(b.createCurve(), furFill, inkFill, 'Ear right');
})();

// ---------- inner ears (before the head, so the head hides their lower edge) ----------
(function () {
    const b = CurveBuilder.create();
    b.beginXY(170, 190);
    b.addBezierXY(177, 155, 183, 138, 188, 132);
    b.addBezierXY(195, 139, 212, 162, 228, 182);
    b.close();
    addCurve(b.createCurve(), earInFill, noneFill, 'Inner ear left');
})();

(function () {
    const b = CurveBuilder.create();
    b.beginXY(350, 190);
    b.addBezierXY(343, 155, 337, 138, 332, 132);
    b.addBezierXY(325, 139, 308, 162, 292, 182);
    b.close();
    addCurve(b.createCurve(), earInFill, noneFill, 'Inner ear right');
})();

// ---------- front legs (behind the body) ----------
addCurve(capsuleCurve(205, 555, 205, 655, 44), furFill, inkFill, 'Leg left');
addCurve(capsuleCurve(315, 555, 315, 655, 44), furFill, inkFill, 'Leg right');

// ---------- paws ----------
addCurve(ellipseCurve(205, 665, 34, 18), furFill, inkFill, 'Paw left');
addCurve(ellipseCurve(315, 665, 34, 18), furFill, inkFill, 'Paw right');

// ---------- body ----------
(function () {
    const b = CurveBuilder.create();
    b.beginXY(175, 385);
    b.addBezierXY(158, 455, 148, 530, 150, 575);
    b.addBezierXY(156, 615, 364, 615, 370, 575);
    b.addBezierXY(372, 530, 362, 455, 345, 385);
    b.close();
    addCurve(b.createCurve(), furFill, inkFill, 'Body');
})();

// ---------- head ----------
addCurve(roundedRectCurve(135, 165, 250, 230, 85, 85, 75, 75), furFill, inkFill, 'Head');

// ---------- muzzle ----------
addCurve(ellipseCurve(260, 328, 58, 34), muzzleFill, inkFill, 'Muzzle');

// ---------- nose ----------
(function () {
    const b = CurveBuilder.create();
    b.beginXY(246, 303);
    b.lineToXY(274, 303);
    b.addBezierXY(270, 317, 266, 323, 260, 323);
    b.addBezierXY(254, 323, 250, 317, 246, 303);
    b.close();
    addCurve(b.createCurve(), noseFill, inkFill, 'Nose');
})();

// ---------- eyes: green with vertical slit pupils ----------
addCurve(ellipseCurve(212, 260, 26, 30), eyeFill, inkFill, 'Eye left');
addCurve(ellipseCurve(308, 260, 26, 30), eyeFill, inkFill, 'Eye right');
addCurve(ellipseCurve(212, 260, 6, 22), pupilFill, noneFill, 'Pupil left');
addCurve(ellipseCurve(308, 260, 6, 22), pupilFill, noneFill, 'Pupil right');
addCurve(ellipseCurve(206, 250, 6, 6), whiteFill, noneFill, 'Highlight left');
addCurve(ellipseCurve(302, 250, 6, 6), whiteFill, noneFill, 'Highlight right');

// ---------- mouth: centre line plus two curves ----------
(function () {
    const v = CurveBuilder.create().beginXY(260, 323).lineToXY(260, 335).createCurve();
    const l = CurveBuilder.create().beginXY(260, 335)
        .addBezierXY(252, 345, 242, 347, 232, 341).createCurve();
    const r = CurveBuilder.create().beginXY(260, 335)
        .addBezierXY(268, 345, 278, 347, 288, 341).createCurve();
    addCurve([v, l, r], noneFill, inkFill, 'Mouth', lsdMouth);
})();

// ---------- whiskers ----------
(function () {
    const w = (x1, y1, x2, y2, cx1, cy1, cx2, cy2) => {
        const b = CurveBuilder.create();
        b.beginXY(x1, y1);
        b.addBezierXY(cx1, cy1, cx2, cy2, x2, y2);
        return b.createCurve();
    };
    addCurve([
        w(208, 306, 115, 294, 185, 302, 150, 296),
        w(206, 316, 108, 316, 183, 315, 145, 316),
        w(208, 326, 118, 342, 185, 330, 152, 338),
        w(312, 306, 405, 294, 335, 302, 370, 296),
        w(314, 316, 412, 316, 337, 315, 375, 316),
        w(312, 326, 402, 342, 335, 330, 368, 338),
    ], noneFill, inkFill, 'Whiskers', lsdWhisker);
})();

doc.selection = null;
console.log('nodes:', doc.currentSpread.children.all.toArray()
    .map(n => n.userDescription || n.constructor.name).join(', '));
console.log('UUID', doc.sessionUuid);
