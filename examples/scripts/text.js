// Typography specimen - frame text, art text, paragraphs and styled runs.
//
// Node structure (bottom to top):
//   Background   - full-bleed paper rectangle
//   Rule         - thin ink rectangle under the headline
//   Headline     - large bold art text
//   Aa           - large italic accent art text
//   Subtitle     - italic muted art text
//   Body         - frame text: four short paragraphs with per-paragraph styling
//   Pull quote   - centred bold frame text in two paragraphs
//   Caption      - right-aligned italic art text
//   Footer       - small muted art text
//
// Frame text and art text both come from StoryBuilder. Paragraph attributes control
// alignment and leading; glyph deltas change weight, italic and colour for individual
// paragraphs. The shim renders each paragraph as one line, so every paragraph here is
// short enough to fit its frame.
//
// Run directly with the Affinity MCP `execute_script` tool. It reuses the open
// document only when it is already 800x800 and otherwise creates a new one.

const { Document, NewDocumentOptions } = require('/document.js');
const {
    ShapeNodeDefinition, FrameTextNodeDefinition, ArtTextNodeDefinition,
} = require('/nodes.js');
const { ShapeRectangle } = require('/shapes.js');
const { Rectangle } = require('/geometry.js');
const { RGB8 } = require('/colours.js');
const { FillDescriptor } = require('/fills.js');
const { StoryBuilder } = require('/storybuilder.js');
const { StoryDelta } = require('/storydelta.js');
const { Font, FontWeight, FontWidth } = require('/fonts.js');
const { ParagraphAtts, ParagraphAlignXType } = require('/paragraphatts.js');
const {
    LineStyle, LineStyleDescriptor,
    LineCap, LineJoin, LineType, StrokeAlignment,
} = require('/linestyle.js');
const { UnitType } = require('/units.js');

// ---------- document ----------
let doc = Document.current;
if (!doc || doc.widthPixels !== 800 || doc.heightPixels !== 800) {
    const opts = NewDocumentOptions.createDefault();
    opts.units = UnitType.Pixel;
    opts.width = 800;
    opts.height = 800;
    opts.dpi = 300;
    opts.marginsEnabled = false;
    doc = Document.create(opts);
}
doc.selectAll(false);
doc.deleteSelection(null, false);

// ---------- palette ----------
const PAPER  = RGB8(246, 242, 233);
const INK    = RGB8(28, 30, 38);
const MUTED  = RGB8(110, 112, 122);
const ACCENT = RGB8(196, 74, 58);
const BLUE   = RGB8(44, 74, 120);

const F = (c) => FillDescriptor.createSolid(c);
const noneFill = FillDescriptor.createNone();
const lsdRule = LineStyleDescriptor.create(
    LineStyle.create({ weight: 2, cap: LineCap.Butt, join: LineJoin.Miter, type: LineType.Solid }),
    { strokeAlignment: StrokeAlignment.Centre });

// ---------- helpers ----------
function artText(text, x, y, opts) {
    const sb = StoryBuilder.create();
    sb.setToArtisticTextDefaultStyle(doc.dpi, doc.rasterFormat);

    const ga = sb.glyphAtts;
    ga.font = Font.create('Helvetica', opts.weight || FontWeight.Normal,
        !!opts.italic, FontWidth.Normal);
    ga.height = opts.height;
    ga.brushFill = F(opts.colour || INK);
    sb.setGlyphAtts(ga);

    if (opts.align) {
        const pa = ParagraphAtts.create();
        pa.alignXType = opts.align;
        sb.setParagraphAtts(pa);
    }

    sb.addText(text);

    const def = ArtTextNodeDefinition.createFromStoryBuilder({ x, y }, sb);
    def.userDescription = opts.name || text;
    doc.addNode(def);
}

