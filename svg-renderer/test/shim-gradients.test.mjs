// Tests for gradient colours and fills: Gradient, GradientFill, FillDescriptor
// integration, and the SVG writer's gradient defs/paint servers.
//
// Run from svg-renderer/ with:  node --test test/*.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const enums = require("../shim/enums.js");
const { RGB8, Gradient } = require("../shim/colours.js");
const {
  Fill, SolidFill, GradientFill, FillDescriptor, makeFillDescriptor, asFill,
} = require("../shim/fills.js");
const { ShimDocument } = require("../shim/document.js");
const { Rectangle } = require("../shim/geometry.js");
const { ShapeNodeDefinition, ArtTextNodeDefinition } = require("../shim/nodes.js");
const { StoryBuilder } = require("../shim/storybuilder.js");
const { LineStyle, LineStyleDescriptor } = require("../shim/linestyle.js");
const shapes = require("../shim/shapes.js");
const warnings = require("../shim/warnings.js");
const svg = require("../shim/svg.js");

const { svgFromDocument, gradientStops } = svg;

const lsd = LineStyleDescriptor.create(LineStyle.create({ weight: 4 }));

function gradientOf(red = 255, blue = 255, green = 0) {
  return Gradient.create([
    { colour: RGB8(red, green, 0), position: 0 },
    { colour: RGB8(0, 0, blue), position: 1 },
  ]);
}

function gradientFill(type = enums.GradientFillType.Linear, gradient = gradientOf()) {
  return FillDescriptor.create(GradientFill.create(gradient, type));
}

function rectDoc(fill, lineFill) {
  const doc = new ShimDocument({ width: 100, height: 100 });
  doc.addNode(ShapeNodeDefinition.create(
    shapes.ShapeRectangle.create(), new Rectangle(0, 0, 100, 100),
    fill, lineFill || FillDescriptor.createNone(), lsd, FillDescriptor.createNone()));
  return doc;
}

// ------------------------------------------------------------------ Gradient

test("Gradient.create stores stops and defaults", () => {
  const g = Gradient.create([
    { colour: RGB8(255, 0, 0), position: 0 },
    { colour: RGB8(0, 0, 255), position: 1 },
  ]);

  assert.equal(g.isGradient, true);
  assert.equal(g.stopCount, 2);
  assert.equal(g.stops[0].position, 0);
  assert.equal(g.stops[0].midpoint, 0.5);
  assert.equal(g.stops[1].colour.rgba8.b, 255);
  assert.equal(g.alpha, 1);
  assert.equal(g.noise, 0);
  assert.equal(g.intensity, 1);
  assert.equal(g.tint, 1);
  assert.equal(g.hasNonFullAlpha, false);
  assert.equal(g.hasNoise, false);
  assert.equal(g.hasNonLinearMapping, false);
});

test("Gradient.create() returns a black-to-white default", () => {
  const g = Gradient.create();
  assert.equal(g.stopCount, 2);
  assert.deepEqual(g.stops[0].colour.rgba8, { r: 0, g: 0, b: 0, alpha: 255 });
  assert.deepEqual(g.stops[1].colour.rgba8, { r: 255, g: 255, b: 255, alpha: 255 });
});

test("Gradient rejects malformed stops", () => {
  assert.throws(() => Gradient.create("nope"), /expected array of ColourStop objects/);
  assert.throws(
    () => Gradient.create([{ colour: RGB8(0, 0, 0), position: 0 }]),
    /Gradient needs at least two stops/,
  );
  assert.throws(
    () => Gradient.create([{ position: 0 }, { position: 1 }]),
    /expected Colour/,
  );
});

test("Gradient.clone is independent", () => {
  const g = gradientOf();
  g.alpha = 0.5;
  const clone = g.clone();
  assert.equal(clone.alpha, 0.5);

  clone.getStop(0).position = 0.25;
  assert.equal(g.getStop(0).position, 0, "mutating the clone must not affect the original");

  clone.noise = 0.3;
  assert.equal(g.noise, 0);
});

// ------------------------------------------------------------------ fills

