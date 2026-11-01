// Unit tests for the shim's primitives: enums, colours, fills, line styles, geometry
// builders and the warning collector.
//
// Run from svg-renderer/ with:  node --test test/*.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const enums = require("../shim/enums.js");
const { RGB8 } = require("../shim/colours.js");
const { FillDescriptor, asFill } = require("../shim/fills.js");
const { LineStyle, LineStyleDescriptor } = require("../shim/linestyle.js");
const {
  Rectangle, Curve, CurveBuilder, PolyCurve,
  rectangleCurve, rectanglePolyCurve,
} = require("../shim/geometry.js");
const warnings = require("../shim/warnings.js");

// ------------------------------------------------------------------ enums

test("enumOf exposes keys, values, entries and name/value", () => {
  const e = enums.enumOf(["Alpha", "Beta"]);
  assert.deepEqual(e.keys, ["Alpha", "Beta"]);
  assert.equal(e.values.length, 2);
  assert.deepEqual(e.entries, [["Alpha", e.Alpha], ["Beta", e.Beta]]);
  assert.equal(e.Alpha.name, "Alpha");
  assert.equal(e.Alpha.value, "alpha");
  assert.equal(String(e.Alpha), "Alpha");
  assert.equal(String(e.Beta), "Beta");
});

test("the SDK enums carry the members the shim relies on", () => {
  assert.deepEqual(enums.ShapeCornerType.keys, ["Round", "Straight", "RoundInverse", "Cutout", "None"]);
  assert.equal(enums.ShapeCornerType.Round.value, "round");
  assert.equal(enums.ShapeCornerType.None.value, "none");

  assert.ok(enums.ShapeType.keys.includes("SquareStar"));
  assert.ok(enums.ShapeType.keys.includes("Cat4"));
  assert.ok(enums.ShapeType.keys.includes("Spiral"));

  assert.deepEqual(enums.ShapeArrowEndStyle.keys, [
    "None", "Arrow", "TailTriangular", "TailSquare", "Circle", "HalfCircleInner",
    "HalfCircleOuter", "Diamond", "Box", "Barb", "Chevron",
  ]);
  assert.deepEqual(enums.ShapeSpiralStyle.keys, [
    "SemiCircle", "CounterSemiCircle", "Fibonacci", "SegmentedLogarithmic",
    "SegmentedLinear", "Plotted",
  ]);
  // Order matches Affinity's ShapeCornerIndex.
  assert.deepEqual(enums.ShapeCornerIndex.keys, ["TopLeft", "TopRight", "BottomRight", "BottomLeft"]);

  assert.ok(enums.UnitType.keys.includes("Pixel"));
  assert.deepEqual(enums.LineCap.keys, ["Butt", "Square", "Round"]);
  assert.deepEqual(enums.StrokeAlignment.keys, ["Centre", "Inside", "Outside"]);
  assert.ok(enums.FillType.keys.includes("Solid"));
  assert.ok(enums.FillType.keys.includes("None"));
});

// ------------------------------------------------------------------ colours / fills

test("RGB8 carries an opaque rgba8 value", () => {
  const c = RGB8(10, 20, 30);
  assert.equal(c.isColour, true);
  assert.deepEqual(c.rgba8, { r: 10, g: 20, b: 30, alpha: 255 });
  assert.equal(String(c), "RGB8(10,20,30)");
});

test("FillDescriptor solid/none and fillType", () => {
  const solid = FillDescriptor.createSolid(RGB8(1, 2, 3));
  assert.equal(solid.kind, "solid");
  assert.equal(solid.fillType, enums.FillType.Solid);
  assert.equal(solid.colour.rgba8.r, 1);

  const none = FillDescriptor.createNone();
  assert.equal(none.kind, "none");
  assert.equal(none.fillType, enums.FillType.None);
  assert.equal(none.colour, null);
});

test("FillDescriptor.createSolid rejects anything without rgba8", () => {
  assert.throws(() => FillDescriptor.createSolid(null), /expected Colour/);
  assert.throws(() => FillDescriptor.createSolid({}), /expected Colour/);
});

test("asFill normalises descriptors, bare colours and null", () => {
  const d = FillDescriptor.createSolid(RGB8(4, 5, 6));
  assert.equal(asFill(d), d);
  const fromColour = asFill(RGB8(7, 8, 9));
  assert.equal(fromColour.kind, "solid");
  assert.equal(fromColour.colour.rgba8.g, 8);
  assert.equal(asFill(null).kind, "none");
  assert.equal(asFill(undefined).kind, "none");
});

// ------------------------------------------------------------------ line styles

test("LineStyle defaults and overrides", () => {
  const d = LineStyle.create();
  assert.equal(d.weight, 1);
  assert.equal(d.cap, enums.LineCap.Butt);
  assert.equal(d.join, enums.LineJoin.Miter);
  assert.equal(d.type, enums.LineType.Solid);

  const custom = LineStyle.create({ weight: 4, cap: enums.LineCap.Round, join: enums.LineJoin.Round });
  assert.equal(custom.weight, 4);
  assert.equal(custom.cap, enums.LineCap.Round);
  assert.equal(custom.join, enums.LineJoin.Round);
});

