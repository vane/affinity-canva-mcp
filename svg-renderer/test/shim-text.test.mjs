// Tests for the text support: fonts, glyph/paragraph attributes, the story builder,
// formatting deltas, the text node definitions and the SVG writer's <text> output.
//
// Run from svg-renderer/ with:  node --test test/*.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const { Font, FontWeight, FontWidth, FontField } = require("../shim/fonts.js");
const {
  GlyphAtts, GlyphAttDoubleType, GlyphAttStringType,
  TypographicLineType, CapsType, SuperSubType,
} = require("../shim/glyphatts.js");
const {
  ParagraphAtts, ParagraphAlignXType, ParagraphLeadingType, ParagraphAttDoubleType,
} = require("../shim/paragraphatts.js");
const { StoryBuilder } = require("../shim/storybuilder.js");
const { StoryDelta } = require("../shim/storydelta.js");
const {
  FrameTextNodeDefinition, ArtTextNodeDefinition, TextNodeDefinition,
} = require("../shim/nodes.js");
const { ShimDocument } = require("../shim/document.js");
const { Rectangle } = require("../shim/geometry.js");
const { RGB8 } = require("../shim/colours.js");
const { FillDescriptor } = require("../shim/fills.js");
const warnings = require("../shim/warnings.js");
const svg = require("../shim/svg.js");

const { svgFromDocument, glyphAttrs, xmlEscape } = svg;

function makeDoc(...nodes) {
  const doc = new ShimDocument({ width: 200, height: 100 });
  for (const node of nodes) doc.addNode(node);
  return doc;
}

// ------------------------------------------------------------------ fonts

test("Font.create stores family, weight, italic and width", () => {
  const font = Font.create("Inter", FontWeight.Bold, true, FontWidth.Condensed);
  assert.equal(font.familyName, "Inter");
  assert.equal(String(font.weight), "Bold");
  assert.equal(font.isItalic, true);
  assert.equal(String(font.width), "Condensed");
  assert.equal(font.toString(), "Inter");
  assert.equal(font.isBold, true);
  assert.equal(font.isNormal, false);

  const normal = Font.createDefault();
  assert.equal(normal.familyName, "Helvetica");
  assert.equal(String(normal.weight), "Normal");
  assert.equal(normal.isItalic, false);
  assert.equal(normal.isNormal, true);

  assert.deepEqual(Font.all, []);
  assert.equal(FontField.Weight.name, "Weight");
});

// ------------------------------------------------------------------ glyph atts

test("GlyphAtts defaults and clone independence", () => {
  const ga = GlyphAtts.create();
  assert.equal(ga.height, 12);
  assert.equal(ga.font.familyName, "Helvetica");
  assert.equal(ga.brushFill.kind, "solid");
  assert.deepEqual(ga.brushFill.colour.rgba8, { r: 0, g: 0, b: 0, alpha: 255 });
  assert.equal(String(ga.capsType), "None");
  assert.equal(String(ga.underlineType), "None");
  assert.equal(ga.isNoBreak, false);

  ga.setDoubleValue(GlyphAttDoubleType.Height, 24);
  ga.setDoubleValue(GlyphAttDoubleType.CharacterSpacing, 1.5);
  ga.setStringValue(GlyphAttStringType.StyleName, "Body");
  assert.equal(ga.height, 24);
  assert.equal(ga.characterSpacing, 1.5);
  assert.equal(ga.getStringValue(GlyphAttStringType.StyleName), "Body");

  const clone = ga.clone();
  clone.height = 30;
  clone.underlineType = TypographicLineType.Single;
  assert.equal(ga.height, 24, "mutating the clone must not affect the original");
  assert.equal(String(ga.underlineType), "None");

  assert.throws(
    () => ga.setDoubleValue("Nope", 1),
    /SVG shim does not implement GlyphAttDoubleType\.Nope/,
  );
});

test("GlyphAtts accepts bare colours as fills", () => {
  const ga = GlyphAtts.create();
  ga.brushFill = RGB8(10, 20, 30);
  assert.equal(ga.brushFill.kind, "solid");
  assert.equal(ga.brushFill.colour.rgba8.g, 20);
});

// ------------------------------------------------------------------ paragraph atts

