// Tests for the document stand-in, node definitions and the SVG writer.
//
// Run from svg-renderer/ with:  node --test test/*.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const { ShimDocument, NewDocumentOptions } = require("../shim/document.js");
const { PolyCurveNodeDefinition, ShapeNodeDefinition } = require("../shim/nodes.js");
const { Rectangle, CurveBuilder, PolyCurve } = require("../shim/geometry.js");
const { RGB8 } = require("../shim/colours.js");
const { FillDescriptor } = require("../shim/fills.js");
const {
  LineStyle, LineStyleDescriptor,
} = require("../shim/linestyle.js");
const {
  UnitType, LineCap, LineJoin, LineType, StrokeAlignment,
} = require("../shim/enums.js");
const svg = require("../shim/svg.js");
const shapes = require("../shim/shapes.js");

const { fmt, hexOf, pathData, closedSubpathCount, svgFromDocument } = svg;

const lsd = LineStyleDescriptor.create(
  LineStyle.create({ weight: 4, cap: LineCap.Round, join: LineJoin.Round, type: LineType.Solid }),
  { strokeAlignment: StrokeAlignment.Centre },
);

function squarePolyCurve(size) {
  const c = CurveBuilder.create()
    .beginXY(0, 0)
    .lineToXY(size, 0)
    .lineToXY(size, size)
    .lineToXY(0, size)
    .close()
    .createCurve();
  const pc = PolyCurve.create();
  pc.addCurve(c);
  return pc;
}

// ------------------------------------------------------------------ document

test("NewDocumentOptions.createDefault returns an editable options object", () => {
  const o = NewDocumentOptions.createDefault();
  assert.equal(o.units, UnitType.Millimetre);
  assert.equal(o.width, 210);
  assert.equal(o.height, 297);
  assert.equal(o.dpi, 300);
  assert.equal(o.marginsEnabled, false);
  assert.equal(o.pageCount, 1);
  // Callers mutate it before Document.create, so it must not be frozen.
  o.width = 640;
  assert.equal(o.width, 640);
  assert.equal(NewDocumentOptions.createDefault().width, 210, "a fresh copy each call");
});

test("ShimDocument exposes size, uuid, nodes and selection", () => {
  const doc = new ShimDocument({ width: 640, height: 480, dpi: 300, units: UnitType.Pixel });
  assert.equal(doc.widthPixels, 640);
  assert.equal(doc.heightPixels, 480);
  assert.equal(doc.dpi, 300);
  assert.equal(doc.units, UnitType.Pixel);
  assert.equal(doc.title, "shim");
  assert.match(doc.sessionUuid, /^shim-\d+$/);
  assert.deepEqual(doc.nodes, []);
  assert.equal(doc.selection, null);

  const other = new ShimDocument({ width: 1, height: 1 });
  assert.notEqual(other.sessionUuid, doc.sessionUuid, "uuids must be unique");
});

test("ShimDocument.addNode pushes, selects, and returns undefined", () => {
  const doc = new ShimDocument({ width: 100, height: 100 });
  const def = ShapeNodeDefinition.create(shapes.ShapeRectangle.create(), new Rectangle(0, 0, 10, 10));

  const ret = doc.addNode(def);
  assert.equal(ret, undefined, "matches the real SDK");
  assert.equal(doc.nodes.length, 1);
  assert.deepEqual(doc.selection.nodes.toArray(), [def]);

  doc.addNode(ShapeNodeDefinition.create(shapes.ShapeEllipse.create(), new Rectangle(0, 0, 5, 5)));
  assert.equal(doc.nodes.length, 2);
  assert.equal(doc.selection.nodes.toArray().length, 1, "selection is the newest node only");
});