test("LineStyleDescriptor keeps its line style and defaults to centre alignment", () => {
  const ls = LineStyle.create({ weight: 3 });
  const lsd = LineStyleDescriptor.create(ls);
  assert.equal(lsd.lineStyle, ls);
  assert.equal(lsd.strokeAlignment, enums.StrokeAlignment.Centre);
  assert.equal(
    LineStyleDescriptor.create(ls, { strokeAlignment: enums.StrokeAlignment.Inside }).strokeAlignment,
    enums.StrokeAlignment.Inside,
  );
});

// ------------------------------------------------------------------ warnings

test("warn de-duplicates, reset clears and list copies", () => {
  warnings.reset();
  warnings.warn("same");
  warnings.warn("same");
  warnings.warn("other");
  const list = warnings.list();
  assert.deepEqual(list, ["same", "other"]);

  list.push("mutated");
  assert.deepEqual(warnings.list(), ["same", "other"], "list() must return a copy");

  warnings.reset();
  assert.deepEqual(warnings.list(), []);
});

// ------------------------------------------------------------------ geometry

test("Rectangle stores its fields", () => {
  const r = new Rectangle(1, 2, 3, 4);
  assert.equal(r.x, 1);
  assert.equal(r.y, 2);
  assert.equal(r.width, 3);
  assert.equal(r.height, 4);
});

test("CurveBuilder flattens lines to cubics with controls on the endpoints", () => {
  const curve = CurveBuilder.create()
    .beginXY(0, 0)
    .lineToXY(10, 0)
    .lineToXY(10, 10)
    .close()
    .createCurve();

  assert.equal(curve.isClosed, true);
  assert.equal(curve.beziers.length, 3);
  assert.deepEqual(curve.beziers[0], {
    start: { x: 0, y: 0 }, c1: { x: 0, y: 0 }, c2: { x: 10, y: 0 }, end: { x: 10, y: 0 },
  });
  assert.deepEqual(curve.beziers[1].start, { x: 10, y: 0 });
  assert.deepEqual(curve.beziers[1].end, { x: 10, y: 10 });
  // close() adds the implied segment back to the start.
  assert.deepEqual(curve.beziers[2].end, { x: 0, y: 0 });
});

test("CurveBuilder close() skips the implied segment when it would be degenerate", () => {
  const curve = CurveBuilder.create()
    .beginXY(0, 0)
    .lineToXY(10, 0)
    .lineToXY(0, 0)
    .close()
    .createCurve();

  assert.equal(curve.isClosed, true);
  assert.equal(curve.beziers.length, 2, "no zero-length closing segment");
});

test("CurveBuilder keeps explicit bezier controls", () => {
  const curve = CurveBuilder.create()
    .beginXY(0, 0)
    .addBezierXY(1, 2, 3, 4, 5, 6)
    .createCurve();

  assert.equal(curve.isClosed, false);
  assert.deepEqual(curve.beziers[0], {
    start: { x: 0, y: 0 }, c1: { x: 1, y: 2 }, c2: { x: 3, y: 4 }, end: { x: 5, y: 6 },
  });
});

test("Curve reports emptiness and point count", () => {
  const empty = new Curve([], false);
  assert.equal(empty.isEmpty, true);
  assert.equal(empty.pointCount, 0);

  const curve = CurveBuilder.create().beginXY(0, 0).lineToXY(1, 1).createCurve();
  assert.equal(curve.isEmpty, false);
  assert.equal(curve.pointCount, 1);
});

test("PolyCurve collects curves", () => {
  const pc = PolyCurve.create();
  assert.equal(pc.curveCount, 0);
  const c1 = CurveBuilder.create().beginXY(0, 0).lineToXY(1, 1).close().createCurve();
  const c2 = CurveBuilder.create().beginXY(2, 2).lineToXY(3, 3).close().createCurve();
  pc.addCurve(c1).addCurve(c2);
  assert.equal(pc.curveCount, 2);
  assert.equal(pc.at(0), c1);
  assert.equal(pc.at(1), c2);
  assert.deepEqual(pc.curves, [c1, c2]);
});

test("rectangleCurve walks the four sides clockwise", () => {
  const r = new Rectangle(0, 0, 10, 20);
  const curve = rectangleCurve(r);
  assert.equal(curve.isClosed, true);
  assert.equal(curve.beziers.length, 4);
  const pts = [curve.beziers[0].start, curve.beziers[0].end, curve.beziers[1].end,
    curve.beziers[2].end, curve.beziers[3].end];
  assert.deepEqual(pts, [
    { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 20 }, { x: 0, y: 20 }, { x: 0, y: 0 },
  ]);
});

test("rectanglePolyCurve wraps rectangleCurve in a PolyCurve", () => {
  const pc = rectanglePolyCurve(new Rectangle(5, 5, 1, 1));
  assert.equal(pc.curveCount, 1);
  assert.equal(pc.at(0).beziers[0].start.x, 5);
});