test("ParagraphAtts defaults and clone independence", () => {
  const pa = ParagraphAtts.create();
  assert.equal(String(pa.alignXType), "Left");
  assert.equal(String(pa.leadingType), "RelativeToHeight");
  assert.equal(pa.relativeLeading, 1);
  assert.equal(pa.isKeepTogether, false);

  pa.setDoubleValue(ParagraphAttDoubleType.SpaceBefore, 6);
  pa.alignXType = ParagraphAlignXType.Centre;
  assert.equal(pa.spaceBefore, 6);
  assert.equal(String(pa.alignXType), "Centre");

  const clone = pa.clone();
  clone.alignXType = ParagraphAlignXType.Right;
  assert.equal(String(pa.alignXType), "Centre", "mutating the clone must not affect the original");

  assert.deepEqual(ParagraphAlignXType.keys, [
    "Left", "Centre", "Right", "JustifyLeft", "JustifyCentre",
    "JustifyRight", "JustifyAll", "AwayFromSpine", "TowardsSpine",
  ]);
  assert.deepEqual(ParagraphLeadingType.keys, ["RelativeToHeight", "Absolute"]);
});

// ------------------------------------------------------------------ story builder

test("StoryBuilder builds paragraphs and runs", () => {
  const sb = StoryBuilder.create();
  const ret = sb.addText("Hello").addParagraphBreak().addText("World");

  assert.equal(ret, sb, "methods chain");
  assert.equal(sb.text, "Hello\nWorld");

  const paragraphs = sb.paragraphs;
  assert.equal(paragraphs.length, 2);
  assert.equal(paragraphs[0].runs.length, 1);
  assert.equal(paragraphs[0].runs[0].text, "Hello");
  assert.equal(paragraphs[1].runs[0].text, "World");
});

test("setToFrameTextDefaultStyle applies 12 pt at the document dpi", () => {
  const sb = StoryBuilder.create();
  const ret = sb.setToFrameTextDefaultStyle(300, null);

  assert.equal(ret, sb);
  assert.equal(sb.glyphAtts.height, 50, "12 pt at 300 dpi");
  assert.equal(sb.glyphAtts.font.familyName, "Helvetica");
  assert.equal(sb.glyphAtts.brushFill.kind, "solid");
  assert.equal(String(sb.paragraphAtts.alignXType), "Left");
});

test("glyph attributes are captured per run and deltas apply to subsequent text", () => {
  const sb = StoryBuilder.create();
  sb.setToFrameTextDefaultStyle(72, null);

  const atts = sb.glyphAtts;
  atts.height = 20;
  atts.font = Font.create("Inter", FontWeight.Bold, false, FontWidth.Normal);
  sb.setGlyphAtts(atts);
  sb.addText("Bold");

  sb.applyGlyphDelta(StoryDelta.createItalic(true));
  sb.addText(" Italic");

  sb.applyGlyphDelta(StoryDelta.createGlyphDouble(GlyphAttDoubleType.Height, 30));
  sb.addText(" Big");

  const runs = sb.paragraphs[0].runs;
  assert.equal(runs[0].glyphAtts.height, 20);
  assert.equal(runs[0].glyphAtts.font.familyName, "Inter");
  assert.equal(runs[0].glyphAtts.font.isItalic, false);
  assert.equal(runs[1].glyphAtts.font.isItalic, true);
  assert.equal(runs[1].glyphAtts.height, 20);
  assert.equal(runs[2].glyphAtts.height, 30);
});

test("paragraph deltas apply to the current paragraph", () => {
  const sb = StoryBuilder.create();
  sb.applyParagraphDelta(StoryDelta.createAlignX(ParagraphAlignXType.Centre));
  sb.applyParagraphDelta(StoryDelta.createParagraphDouble(ParagraphAttDoubleType.SpaceBefore, 6));
  sb.addText("Centred");

  const pa = sb.paragraphs[0].paragraphAtts;
  assert.equal(String(pa.alignXType), "Centre");
  assert.equal(pa.spaceBefore, 6);
});

test("composite deltas apply glyph and paragraph parts", () => {
  const sb = StoryBuilder.create();
  sb.applyGlyphDelta(StoryDelta.createComposite([
    StoryDelta.createWeight(FontWeight.Bold),
    StoryDelta.createGlyphDouble(GlyphAttDoubleType.Height, 20),
  ]));
  sb.applyParagraphDelta(StoryDelta.createComposite([
    StoryDelta.createAlignX(ParagraphAlignXType.Right),
    StoryDelta.createParagraphDouble(ParagraphAttDoubleType.SpaceBefore, 4),
  ]));
  sb.addText("Both");

  assert.equal(String(sb.glyphAtts.font.weight), "Bold");
  assert.equal(sb.glyphAtts.height, 20);
  assert.equal(String(sb.paragraphs[0].paragraphAtts.alignXType), "Right");
  assert.equal(sb.paragraphs[0].paragraphAtts.spaceBefore, 4);
});