test("GradientFill exposes gradient, type and fillType", () => {
  const g = gradientOf();
  const gf = GradientFill.create(g, enums.GradientFillType.Linear);

  assert.equal(gf.fillType, enums.FillType.Gradient);
  assert.equal(gf.gradient, g);
  assert.equal(String(gf.gradientFillType), "Linear");
  assert.equal(gf.isVisible, true);
  assert.equal(gf.hasNonFullAlpha, false);

  gf.alpha = 0.5;
  assert.equal(gf.hasNonFullAlpha, true);

  const clone = gf.clone();
  assert.notEqual(clone.gradient, g);
  assert.equal(clone.alpha, 0.5);
});

test("GradientFill default and cloneWithNew* helpers", () => {
  const gf = GradientFill.createDefault();
  assert.equal(String(gf.gradientFillType), "Linear");
  assert.equal(gf.gradient.stopCount, 2);

  const replacement = gradientOf(0, 255);
  const changedGradient = gf.cloneWithNewGradient(replacement);
  assert.equal(changedGradient.gradient, replacement);
  assert.equal(String(changedGradient.gradientFillType), "Linear");

  const changedType = gf.cloneWithNewGradientFillType(enums.GradientFillType.Radial);
  assert.equal(String(changedType.gradientFillType), "Radial");
  assert.notEqual(changedType.gradient, gf.gradient);
});

test("SolidFill and FillDescriptor solid alpha", () => {
  const sf = SolidFill.create(RGB8(10, 20, 30));
  assert.equal(sf.fillType, enums.FillType.Solid);
  sf.alpha = 0.5;

  const fd = FillDescriptor.createSolid(sf);
  assert.equal(fd.kind, "solid");
  assert.equal(fd.fillType, enums.FillType.Solid);
  assert.equal(fd.colour.rgba8.alpha, 128);
});

test("FillDescriptor.create builds a gradient descriptor", () => {
  const g = gradientOf();
  const gf = GradientFill.create(g, enums.GradientFillType.Elliptical);
  gf.alpha = 0.5;

  const fd = FillDescriptor.create(gf);
  assert.equal(fd.kind, "gradient");
  assert.equal(fd.fillType, enums.FillType.Gradient);
  assert.equal(fd.gradient, g);
  assert.equal(String(fd.gradientFillType), "Elliptical");
  assert.equal(fd.alpha, 0.5);

  assert.equal(String(fd.fill.gradientFillType), "Elliptical");
  assert.equal(fd.fill.alpha, 0.5);
});

test("makeFillDescriptor and asFill normalise gradients", () => {
  const gf = GradientFill.create(gradientOf(), enums.GradientFillType.Linear);

  assert.equal(makeFillDescriptor(null).kind, "none");
  assert.equal(makeFillDescriptor(RGB8(1, 2, 3)).kind, "solid");
  assert.equal(makeFillDescriptor(gf), gf, "gradient fills pass through makeFillDescriptor");

  assert.equal(asFill(gf).kind, "gradient");
  assert.equal(asFill(gf).gradient, gf.gradient);
  assert.equal(asFill(SolidFill.create(RGB8(1, 2, 3))).kind, "solid");
});

// ------------------------------------------------------------------ SVG gradients

test("linear gradients emit defs and a url() fill", () => {
  warnings.reset();
  const out = svgFromDocument(rectDoc(gradientFill()));

  assert.match(out, /<defs>/);
  assert.match(out, /<linearGradient id="gradient-1" x1="0" y1="0" x2="1" y2="0">/);
  assert.match(out, /<stop offset="0" stop-color="#ff0000"\/>/);
  assert.match(out, /<stop offset="1" stop-color="#0000ff"\/>/);
  assert.match(out, /fill="url\(#gradient-1\)"/);
  assert.deepEqual(warnings.list(), []);
});

test("elliptical gradients emit a radialGradient", () => {
  warnings.reset();
  const out = svgFromDocument(rectDoc(gradientFill(enums.GradientFillType.Elliptical)));

  assert.match(out, /<radialGradient id="gradient-1" cx="0.5" cy="0.5" r="0.5">/);
  assert.match(out, /fill="url\(#gradient-1\)"/);
  assert.deepEqual(warnings.list(), []);
});

