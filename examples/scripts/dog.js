// Cartoon dog - rounded head, floppy ears, cream muzzle, collar and tag.
//
// Node structure (bottom to top):
//   Background   - full-bleed rectangle
//   Leg left / right   - front legs, drawn BEFORE the body so it hides their tops
//   Paw left / right   - rounded paws over the leg ends
//   Body               - sitting torso: narrow shoulders flaring to a wide base
//   Collar             - blue band, drawn before the head so the chin hides its top
//   Tag                - round gold tag hanging under the collar
//   Head               - rounded rectangle with big top corners
//   Ear left / right   - floppy ears drawn IN FRONT of the head
//   Muzzle             - cream oval
//   Nose               - dark rounded shape with a flat top
//   Eye left / right   - dark circles
//   Highlight left / right - small white dots, upper-left of each eye
//   Mouth              - centre line plus two smile curves (thinner stroke)
//
// The ears are the fiddly part. Drawn BEHIND the head they only show as a crescent
// outside the silhouette, and the visible part bulges at the head's widest point -
// which reads as wings or handles rather than ears. Drawn IN FRONT, the whole
// teardrop shape is visible and hangs down past the jaw, which reads correctly.
// The seam where the ear meets the head is the normal cartoon convention.
//
// The mouth uses its own thinner LineStyleDescriptor (6 px) while everything else
// uses 8 px, so addCurve() takes an optional line-style argument.
//
// Fill arguments to PolyCurveNodeDefinition.create must be FillDescriptors, not
// raw Colours - a bare RGB8() throws "expected FillDescriptorHandle".
//
// Run directly with the Affinity MCP `execute_script` tool. It reuses the open
// document only when it is already 600x800 and otherwise creates a new one, so
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
if (!doc || doc.widthPixels !== 600 || doc.heightPixels !== 800) {
    const opts = NewDocumentOptions.createDefault();
    opts.units = UnitType.Pixel;
    opts.width = 600;
    opts.height = 800;
    opts.dpi = 300;
    opts.marginsEnabled = false;
    doc = Document.create(opts);
}
doc.selectAll(false);
doc.deleteSelection(null, false);

// ---------- palette ----------
const FUR    = RGB8(200, 148, 100);
const EAR    = RGB8(178, 126, 82);
const MUZZLE = RGB8(250, 234, 212);
const NOSE   = RGB8(48, 40, 42);
const EYE    = RGB8(38, 32, 36);
const WHITE  = RGB8(255, 255, 255);
const COLLAR = RGB8(72, 122, 190);
const TAG    = RGB8(232, 190, 72);
const INK    = RGB8(32, 28, 30);
const PAPER  = RGB8(246, 242, 233);

const F = (c) => FillDescriptor.createSolid(c);
const furFill = F(FUR), earFill = F(EAR), muzzleFill = F(MUZZLE);
const noseFill = F(NOSE), eyeFill = F(EYE), whiteFill = F(WHITE);
const collarFill = F(COLLAR), tagFill = F(TAG), inkFill = F(INK), paperFill = F(PAPER);
const noneFill = FillDescriptor.createNone();

const lsd = LineStyleDescriptor.create(
    LineStyle.create({ weight: 8, cap: LineCap.Round, join: LineJoin.Round, type: LineType.Solid }),
    { strokeAlignment: StrokeAlignment.Centre });
const lsdThin = LineStyleDescriptor.create(
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

// ---------- front legs (behind the body) ----------
addCurve(capsuleCurve(245, 520, 245, 690, 48), furFill, inkFill, 'Leg left');
addCurve(capsuleCurve(355, 520, 355, 690, 48), furFill, inkFill, 'Leg right');

// ---------- paws ----------
addCurve(ellipseCurve(245, 702, 36, 22), furFill, inkFill, 'Paw left');
addCurve(ellipseCurve(355, 702, 36, 22), furFill, inkFill, 'Paw right');

// ---------- body: sitting torso, flared base ----------
(function () {
    const b = CurveBuilder.create();
    b.beginXY(225, 320);
    b.addBezierXY(207, 390, 198, 490, 200, 540);
    b.addBezierXY(206, 585, 394, 585, 400, 540);
    b.addBezierXY(402, 490, 393, 390, 375, 320);
    b.close();
    addCurve(b.createCurve(), furFill, inkFill, 'Body');
})();

// ---------- collar + tag (before the head, so the chin hides the collar's top) ----------
addCurve(roundedRectCurve(232, 330, 136, 34, 10, 10, 10, 10), collarFill, inkFill, 'Collar');
addCurve(ellipseCurve(300, 384, 14, 14), tagFill, inkFill, 'Tag');

// ---------- head ----------
addCurve(roundedRectCurve(180, 84, 260, 256, 95, 95, 75, 75), furFill, inkFill, 'Head');

// ---------- floppy ears (in front of the head) ----------
(function () {
    const b = CurveBuilder.create();
    b.beginXY(210, 120);
    b.addBezierXY(165, 130, 140, 200, 140, 270);
    b.addBezierXY(142, 330, 165, 352, 185, 346);
    b.addBezierXY(205, 300, 215, 180, 210, 120);
    b.close();
    addCurve(b.createCurve(), earFill, inkFill, 'Ear left');
})();

(function () {
    const b = CurveBuilder.create();
    b.beginXY(390, 120);
    b.addBezierXY(435, 130, 460, 200, 460, 270);
    b.addBezierXY(458, 330, 435, 352, 415, 346);
    b.addBezierXY(395, 300, 385, 180, 390, 120);
    b.close();
    addCurve(b.createCurve(), earFill, inkFill, 'Ear right');
})();

// ---------- muzzle ----------
addCurve(ellipseCurve(300, 280, 80, 54), muzzleFill, inkFill, 'Muzzle');

// ---------- nose: flat top, rounded bottom ----------
(function () {
    const b = CurveBuilder.create();
    b.beginXY(272, 230);
    b.lineToXY(328, 230);
    b.addBezierXY(334, 252, 318, 268, 300, 268);
    b.addBezierXY(282, 268, 266, 252, 272, 230);
    b.close();
    addCurve(b.createCurve(), noseFill, inkFill, 'Nose');
})();

// ---------- eyes ----------
addCurve(ellipseCurve(253, 185, 22, 22), eyeFill, inkFill, 'Eye left');
addCurve(ellipseCurve(347, 185, 22, 22), eyeFill, inkFill, 'Eye right');
addCurve(ellipseCurve(245, 177, 8, 8), whiteFill, noneFill, 'Highlight left');
addCurve(ellipseCurve(339, 177, 8, 8), whiteFill, noneFill, 'Highlight right');

// ---------- mouth: centre line plus two smile curves ----------
(function () {
    const v = CurveBuilder.create().beginXY(300, 268).lineToXY(300, 290).createCurve();
    const l = CurveBuilder.create().beginXY(300, 290)
        .addBezierXY(292, 302, 280, 304, 266, 298).createCurve();
    const r = CurveBuilder.create().beginXY(300, 290)
        .addBezierXY(308, 302, 320, 304, 334, 298).createCurve();
    addCurve([v, l, r], noneFill, inkFill, 'Mouth', lsdThin);
})();

doc.selection = null;
console.log('nodes:', doc.currentSpread.children.all.toArray()
    .map(n => n.userDescription || n.constructor.name).join(', '));
console.log('UUID', doc.sessionUuid);
