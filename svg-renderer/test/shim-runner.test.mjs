// Tests for the script runner: sandbox setup, the module map, per-run isolation and the
// warning plumbing.
//
// Run from svg-renderer/ with:  node --test test/*.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
    "/colours.js", "/document.js", "/fills.js", "/geometry.js",
    "/linestyle.js", "/nodes.js", "/shapes.js", "/units.js",
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
  assert.equal(sdkModules["/linestyle.js"].StrokeAlignment.Centre.name, "Centre");
  assert.equal(typeof sdkModules["/nodes.js"].PolyCurveNodeDefinition.create, "function");
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
    () => renderScriptToSvg(`require('/storybuilder.js');`),
    /SVG shim does not implement \/storybuilder\.js/,
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