test("clearText preserves the current style", () => {
  const sb = StoryBuilder.create();
  sb.setToArtisticTextDefaultStyle(72, null);
  sb.applyGlyphDelta(StoryDelta.createGlyphDouble(GlyphAttDoubleType.Height, 72));
  sb.addText("gone");

  sb.clearText();
  assert.equal(sb.text, "");
  assert.equal(sb.glyphAtts.height, 72);

  sb.addText("fresh");
  assert.equal(sb.text, "fresh");
});

// ------------------------------------------------------------------ node definitions

test("FrameTextNodeDefinition snapshots the story and frame box", () => {
  const sb = StoryBuilder.create();
  sb.addText("First");
  const def = FrameTextNodeDefinition.createFromStoryBuilder(new Rectangle(10, 20, 100, 40), sb);

  assert.equal(def.textKind, "frame");
  assert.equal(def.text, "First");
  assert.equal(def.frameBox.width, 100);
  assert.equal(def.paragraphs[0].runs[0].text, "First");

  sb.addText(" changed");
  assert.equal(def.text, "First", "later builder edits must not change the node");
});

test("ArtTextNodeDefinition snapshots the story and position", () => {
  const sb = StoryBuilder.create();
  sb.addText("Art");
  const def = ArtTextNodeDefinition.createFromStoryBuilder({ x: 50, y: 60 }, sb);

  assert.ok(def instanceof TextNodeDefinition);
  assert.equal(def.textKind, "art");
  assert.equal(def.position.y, 60);
  assert.equal(def.text, "Art");
});

test("text definitions reject a non-StoryBuilder argument", () => {
  assert.throws(
    () => FrameTextNodeDefinition.createFromStoryBuilder(new Rectangle(0, 0, 10, 10), {}),
    /expected StoryBuilderHandle/,
  );
  assert.throws(
    () => ArtTextNodeDefinition.createFromStoryBuilder({ x: 0, y: 0 }, null),
    /expected StoryBuilderHandle/,
  );
});

// ------------------------------------------------------------------ svg writer

test("xmlEscape escapes markup and attribute characters", () => {
  assert.equal(xmlEscape('a < b & c "d"'), "a &lt; b &amp; c &quot;d&quot;");
});

test("glyphAttrs emits font, fill, spacing and decorations", () => {
  const ga = GlyphAtts.create();
  ga.height = 24;
  ga.font = Font.create("Inter", FontWeight.Bold, true, FontWidth.Normal);
  ga.brushFill = FillDescriptor.createSolid(RGB8(255, 0, 0));
  ga.characterSpacing = 2;
  ga.underlineType = TypographicLineType.Single;

  const attrs = glyphAttrs(ga).join(" ");
  assert.match(attrs, /font-size="24"/);
  assert.match(attrs, /font-family="Inter"/);
  assert.match(attrs, /font-weight="bold"/);
  assert.match(attrs, /font-style="italic"/);
  assert.match(attrs, /fill="#ff0000"/);
  assert.match(attrs, /letter-spacing="2"/);
  assert.match(attrs, /text-decoration="underline"/);
});

test("svgFromDocument writes frame text at the top-left baseline", () => {
  warnings.reset();
  const sb = StoryBuilder.create();
  sb.setToFrameTextDefaultStyle(72, null); // 12 px
  sb.addText("Hi");

  const out = svgFromDocument(makeDoc(
    FrameTextNodeDefinition.createFromStoryBuilder(new Rectangle(10, 20, 100, 40), sb)));

  assert.match(out, /<text x="10" y="29.6" text-anchor="start" xml:space="preserve">/);
  assert.match(out, /<tspan font-size="12" font-family="Helvetica" fill="#000000">Hi<\/tspan>/);
  assert.deepEqual(warnings.list(), []);
});

test("frame text honours centre and right paragraph alignment", () => {
  const centre = StoryBuilder.create();
  centre.applyParagraphDelta(StoryDelta.createAlignX(ParagraphAlignXType.Centre));
  centre.addText("Mid");
  const centreOut = svgFromDocument(makeDoc(
    FrameTextNodeDefinition.createFromStoryBuilder(new Rectangle(10, 0, 100, 20), centre)));
  assert.match(centreOut, /<text x="60" .* text-anchor="middle"/);

  const right = StoryBuilder.create();
  right.applyParagraphDelta(StoryDelta.createAlignX(ParagraphAlignXType.Right));
  right.addText("End");
  const rightOut = svgFromDocument(makeDoc(
    FrameTextNodeDefinition.createFromStoryBuilder(new Rectangle(10, 0, 100, 20), right)));
  assert.match(rightOut, /<text x="110" .* text-anchor="end"/);
});

