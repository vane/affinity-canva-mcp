// Tests for the script runner: sandbox setup, the module map, per-run isolation and the
// warning plumbing.
//
// Run from svg-renderer/ with:  node --test test/*.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const { renderScriptToSvg, renderFileToSvg, sdkModules } = require("../shim/index.js");

const MINIMAL = `
const { Document, NewDocumentOptions } = require('/document.js');
const { ShapeNodeDefinition } = require('/nodes.js');
const { ShapeRectangle } = require('/shapes.js');
const { Rectangle } = require('/geometry.js');
const { UnitType } = require('/units.js');

const opts = NewDocumentOptions.createDefault();
opts.units = UnitType.Pixel;
opts.width = 100;
opts.height = 80;
const doc = Document.create(opts);
doc.addNode(ShapeNodeDefinition.create(
    ShapeRectangle.create(), new Rectangle(0, 0, 100, 80)));
console.log('size', doc.widthPixels + 'x' + doc.heightPixels);
`;

// ------------------------------------------------------------------ module map

test("the module map exposes exactly the SDK surface the drawings use", () => {
  assert.deepEqual(Object.keys(sdkModules).sort(), [
    "/colours.js", "/document.js", "/fills.js", "/fonts.js", "/geometry.js",
    "/glyphatts.js", "/linestyle.js", "/nodes.js", "/paragraphatts.js",
    "/shapes.js", "/storybuilder.js", "/storydelta.js", "/units.js",
  ]);

  const shapes = sdkModules["/shapes.js"];
  assert.equal(typeof shapes.ShapeRectangle.create, "function");
  assert.equal(typeof shapes.ShapeArrowEndStyle, "object");
  assert.equal(typeof shapes.ShapeSpiralStyle, "object");
  assert.equal(typeof shapes.ShapeCornerIndex, "object");
  assert.equal(shapes.ShapeType.SquareStar.name, "SquareStar");

  assert.equal(sdkModules["/units.js"].UnitType.Pixel.name, "Pixel");
  assert.equal(typeof sdkModules["/fills.js"].FillDescriptor.createSolid, "function");
  assert.equal(sdkModules["/fills.js"].FillType.Solid.name, "Solid");
  assert.equal(typeof sdkModules["/colours.js"].Gradient.create, "function");
  assert.equal(typeof sdkModules["/fills.js"].GradientFill.create, "function");
  assert.equal(sdkModules["/fills.js"].GradientFillType.Linear.name, "Linear");
  assert.equal(sdkModules["/linestyle.js"].StrokeAlignment.Centre.name, "Centre");
  assert.equal(typeof sdkModules["/nodes.js"].PolyCurveNodeDefinition.create, "function");
  assert.equal(typeof sdkModules["/nodes.js"].FrameTextNodeDefinition.createFromStoryBuilder, "function");
  assert.equal(typeof sdkModules["/nodes.js"].ArtTextNodeDefinition.createFromStoryBuilder, "function");
  assert.equal(typeof sdkModules["/storybuilder.js"].StoryBuilder.create, "function");
  assert.equal(typeof sdkModules["/storydelta.js"].StoryDelta.createComposite, "function");
  assert.equal(sdkModules["/paragraphatts.js"].ParagraphAlignXType.Centre.name, "Centre");
  assert.equal(sdkModules["/fonts.js"].FontWeight.Bold.name, "Bold");
});

// ------------------------------------------------------------------ running

test("renders a script to SVG and captures its console output", () => {
  const result = renderScriptToSvg(MINIMAL, "minimal.js");
  assert.equal(result.doc.widthPixels, 100);
  assert.equal(result.doc.heightPixels, 80);
  assert.equal(result.doc.nodes.length, 1);
  assert.deepEqual(result.logs, ["size 100x80"]);
  assert.deepEqual(result.warnings, []);
  assert.ok(result.svg.includes('width="100" height="80"'));
  assert.equal(result.svg.split("<path ").length - 1, 1);
});

test("Document.current is null before create and Document.all reflects it", () => {
  const result = renderScriptToSvg(`
const { Document, NewDocumentOptions } = require('/document.js');
console.log('before', Document.current === null, Document.all.length);
const opts = NewDocumentOptions.createDefault();
opts.width = 10; opts.height = 10;
Document.create(opts);
console.log('after', Document.current !== null, Document.all.length);
`);
  assert.deepEqual(result.logs, ["before true 0", "after true 1"]);
});

test("a script that never creates a document fails loudly", () => {
  assert.throws(
    () => renderScriptToSvg(`console.log('nothing here');`),
    /Script did not create a document/,
  );
});

