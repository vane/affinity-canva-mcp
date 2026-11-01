// Shape coverage fixture: one of every shape the SVG shim implements, in a 4x4 grid
// on a 640x640 page. Run it through the shim (node render.js test/shapes.js out/shapes.svg)
// or paste it into Affinity to compare the two outputs.
//
// Cells are 160x160 with a 110x110 shape centred in each.

const { Document, NewDocumentOptions } = require('/document.js');
const { ShapeNodeDefinition } = require('/nodes.js');
const {
    ShapeRectangle, ShapeEllipse, ShapePolygon, ShapeStar, ShapeTriangle, ShapeDiamond,
    ShapeTrapezoid, ShapePie, ShapeHeart, ShapeSegment, ShapeCloud, ShapeSquareStar,
    ShapeDoubleStar, ShapeCog, ShapeArrow, ShapeTear, ShapeCornerType,
} = require('/shapes.js');
const { Rectangle } = require('/geometry.js');
const { RGB8 } = require('/colours.js');
const { FillDescriptor } = require('/fills.js');
const {
    LineStyle, LineStyleDescriptor,
    LineCap, LineJoin, LineType, StrokeAlignment,
} = require('/linestyle.js');
const { UnitType } = require('/units.js');

let doc = Document.current;
if (!doc || doc.widthPixels !== 640 || doc.heightPixels !== 640) {
    const opts = NewDocumentOptions.createDefault();
    opts.units = UnitType.Pixel;
    opts.width = 640;
    opts.height = 640;
    opts.dpi = 300;
    opts.marginsEnabled = false;
    doc = Document.create(opts);
}
doc.selectAll(false);
doc.deleteSelection(null, false);

const fill = FillDescriptor.createSolid(RGB8(210, 150, 120));
const stroke = FillDescriptor.createSolid(RGB8(30, 30, 34));
const noneFill = FillDescriptor.createNone();
const lsd = LineStyleDescriptor.create(
    LineStyle.create({ weight: 4, cap: LineCap.Round, join: LineJoin.Round, type: LineType.Solid }),
    { strokeAlignment: StrokeAlignment.Centre });

const CELL = 160;
const SIZE = 110;

function add(shape, col, row, name) {
    const x = col * CELL + (CELL - SIZE) / 2;
    const y = row * CELL + (CELL - SIZE) / 2;
    const def = ShapeNodeDefinition.create(
        shape, new Rectangle(x, y, SIZE, SIZE), fill, stroke, lsd, noneFill);
    def.userDescription = name;
    doc.addNode(def);
}

// Rectangle with two rounded corners, two square.
// The radius is a fraction of the shape's smaller side, and cornerType must be Round
// first: Affinity ignores a radius on a corner left at None.
const rect = ShapeRectangle.create();
rect.topLeft.cornerType = ShapeCornerType.Round;
rect.topRight.cornerType = ShapeCornerType.Round;
rect.topLeft.setRadius(0.2, SIZE, SIZE);
rect.topRight.setRadius(0.2, SIZE, SIZE);
rect.bottomLeft.setRadius(0, SIZE, SIZE);
rect.bottomRight.setRadius(0, SIZE, SIZE);

add(rect, 0, 0, 'Rectangle');
add(ShapeEllipse.create(), 1, 0, 'Ellipse');
add(ShapePolygon.create(), 2, 0, 'Polygon');
add(ShapeStar.create(), 3, 0, 'Star');

add(ShapeTriangle.create(), 0, 1, 'Triangle');
add(ShapeDiamond.create(), 1, 1, 'Diamond');
add(ShapeTrapezoid.create(), 2, 1, 'Trapezoid');
add(ShapePie.create(), 3, 1, 'Pie');

add(ShapeHeart.create(), 0, 2, 'Heart');
add(ShapeSegment.create(), 1, 2, 'Segment');
add(ShapeCloud.create(), 2, 2, 'Cloud');
add(ShapeSquareStar.create(), 3, 2, 'SquareStar');

add(ShapeDoubleStar.create(), 0, 3, 'DoubleStar');
add(ShapeCog.create(), 1, 3, 'Cog');
add(ShapeArrow.create(), 2, 3, 'Arrow');
add(ShapeTear.create(), 3, 3, 'Tear');

doc.selection = null;
console.log('nodes:', doc.currentSpread.children.all.toArray()
    .map((n) => n.userDescription || n.constructor.name).join(', '));
console.log('UUID', doc.sessionUuid, doc.widthPixels + 'x' + doc.heightPixels);
