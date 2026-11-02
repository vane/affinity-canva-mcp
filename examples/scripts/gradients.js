// Gradient showcase - a sunset built entirely from gradient fills and strokes.
//
// Node structure (bottom to top):
//   Sky          - full-bleed linear gradient (navy -> violet -> coral)
//   Sun          - elliptical gradient (pale gold centre -> orange edge)
//   Orbs         - small elliptical-gradient circles in the sky
//   Water        - linear-gradient band along the bottom
//   Ridge        - polycurve mountain silhouette with a linear gradient
//   Reflections  - thin elliptical-gradient ellipses on the water
//   Frame        - rectangle with no fill and a gradient stroke
//
// A gradient's extent comes from the FillDescriptor transform, which maps the
// gradient's unit square into spread space: linear gradients ramp along +x from
// the transform origin, and elliptical ones are centred on it with radii taken
// from the transform's scale. Passing no transform leaves the identity, which
// collapses the ramp into a 1 px box at the spread origin - so each gradient
// here is given the transform that spans its node's bounds, matching what the
// SVG shim assumes.
//
// Run directly with the Affinity MCP `execute_script` tool. It reuses the open
// document only when it is already 800x600 and otherwise creates a new one.

const { Document, NewDocumentOptions } = require('/document.js');
const { ShapeNodeDefinition, PolyCurveNodeDefinition } = require('/nodes.js');
const { ShapeRectangle, ShapeEllipse } = require('/shapes.js');
const { Rectangle, CurveBuilder, PolyCurve, Transform } = require('/geometry.js');
const { RGB8, Gradient } = require('/colours.js');
const { FillDescriptor, GradientFill, GradientFillType } = require('/fills.js');
const {
    LineStyle, LineStyleDescriptor,
    LineCap, LineJoin, LineType, StrokeAlignment,
} = require('/linestyle.js');
const { UnitType } = require('/units.js');

// ---------- document ----------
let doc = Document.current;
if (!doc || doc.widthPixels !== 800 || doc.heightPixels !== 600) {
    const opts = NewDocumentOptions.createDefault();
    opts.units = UnitType.Pixel;
    opts.width = 800;
    opts.height = 600;
    opts.dpi = 300;
    opts.marginsEnabled = false;
    doc = Document.create(opts);
}
doc.selectAll(false);
doc.deleteSelection(null, false);

// ---------- palette ----------
const NIGHT   = RGB8(16, 24, 64);
const VIOLET  = RGB8(96, 60, 140);
const CORAL   = RGB8(232, 96, 120);
const GOLD    = RGB8(255, 248, 190);
const AMBER   = RGB8(255, 190, 70);
const ORANGE  = RGB8(240, 110, 50);
const RIDGE_A = RGB8(58, 48, 104);
const RIDGE_B = RGB8(30, 34, 72);
const WATER_A = RGB8(56, 96, 160);
const WATER_B = RGB8(20, 44, 92);
const GLOW    = RGB8(255, 220, 140);
const DEEP    = RGB8(80, 110, 170);
const FRAME_A = RGB8(255, 210, 120);
const FRAME_B = RGB8(120, 220, 230);

const noneFill = FillDescriptor.createNone();

const mkLsd = (w, cap, join) => LineStyleDescriptor.create(
    LineStyle.create({ weight: w, cap, join, type: LineType.Solid }),
    { strokeAlignment: StrokeAlignment.Centre });
const lsdThin = mkLsd(2, LineCap.Round, LineJoin.Round);
const lsdFrame = mkLsd(12, LineCap.Butt, LineJoin.Miter);

// ---------- gradient helpers ----------
// Evenly spaced stops from a list of colours.
function gradient(colours) {
    return Gradient.create(colours.map((colour, i) => ({
        colour,
        position: i / (colours.length - 1),
    })));
}

// Linear gradient ramping left to right across `rect`.
function linear(rect, ...colours) {
    return FillDescriptor.create(
        GradientFill.create(gradient(colours), GradientFillType.Linear),
        false,
        Transform.createTranslate(rect.x, rect.y)
            .multiply(Transform.createScale(rect.width, rect.height)),
        null,
        false);
}

