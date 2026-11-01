// South Park Stan Marsh - flat colour, NO outlines (the show's style).
//
// Node structure (bottom to top):
//   Background   - full-bleed rectangle
//   Shoe left / right        - dark rounded slabs
//   Leg left / right         - denim-blue jeans
//   Jacket                   - brown torso, heavily rounded shoulders
//   Collar                   - red shirt band; drawn BEFORE the head so the
//                              chin covers its top edge
//   Sleeve left / right      - same brown as the jacket, so they merge into the
//                              silhouette with no visible seam
//   Hand left / right        - skin blobs at the sleeve ends
//   Head                     - large oval
//   Hair left / right        - thin crescents hugging the head edge, below the
//                              hat brim (ellipses here read as earmuffs)
//   Hat                      - dome + straight brim edge
//   Hat brim                 - slightly darker rolled fold
//   Eye left / right         - tall white ovals, nearly touching
//   Pupil left / right       - small dots, offset inward
//   Mouth                    - the only stroked element (thin black curve)
//
// Because there are no outlines, overlapping shapes of the same fill merge on
// their own - no boolean welding is needed anywhere in this drawing.
//
// Fill arguments to PolyCurveNodeDefinition.create must be FillDescriptors, not
// raw Colours - a bare RGB8() throws "expected FillDescriptorHandle".
//
// Run directly with the Affinity MCP `execute_script` tool. It reuses the open
// document only when it is already 500x800 and otherwise creates a new one, so
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
if (!doc || doc.widthPixels !== 500 || doc.heightPixels !== 800) {
    const opts = NewDocumentOptions.createDefault();
    opts.units = UnitType.Pixel;
    opts.width = 500;
    opts.height = 800;
    opts.dpi = 300;
    opts.marginsEnabled = false;
    doc = Document.create(opts);
}
doc.selectAll(false);
doc.deleteSelection(null, false);

// ---------- palette ----------
const SKIN     = RGB8(245, 200, 172);
const HAIR     = RGB8(72, 46, 30);
const HAT      = RGB8(70, 118, 188);
const HAT_DARK = RGB8(46, 82, 134);
const JACKET   = RGB8(146, 94, 58);
const COLLAR   = RGB8(198, 66, 50);
const JEANS    = RGB8(60, 90, 142);
const SHOE     = RGB8(30, 30, 34);
const EYE      = RGB8(255, 255, 255);
const PUPIL    = RGB8(22, 22, 24);
const INK      = RGB8(30, 30, 34);
const PAPER    = RGB8(246, 242, 233);

const F = (c) => FillDescriptor.createSolid(c);
const skinFill = F(SKIN), hairFill = F(HAIR), hatFill = F(HAT), hatDarkFill = F(HAT_DARK);
const jacketFill = F(JACKET), collarFill = F(COLLAR), jeansFill = F(JEANS), shoeFill = F(SHOE);
const eyeFill = F(EYE), pupilFill = F(PUPIL), inkFill = F(INK), paperFill = F(PAPER);
const noneFill = FillDescriptor.createNone();

// Only the mouth is stroked, so this weight is effectively the mouth weight.
const lsd = LineStyleDescriptor.create(
    LineStyle.create({ weight: 6, cap: LineCap.Round, join: LineJoin.Round, type: LineType.Solid }),
    { strokeAlignment: StrokeAlignment.Centre });

// ---------- helpers ----------
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

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

// Thin sliver between two concentric ellipse arcs - used for the sideburns so
// the hair follows the head's curve instead of sitting on it as a blob.
function crescentCurve(cx, cy, rox, roy, rix, riy, a1, a2) {
    const b = CurveBuilder.create();
    b.beginXY(cx + rox * Math.cos(a1), cy + roy * Math.sin(a1));
    arcTo(b, cx, cy, rox, roy, a1, a2);
    b.lineToXY(cx + rix * Math.cos(a2), cy + riy * Math.sin(a2));
    arcTo(b, cx, cy, rix, riy, a2, a1);
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

// ---------- shoes ----------
addCurve(roundedRectCurve(162, 688, 84, 46, 18, 18, 18, 18), shoeFill, noneFill, 'Shoe left');
addCurve(roundedRectCurve(254, 688, 84, 46, 18, 18, 18, 18), shoeFill, noneFill, 'Shoe right');

// ---------- jeans ----------
addCurve(roundedRectCurve(168, 582, 72, 112, 8, 8, 8, 8), jeansFill, noneFill, 'Leg left');
addCurve(roundedRectCurve(260, 582, 72, 112, 8, 8, 8, 8), jeansFill, noneFill, 'Leg right');

// ---------- jacket ----------
addCurve(roundedRectCurve(150, 358, 200, 234, 58, 58, 16, 16), jacketFill, noneFill, 'Jacket');

// ---------- shirt collar (before the head, so the chin hides its top) ----------
addCurve(roundedRectCurve(210, 360, 80, 34, 12, 12, 12, 12), collarFill, noneFill, 'Collar');

// ---------- sleeves (same fill as the jacket -> merge with no seam) ----------
addCurve(capsuleCurve(162, 376, 128, 522, 46), jacketFill, noneFill, 'Sleeve left');
addCurve(capsuleCurve(338, 376, 372, 522, 46), jacketFill, noneFill, 'Sleeve right');

// ---------- hands ----------
addCurve(ellipseCurve(128, 538, 19, 21), skinFill, noneFill, 'Hand left');
addCurve(ellipseCurve(372, 538, 19, 21), skinFill, noneFill, 'Hand right');

// ---------- head ----------
addCurve(ellipseCurve(250, 232, 130, 136), skinFill, noneFill, 'Head');

// ---------- hair: sideburn crescents hugging the head edge ----------
addCurve(crescentCurve(250, 232, 130, 136, 110, 116, 200 * DEG, 166 * DEG), hairFill, noneFill, 'Hair left');
addCurve(crescentCurve(250, 232, 130, 136, 110, 116, -20 * DEG, 14 * DEG), hairFill, noneFill, 'Hair right');

// ---------- beanie: dome + straight brim edge ----------
(function () {
    const b = CurveBuilder.create();
    b.beginXY(118, 192);
    b.lineToXY(118, 176);
    arcTo(b, 250, 176, 132, 110, Math.PI, TAU);   // dome
    b.lineToXY(382, 192);
    b.close();                                    // straight brim bottom
    addCurve(b.createCurve(), hatFill, noneFill, 'Hat');
})();

// ---------- rolled brim fold ----------
addCurve(roundedRectCurve(118, 176, 264, 16, 0, 0, 0, 0), hatDarkFill, noneFill, 'Hat brim');

// ---------- eyes ----------
addCurve(ellipseCurve(218, 260, 30, 38), eyeFill, noneFill, 'Eye left');
addCurve(ellipseCurve(282, 260, 30, 38), eyeFill, noneFill, 'Eye right');
addCurve(ellipseCurve(232, 268, 9, 9), pupilFill, noneFill, 'Pupil left');
addCurve(ellipseCurve(268, 268, 9, 9), pupilFill, noneFill, 'Pupil right');

// ---------- mouth ----------
(function () {
    const b = CurveBuilder.create();
    b.beginXY(218, 328);
    b.addBezierXY(238, 342, 262, 342, 282, 328);
    addCurve(b.createCurve(), noneFill, inkFill, 'Mouth');
})();

doc.selection = null;
console.log('nodes:', doc.currentSpread.children.all.toArray()
    .map(n => n.userDescription || n.constructor.name).join(', '));
console.log('UUID', doc.sessionUuid);