test("ShimDocument.selectAll and deleteSelection", () => {
  const doc = new ShimDocument({ width: 100, height: 100 });
  doc.addNode(ShapeNodeDefinition.create(shapes.ShapeRectangle.create(), new Rectangle(0, 0, 10, 10)));
  doc.addNode(ShapeNodeDefinition.create(shapes.ShapeRectangle.create(), new Rectangle(0, 0, 10, 10)));

  doc.selectAll(false);
  assert.equal(doc.selection.nodes.toArray().length, 2);

  doc.deleteSelection(null, false);
  assert.deepEqual(doc.nodes, []);
  assert.equal(doc.selection, null);

  doc.addNode(ShapeNodeDefinition.create(shapes.ShapeRectangle.create(), new Rectangle(0, 0, 10, 10)));
  assert.deepEqual(doc.currentSpread.children.all.toArray(), doc.nodes);
});

// ------------------------------------------------------------------ node definitions

test("ShapeNodeDefinition derives geometry from the shape and rectangle", () => {
  const def = ShapeNodeDefinition.create(shapes.ShapeEllipse.create(), new Rectangle(10, 20, 40, 60));
  assert.equal(def.polyCurve.curveCount, 1);
  assert.equal(def.polyCurve.at(0).beziers.length, 4);
  const first = def.polyCurve.at(0).beziers[0].start;
  assert.deepEqual(first, { x: 30, y: 20 }, "ellipse starts at top centre");
  assert.equal(def.userDescription, "");
  // Missing fills normalise to none.
  assert.equal(def.brushFill.kind, "none");
  assert.equal(def.lineFill.kind, "none");
});

test("ShapeNodeDefinition accepts a bare Colour as the brush fill", () => {
  const def = ShapeNodeDefinition.create(
    shapes.ShapeRectangle.create(), new Rectangle(0, 0, 10, 10), RGB8(10, 20, 30));
  assert.equal(def.brushFill.kind, "solid");
  assert.equal(def.brushFill.colour.rgba8.b, 30);
});

test("PolyCurveNodeDefinition requires real descriptors", () => {
  const pc = squarePolyCurve(10);
  assert.throws(
    () => PolyCurveNodeDefinition.create(pc, RGB8(0, 0, 0), FillDescriptor.createNone(),
      lsd, FillDescriptor.createNone()),
    /expected FillDescriptorHandle/,
    "a raw colour is rejected, as in the SDK",
  );
  assert.throws(
    () => PolyCurveNodeDefinition.create(pc, FillDescriptor.createSolid(RGB8(0, 0, 0)),
      FillDescriptor.createNone(), LineStyle.create({ weight: 1 }), FillDescriptor.createNone()),
    /expected parameter lineStyleDescriptor to be LineStyleDescriptorHandle/,
  );

  const brush = FillDescriptor.createSolid(RGB8(1, 2, 3));
  const def = PolyCurveNodeDefinition.create(pc, brush, FillDescriptor.createNone(), lsd,
    FillDescriptor.createNone());
  assert.equal(def.polyCurve, pc);
  assert.equal(def.brushFill, brush);
  assert.equal(def.lineStyleDescriptor, lsd);
  assert.equal(def.userDescription, "");
});

// ------------------------------------------------------------------ svg helpers

test("fmt rounds to two decimals without trailing zeros", () => {
  assert.equal(fmt(1.234), "1.23");
  assert.equal(fmt(1.235), "1.24");
  assert.equal(fmt(2), "2");
  assert.equal(fmt(-0.001), "0");
});

test("hexOf pads and clamps channel values", () => {
  assert.equal(hexOf({ r: 255, g: 0, b: 16, alpha: 255 }), "#ff0010");
  assert.equal(hexOf({ r: 300, g: -5, b: 128, alpha: 255 }), "#ff0080");
});

test("pathData emits M, cubics and Z for closed subpaths", () => {
  const pc = squarePolyCurve(10);
  const d = pathData(pc);
  assert.equal(d, "M 0 0 C 0 0 10 0 10 0 C 10 0 10 10 10 10 C 10 10 0 10 0 10 C 0 10 0 0 0 0 Z");

  // Open curve: no Z.
  const open = CurveBuilder.create().beginXY(0, 0).addBezierXY(1, 1, 2, 2, 3, 3).createCurve();
  const opc = PolyCurve.create();
  opc.addCurve(open);
  assert.ok(!pathData(opc).endsWith("Z"));
});