// Elliptical gradient centred on `rect`, reaching the edge of the box.
function elliptical(rect, ...colours) {
    return FillDescriptor.create(
        GradientFill.create(gradient(colours), GradientFillType.Elliptical),
        false,
        Transform.createTranslate(rect.x + rect.width / 2, rect.y + rect.height / 2)
            .multiply(Transform.createScale(rect.width / 2, rect.height / 2)),
        null,
        false);
}

// ---------- node helpers ----------
function addShape(shape, rect, brushFill, lineFill, name, lineStyle) {
    const def = ShapeNodeDefinition.create(
        shape, rect, brushFill, lineFill, lineStyle || lsdThin, noneFill);
    def.userDescription = name;
    doc.addNode(def);
}

function addPolyCurve(curve, brushFill, lineFill, name, lineStyle) {
    const pc = PolyCurve.create();
    pc.addCurve(curve);
    const def = PolyCurveNodeDefinition.create(
        pc, brushFill, lineFill, lineStyle || lsdThin, noneFill);
    def.userDescription = name;
    doc.addNode(def);
}

// ---------- sky, sun and orbs ----------
const skyRect = new Rectangle(0, 0, 800, 600);
addShape(ShapeRectangle.create(), skyRect,
    linear(skyRect, NIGHT, VIOLET, CORAL), noneFill, 'Sky');

const sunRect = new Rectangle(520, 100, 220, 220);
addShape(ShapeEllipse.create(), sunRect,
    elliptical(sunRect, GOLD, AMBER, ORANGE), noneFill, 'Sun');

const orbLeftRect = new Rectangle(120, 140, 50, 50);
addShape(ShapeEllipse.create(), orbLeftRect,
    elliptical(orbLeftRect, GOLD, ORANGE), noneFill, 'Orb left');
const orbMiddleRect = new Rectangle(300, 200, 40, 40);
addShape(ShapeEllipse.create(), orbMiddleRect,
    elliptical(orbMiddleRect, GOLD, ORANGE), noneFill, 'Orb middle');
const orbRightRect = new Rectangle(700, 50, 40, 40);
addShape(ShapeEllipse.create(), orbRightRect,
    elliptical(orbRightRect, GOLD, ORANGE), noneFill, 'Orb right');

// ---------- water ----------
const waterRect = new Rectangle(0, 470, 800, 130);
addShape(ShapeRectangle.create(), waterRect,
    linear(waterRect, WATER_A, WATER_B), noneFill, 'Water');

// ---------- mountain ridge ----------
(function () {
    const points = [
        [0, 470], [0, 380], [90, 320], [180, 390], [280, 290], [390, 380],
        [500, 310], [620, 400], [720, 340], [800, 380], [800, 470],
    ];

    const builder = CurveBuilder.create().beginXY(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
        builder.lineToXY(points[i][0], points[i][1]);
    }
    const ridge = builder.close().createCurve();

    // The gradient spans the curve's bounds, which is also the node's box.
    const xs = points.map(p => p[0]);
    const ys = points.map(p => p[1]);
    const bounds = new Rectangle(
        Math.min(...xs), Math.min(...ys),
        Math.max(...xs) - Math.min(...xs),
        Math.max(...ys) - Math.min(...ys));

    addPolyCurve(ridge, linear(bounds, RIDGE_A, RIDGE_B), noneFill, 'Ridge');
})();

// ---------- reflections ----------
const reflWideRect = new Rectangle(540, 505, 140, 12);
addShape(ShapeEllipse.create(), reflWideRect,
    elliptical(reflWideRect, GLOW, DEEP), noneFill, 'Reflection wide');
const reflMiddleRect = new Rectangle(500, 535, 90, 9);
addShape(ShapeEllipse.create(), reflMiddleRect,
    elliptical(reflMiddleRect, GLOW, DEEP), noneFill, 'Reflection middle');
const reflNarrowRect = new Rectangle(590, 565, 70, 7);
addShape(ShapeEllipse.create(), reflNarrowRect,
    elliptical(reflNarrowRect, GLOW, DEEP), noneFill, 'Reflection narrow');

// ---------- gradient-stroked frame ----------
const frameRect = new Rectangle(6, 6, 788, 588);
addShape(ShapeRectangle.create(), frameRect,
    noneFill, linear(frameRect, FRAME_A, FRAME_B), 'Frame', lsdFrame);

doc.selection = null;
console.log('nodes:', doc.currentSpread.children.all.toArray()
    .map(n => n.userDescription || n.constructor.name).join(', '));
console.log('UUID', doc.sessionUuid);