test("radial gradients fall back to elliptical with a warning", () => {
  warnings.reset();
  const out = svgFromDocument(rectDoc(gradientFill(enums.GradientFillType.Radial)));

  assert.match(out, /<radialGradient /);
  assert.deepEqual(warnings.list(), [
    "Radial gradients are rendered as elliptical (objectBoundingBox)",
  ]);
});

test("conical gradients fall back to linear with a warning", () => {
  warnings.reset();
  const out = svgFromDocument(rectDoc(gradientFill(enums.GradientFillType.Conical)));

  assert.match(out, /<linearGradient /);
  assert.deepEqual(warnings.list(), ["conical gradients are rendered as linear"]);
});

test("gradient strokes use a url() stroke", () => {
  const lineFill = gradientFill();
  const out = svgFromDocument(rectDoc(FillDescriptor.createNone(), lineFill));

  assert.match(out, /stroke="url\(#gradient-1\)"/);
  assert.match(out, /stroke-width="4"/);
  assert.match(out, /<linearGradient id="gradient-1"/);
});

test("text runs can use a gradient fill", () => {
  const sb = StoryBuilder.create();
  const ga = sb.glyphAtts;
  ga.brushFill = gradientFill();
  sb.setGlyphAtts(ga);
  sb.addText("Gradient");

  const doc = new ShimDocument({ width: 100, height: 100 });
  doc.addNode(ArtTextNodeDefinition.createFromStoryBuilder({ x: 10, y: 20 }, sb));
  const out = svgFromDocument(doc);

  assert.match(out, /<linearGradient id="gradient-1"/);
  assert.match(out, /fill="url\(#gradient-1\)"[^>]*>Gradient<\/tspan>/);
});

test("midpoints insert a synthetic 50% stop", () => {
  const g = Gradient.create([
    { colour: RGB8(255, 0, 0), position: 0, midpoint: 0.25 },
    { colour: RGB8(0, 0, 255), position: 1 },
  ]);

  const stops = gradientStops(g);
  assert.equal(stops.length, 3);
  assert.equal(stops[1].position, 0.25);
  assert.deepEqual(stops[1].colour.rgba8, { r: 128, g: 0, b: 128, alpha: 255 });
});

test("stop alpha and gradient alpha become stop-opacity", () => {
  const g = Gradient.create([
    { colour: { isColour: true, rgba8: { r: 255, g: 0, b: 0, alpha: 128 } }, position: 0 },
    { colour: RGB8(0, 0, 255), position: 1 },
  ]);
  g.alpha = 0.5;

  const out = svgFromDocument(rectDoc(FillDescriptor.create(
    GradientFill.create(g, enums.GradientFillType.Linear))));

  assert.match(out, /offset="0" stop-color="#ff0000" stop-opacity="0.25"/);
  assert.match(out, /offset="1" stop-color="#0000ff" stop-opacity="0.5"/);
});

test("each gradient gets a unique id", () => {
  const doc = new ShimDocument({ width: 100, height: 100 });
  for (let i = 0; i < 2; i++) {
    doc.addNode(ShapeNodeDefinition.create(
      shapes.ShapeRectangle.create(), new Rectangle(0, 0, 100, 100),
      gradientFill(), FillDescriptor.createNone(), lsd, FillDescriptor.createNone()));
  }

  const out = svgFromDocument(doc);
  assert.match(out, /id="gradient-1"/);
  assert.match(out, /id="gradient-2"/);
  assert.match(out, /url\(#gradient-1\)/);
  assert.match(out, /url\(#gradient-2\)/);
});

test("unsupported gradient attributes raise warnings", () => {
  warnings.reset();

  const g = gradientOf();
  g.noise = 0.3;
  g.tint = 0.5;
  g.intensity = 0.8;

  const fd = FillDescriptor.create(
    GradientFill.create(g, enums.GradientFillType.Linear),
    true, { a: 1 }, null, false);
  svgFromDocument(rectDoc(fd));

  assert.deepEqual(warnings.list(), [
    "gradient transforms are ignored",
    "gradient noise is ignored",
    "gradient tint is ignored",
    "gradient intensity is ignored",
  ]);
});