test("an unimplemented module throws instead of rendering something wrong", () => {
  assert.throws(
    () => renderScriptToSvg(`require('/story.js');`),
    /SVG shim does not implement \/story\.js/,
  );
});

test("state is per run: two renders cannot see each other's nodes", () => {
  const script = `
const { Document, NewDocumentOptions } = require('/document.js');
const { ShapeNodeDefinition } = require('/nodes.js');
const { ShapeEllipse } = require('/shapes.js');
const { Rectangle } = require('/geometry.js');
const opts = NewDocumentOptions.createDefault();
opts.width = 20; opts.height = 20;
const doc = Document.create(opts);
console.log('start', doc.nodes.length);
doc.addNode(ShapeNodeDefinition.create(ShapeEllipse.create(), new Rectangle(0, 0, 20, 20)));
console.log('end', doc.nodes.length);
`;
  const first = renderScriptToSvg(script);
  const second = renderScriptToSvg(script);
  assert.deepEqual(first.logs, ["start 0", "end 1"]);
  assert.deepEqual(second.logs, ["start 0", "end 1"]);
  assert.notEqual(first.doc, second.doc);
});

test("warnings reset between runs", () => {
  const withWarning = `
const { Document, NewDocumentOptions } = require('/document.js');
const { ShapeNodeDefinition } = require('/nodes.js');
const { ShapeQRCode } = require('/shapes.js');
const { Rectangle } = require('/geometry.js');
const opts = NewDocumentOptions.createDefault();
opts.width = 50; opts.height = 50;
const doc = Document.create(opts);
doc.addNode(ShapeNodeDefinition.create(ShapeQRCode.create(), new Rectangle(0, 0, 50, 50)));
`;
  const first = renderScriptToSvg(withWarning);
  assert.equal(first.warnings.length, 1);
  assert.match(first.warnings[0], /QRCode renders as its bounding rectangle/);

  const second = renderScriptToSvg(MINIMAL);
  assert.deepEqual(second.warnings, [], "the QRCode warning must not leak into the next run");
});

test("renders a frame text script to SVG", () => {
  const result = renderScriptToSvg(`
const { Document, NewDocumentOptions } = require('/document.js');
const { StoryBuilder } = require('/storybuilder.js');
const { FrameTextNodeDefinition } = require('/nodes.js');
const { Rectangle } = require('/geometry.js');

const opts = NewDocumentOptions.createDefault();
opts.width = 200; opts.height = 100;
const doc = Document.create(opts);

const sb = StoryBuilder.create();
sb.setToFrameTextDefaultStyle(doc.dpi, doc.rasterFormat);
sb.addText('Hello');
doc.addNode(FrameTextNodeDefinition.createFromStoryBuilder(
    new Rectangle(10, 10, 180, 80), sb));
`, "text.js");

  assert.equal(result.doc.nodes.length, 1);
  assert.ok(result.svg.includes("<text "), "text nodes must be emitted as <text>");
  assert.match(result.svg, />Hello<\/tspan>/);
  assert.match(result.svg, /font-size="50"/);
  assert.deepEqual(result.warnings, []);
});

test("renders a drawing file from disk", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "svg-shim-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const file = path.join(dir, "drawing.js");
  fs.writeFileSync(file, MINIMAL);

  const result = renderFileToSvg(file);
  assert.equal(result.doc.widthPixels, 100);
  assert.equal(result.doc.heightPixels, 80);
  assert.equal(result.doc.nodes.length, 1);
  assert.equal(result.svg.split("<path ").length - 1, 1);
  assert.deepEqual(result.logs, ["size 100x80"]);
});

test("the gradient and text example drawings render", () => {
  // gradients.js places each gradient with a FillDescriptor transform, which is
  // how Affinity learns the gradient's extent. The shim takes extents from the
  // node bounds instead, so it reports the transform as ignored.
  const expectedWarnings = {
    "gradients.js": ["gradient transforms are ignored"],
    "text.js": [],
  };

  for (const name of ["gradients.js", "text.js"]) {
    const file = fileURLToPath(new URL(`../../examples/scripts/${name}`, import.meta.url));
    const result = renderFileToSvg(file);

    assert.ok(result.doc.nodes.length > 0, `${name} should add nodes`);
    assert.deepEqual(result.warnings, expectedWarnings[name], `${name} warnings`);
    assert.ok(result.svg.startsWith("<svg "), `${name} should emit SVG`);
  }
});
