// ShapeCloud fixture: three bubble counts side by side.
//
// innerRadius is set per cloud so each apex reaches the bounding radius. That value is
// 1 / (cos(PI/n) + sin(PI/n)), which is 0.8165 for the default 12 bubbles.
//
// Render with: node render.js test/cloud.js out/cloud.svg

const { Document, NewDocumentOptions } = require('/document.js');
const { ShapeNodeDefinition } = require('/nodes.js');
const { ShapeCloud } = require('/shapes.js');
const { Rectangle } = require('/geometry.js');
const { RGB8 } = require('/colours.js');
const { FillDescriptor } = require('/fills.js');
const {
    LineStyle, LineStyleDescriptor,
    LineCap, LineJoin, LineType, StrokeAlignment,
} = require('/linestyle.js');
const { UnitType } = require('/units.js');

let doc = Document.current;
if (!doc || doc.widthPixels !== 640 || doc.heightPixels !== 240) {
    const opts = NewDocumentOptions.createDefault();
    opts.units = UnitType.Pixel;
    opts.width = 640;
    opts.height = 240;
    opts.dpi = 300;
    opts.marginsEnabled = false;
    doc = Document.create(opts);
}
doc.selectAll(false);
doc.deleteSelection(null, false);

const ink = FillDescriptor.createSolid(RGB8(30, 30, 34));
const noneFill = FillDescriptor.createNone();
const lsd = LineStyleDescriptor.create(
    LineStyle.create({ weight: 6, cap: LineCap.Round, join: LineJoin.Round, type: LineType.Solid }),
    { strokeAlignment: StrokeAlignment.Centre });

const FILLS = [
    FillDescriptor.createSolid(RGB8(232, 178, 132)),
    FillDescriptor.createSolid(RGB8(140, 186, 226)),
    FillDescriptor.createSolid(RGB8(168, 206, 150)),
];

const SIZE = 160;

[6, 12, 20].forEach((bubbles, i) => {
    const cloud = ShapeCloud.create();
    cloud.bubbles = bubbles;
    cloud.innerRadius = 1 / (Math.cos(Math.PI / bubbles) + Math.sin(Math.PI / bubbles));

    const x = 40 + i * 200;
    const def = ShapeNodeDefinition.create(
        cloud, new Rectangle(x, 40, SIZE, SIZE), FILLS[i], ink, lsd, noneFill);
    def.userDescription = 'Cloud ' + bubbles + ' bubbles';
    doc.addNode(def);
});

doc.selection = null;
console.log('nodes:', doc.currentSpread.children.all.toArray()
    .map((n) => n.userDescription || n.constructor.name).join(', '));
console.log('UUID', doc.sessionUuid, doc.widthPixels + 'x' + doc.heightPixels);