test("multiple paragraphs advance the baseline by the relative leading", () => {
  const sb = StoryBuilder.create();
  sb.setToFrameTextDefaultStyle(72, null);
  sb.addText("One");
  sb.addParagraphBreak();
  sb.addText("Two");

  const out = svgFromDocument(makeDoc(
    FrameTextNodeDefinition.createFromStoryBuilder(new Rectangle(10, 20, 100, 80), sb)));

  assert.equal(out.split("<text ").length - 1, 2);
  assert.match(out, /y="29.6"/);
  assert.match(out, /y="41.6"/);
});

test("each styled run becomes its own tspan", () => {
  const sb = StoryBuilder.create();
  sb.applyGlyphDelta(StoryDelta.createWeight(FontWeight.Bold));
  sb.addText("Bold");
  sb.applyGlyphDelta(StoryDelta.createWeight(FontWeight.Normal));
  sb.applyGlyphDelta(StoryDelta.createItalic(true));
  sb.addText(" Italic");

  const out = svgFromDocument(makeDoc(
    ArtTextNodeDefinition.createFromStoryBuilder({ x: 50, y: 60 }, sb)));

  assert.equal(out.split("<tspan ").length - 1, 2);
  assert.match(out, /font-weight="bold"[^>]*>Bold<\/tspan>/);
  assert.match(out, /font-style="italic"[^>]*> Italic<\/tspan>/);
});

test("art text uses its position as the first baseline", () => {
  const sb = StoryBuilder.create();
  sb.addText("Art");
  const out = svgFromDocument(makeDoc(
    ArtTextNodeDefinition.createFromStoryBuilder({ x: 50, y: 60 }, sb)));

  assert.match(out, /<text x="50" y="60" text-anchor="start"/);
});

test("art text centre alignment anchors on the position", () => {
  const sb = StoryBuilder.create();
  sb.applyParagraphDelta(StoryDelta.createAlignX(ParagraphAlignXType.Centre));
  sb.addText("Art");
  const out = svgFromDocument(makeDoc(
    ArtTextNodeDefinition.createFromStoryBuilder({ x: 50, y: 60 }, sb)));

  assert.match(out, /<text x="50" y="60" text-anchor="middle"/);
});

test("text content is XML-escaped and caps are applied", () => {
  const sb = StoryBuilder.create();
  sb.addText("a < b & c");

  const ga = sb.glyphAtts;
  ga.capsType = CapsType.AllCaps;
  sb.setGlyphAtts(ga);
  sb.addText(" small");

  const out = svgFromDocument(makeDoc(
    ArtTextNodeDefinition.createFromStoryBuilder({ x: 0, y: 0 }, sb)));

  assert.match(out, /a &lt; b &amp; c/);
  assert.match(out, / SMALL/);
});

test("empty runs and paragraphs do not emit text", () => {
  const sb = StoryBuilder.create();
  sb.addText("");
  sb.addParagraphBreak();
  sb.addText("Visible");

  const out = svgFromDocument(makeDoc(
    ArtTextNodeDefinition.createFromStoryBuilder({ x: 0, y: 0 }, sb)));

  assert.equal(out.split("<text ").length - 1, 1);
  assert.match(out, />Visible<\/tspan>/);
});

test("justification and caps approximations raise warnings", () => {
  warnings.reset();

  const justified = StoryBuilder.create();
  justified.applyParagraphDelta(StoryDelta.createAlignX(ParagraphAlignXType.JustifyAll));
  justified.addText("Justified");
  svgFromDocument(makeDoc(
    ArtTextNodeDefinition.createFromStoryBuilder({ x: 0, y: 0 }, justified)));

  const caps = StoryBuilder.create();
  caps.applyGlyphDelta(StoryDelta.createCapsType(CapsType.SmallCaps));
  caps.addText("small caps");
  svgFromDocument(makeDoc(
    ArtTextNodeDefinition.createFromStoryBuilder({ x: 0, y: 0 }, caps)));

  assert.deepEqual(warnings.list(), [
    "JustifyAll is rendered as left aligned (no justification)",
    "capsType SmallCaps is approximated by uppercasing",
  ]);
});