function frameText(paragraphs, rect, opts) {
    const sb = StoryBuilder.create();
    sb.setToFrameTextDefaultStyle(doc.dpi, doc.rasterFormat);

    const baseColour = opts.colour || INK;
    const ga = sb.glyphAtts;
    ga.font = Font.create('Helvetica', opts.weight || FontWeight.Normal,
        !!opts.italic, FontWidth.Normal);
    ga.height = opts.height;
    ga.brushFill = F(baseColour);
    sb.setGlyphAtts(ga);

    const pa = ParagraphAtts.create();
    pa.alignXType = opts.align || ParagraphAlignXType.Left;
    pa.relativeLeading = opts.leading || 1.35;
    pa.spaceAfter = opts.spaceAfter === undefined ? 8 : opts.spaceAfter;
    sb.setParagraphAtts(pa);

    for (let i = 0; i < paragraphs.length; i++) {
        const p = paragraphs[i];
        if (typeof p === 'string') {
            sb.addText(p);
        } else {
            if (p.weight) sb.applyGlyphDelta(StoryDelta.createWeight(p.weight));
            if (p.italic !== undefined) sb.applyGlyphDelta(StoryDelta.createItalic(p.italic));
            if (p.colour) sb.applyGlyphDelta(StoryDelta.createBrushFill(F(p.colour)));
            sb.addText(p.text);

            // Restore the frame's base run style for the next paragraph.
            sb.applyGlyphDelta(StoryDelta.createWeight(opts.weight || FontWeight.Normal));
            sb.applyGlyphDelta(StoryDelta.createItalic(!!opts.italic));
            sb.applyGlyphDelta(StoryDelta.createBrushFill(F(baseColour)));
        }
        if (i < paragraphs.length - 1) sb.addParagraphBreak();
    }

    const def = FrameTextNodeDefinition.createFromStoryBuilder(rect, sb);
    def.userDescription = opts.name || 'Text frame';
    doc.addNode(def);
}

// ---------- background ----------
const bgDef = ShapeNodeDefinition.create(
    ShapeRectangle.create(),
    new Rectangle(0, 0, doc.widthPixels, doc.heightPixels),
    F(PAPER), noneFill, lsdRule, noneFill);
bgDef.userDescription = 'Background';
doc.addNode(bgDef);

// ---------- rule ----------
const ruleDef = ShapeNodeDefinition.create(
    ShapeRectangle.create(),
    new Rectangle(80, 300, 640, 4),
    F(INK), noneFill, lsdRule, noneFill);
ruleDef.userDescription = 'Rule';
doc.addNode(ruleDef);

// ---------- headline ----------
artText('Type', 80, 230, {
    height: 200, weight: FontWeight.Bold, colour: INK, name: 'Headline',
});

artText('Aa', 560, 230, {
    height: 180, weight: FontWeight.Bold, italic: true, colour: ACCENT, name: 'Aa',
});

// ---------- subtitle ----------
artText('a small specimen in three parts', 80, 360, {
    height: 40, italic: true, colour: MUTED, name: 'Subtitle',
});

// ---------- body: paragraphs with per-paragraph styling ----------
frameText([
    'Frame text flows',
    { text: 'in short paragraphs,', italic: true, colour: MUTED },
    { text: 'with colour and weight', colour: ACCENT },
    { text: 'on individual runs.', weight: FontWeight.Bold, colour: BLUE },
], new Rectangle(80, 420, 300, 280), {
    height: 24,
    leading: 1.45,
    spaceAfter: 8,
    align: ParagraphAlignXType.Left,
    name: 'Body',
});

// ---------- pull quote ----------
frameText([
    'Make it',
    'type.',
    'Then refine.',
], new Rectangle(440, 420, 280, 280), {
    height: 42,
    weight: FontWeight.Bold,
    colour: BLUE,
    leading: 1.1,
    spaceAfter: 4,
    align: ParagraphAlignXType.Centre,
    name: 'Pull quote',
});

// ---------- caption and footer ----------
artText('set in Helvetica', 720, 730, {
    height: 18, italic: true, colour: MUTED,
    align: ParagraphAlignXType.Right, name: 'Caption',
});

artText('text.js — a typography specimen', 80, 760, {
    height: 22, colour: MUTED, name: 'Footer',
});

doc.selection = null;
console.log('nodes:', doc.currentSpread.children.all.toArray()
    .map(n => n.userDescription || n.constructor.name).join(', '));
console.log('UUID', doc.sessionUuid);