test("pathData skips empty curves and returns an empty string when nothing is left", () => {
  const pc = PolyCurve.create();
  pc.addCurve(CurveBuilder.create().createCurve());
  assert.equal(pathData(pc), "");
  assert.equal(closedSubpathCount(pc), 0);
});

test("closedSubpathCount counts only non-empty closed curves", () => {
  const pc = PolyCurve.create();
  pc.addCurve(CurveBuilder.create().beginXY(0, 0).lineToXY(1, 1).close().createCurve());
  pc.addCurve(CurveBuilder.create().beginXY(2, 2).lineToXY(3, 3).close().createCurve());
  pc.addCurve(CurveBuilder.create().beginXY(4, 4).lineToXY(5, 5).createCurve());
  assert.equal(closedSubpathCount(pc), 2);
});

// ------------------------------------------------------------------ document -> svg

function makeDoc() {
  const doc = new ShimDocument({ width: 100, height: 100 });
  const fill = FillDescriptor.createSolid(RGB8(210, 150, 120));
  const stroke = FillDescriptor.createSolid(RGB8(30, 30, 34));
  const none = FillDescriptor.createNone();

  doc.addNode(ShapeNodeDefinition.create(
    shapes.ShapeRectangle.create(), new Rectangle(0, 0, 100, 100), fill, stroke, lsd, none));
  return doc;
}

test("svgFromDocument writes a header and one path per node", () => {
  const doc = makeDoc();
  const out = svgFromDocument(doc);

  assert.ok(out.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">'));
  assert.ok(out.endsWith("</svg>"));
  assert.equal(out.split("<path ").length - 1, 1);
  assert.match(out, /fill="#d29678"/);
  assert.match(out, /stroke="#1e1e22"/);
  assert.match(out, /stroke-width="4"/);
  assert.match(out, /stroke-linecap="round"/);
  assert.match(out, /stroke-linejoin="round"/);
});

test("svgFromDocument emits fill-rule=evenodd when a node has several closed subpaths", () => {
  const doc = new ShimDocument({ width: 100, height: 100 });
  const fill = FillDescriptor.createSolid(RGB8(1, 2, 3));
  doc.addNode(ShapeNodeDefinition.create(
    shapes.ShapeCog.create(), new Rectangle(0, 0, 100, 100), fill,
    FillDescriptor.createNone(), lsd, FillDescriptor.createNone()));

  const out = svgFromDocument(doc);
  assert.match(out, /fill-rule="evenodd"/);
});

test("svgFromDocument omits fill for unfilled nodes and opacity when translucent", () => {
  const doc = new ShimDocument({ width: 50, height: 50 });
  doc.addNode(ShapeNodeDefinition.create(
    shapes.ShapeRectangle.create(), new Rectangle(0, 0, 50, 50),
    FillDescriptor.createNone(), FillDescriptor.createNone(), lsd, FillDescriptor.createNone()));
  assert.match(svgFromDocument(doc), /fill="none"/);

  const translucent = new ShimDocument({ width: 50, height: 50 });
  translucent.addNode(ShapeNodeDefinition.create(
    shapes.ShapeRectangle.create(), new Rectangle(0, 0, 50, 50),
    FillDescriptor.createSolid({ isColour: true, rgba8: { r: 255, g: 0, b: 0, alpha: 128 } }),
    FillDescriptor.createNone(), lsd, FillDescriptor.createNone()));
  assert.match(svgFromDocument(translucent), /fill-opacity="0.5"/);
});

test("svgFromDocument skips nodes without geometry", () => {
  const doc = new ShimDocument({ width: 10, height: 10 });
  doc.nodes.push({ polyCurve: PolyCurve.create(), brushFill: null, lineFill: null });
  const out = svgFromDocument(doc);
  assert.equal(out.split("<path ").length - 1, 0);
});
