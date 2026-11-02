'use strict';

// Builds a text story from runs and paragraph breaks, mirroring the SDK's
// StoryBuilder. A run carries the glyph attributes in force when addText was called;
// a paragraph carries the paragraph attributes in force for that paragraph.

const { RGB8 } = require('./colours.js');
const { FillDescriptor } = require('./fills.js');
const { Font } = require('./fonts.js');
const { GlyphAtts } = require('./glyphatts.js');
const { ParagraphAtts } = require('./paragraphatts.js');

class StoryBuilder {
    constructor() {
        this._glyphAtts = GlyphAtts.create();
        this._paragraphAtts = ParagraphAtts.create();
        this._paragraphs = [];
        this._current = { runs: [], paragraphAtts: this._paragraphAtts.clone() };
    }

    static create() {
        return new StoryBuilder();
    }

    setToFrameTextDefaultStyle(dpi, format) {
        return this._setDefaultStyle(dpi);
    }

    setToArtisticTextDefaultStyle(dpi, format) {
        return this._setDefaultStyle(dpi);
    }

    // Affinity's default body size is 12 pt; spread coordinates are pixels at dpi.
    _setDefaultStyle(dpi) {
        const scale = Number.isFinite(dpi) && dpi > 0 ? dpi / 72 : 1;
        const ga = GlyphAtts.create();
        ga.height = 12 * scale;
        ga.font = Font.createDefault();
        ga.brushFill = FillDescriptor.createSolid(RGB8(0, 0, 0));

        this._glyphAtts = ga;
        this._paragraphAtts = ParagraphAtts.create();
        this._current.paragraphAtts = this._paragraphAtts.clone();
        return this;
    }

    clearText() {
        this._paragraphs = [];
        this._current = { runs: [], paragraphAtts: this._paragraphAtts.clone() };
        return this;
    }

    addText(text) {
        const value = text === undefined || text === null ? '' : String(text);
        this._current.runs.push({ text: value, glyphAtts: this._glyphAtts.clone() });
        return this;
    }

    addParagraphBreak() {
        this._paragraphs.push(this._current);
        this._current = { runs: [], paragraphAtts: this._paragraphAtts.clone() };
        return this;
    }

    setGlyphAtts(glyphAtts) {
        this._glyphAtts = glyphAtts.clone();
        return this;
    }

    setParagraphAtts(paragraphAtts) {
        this._paragraphAtts = paragraphAtts.clone();
        this._current.paragraphAtts = this._paragraphAtts.clone();
        return this;
    }

    get glyphAtts() {
        return this._glyphAtts.clone();
    }

    get paragraphAtts() {
        return this._paragraphAtts.clone();
    }

    applyGlyphDelta(delta) {
        this._applyGlyphDelta(delta);
        return this;
    }

    applyParagraphDelta(delta) {
        this._applyParagraphDelta(delta);
        return this;
    }

    _applyGlyphDelta(delta) {
        if (!delta) return;

        if (delta.kind === 'composite') {
            for (const d of delta.deltas || []) {
                if (d && (d.target === 'glyph' || d.target === 'both')) this._applyGlyphDelta(d);
            }
            return;
        }
        if (delta.target === 'paragraph') return;

        switch (delta.kind) {
            case 'setAtts':
                if (delta.glyphAtts) this._glyphAtts = delta.glyphAtts.clone();
                break;
            case 'glyphDouble':
                this._glyphAtts.setDoubleValue(delta.att, delta.value);
                break;
            case 'glyphString':
                this._glyphAtts.setStringValue(delta.att, delta.value);
                break;
            case 'glyphEnum':
            case 'glyphBool':
            case 'glyphNumber':
                this._glyphAtts[delta.prop] = delta.value;
                break;
            case 'glyphFill':
                this._glyphAtts[delta.prop] = delta.value;
                break;
            case 'glyphLineStyle':
                this._glyphAtts.lineStyleDescriptor = delta.value;
                break;
            case 'font': {
                const f = delta.font;
                this._glyphAtts.font = Font.create(f.familyName, f.weight, f.isItalic, f.width);
                break;
            }
            case 'fontFamily': {
                const f = this._glyphAtts.font;
                this._glyphAtts.font = Font.create(delta.value, f.weight, f.isItalic, f.width);
                break;
            }
            case 'fontWeight': {
                const f = this._glyphAtts.font;
                this._glyphAtts.font = Font.create(f.familyName, delta.value, f.isItalic, f.width);
                break;
            }
            case 'fontItalic': {
                const f = this._glyphAtts.font;
                this._glyphAtts.font = Font.create(f.familyName, f.weight, delta.value, f.width);
                break;
            }
            case 'fontWidth': {
                const f = this._glyphAtts.font;
                this._glyphAtts.font = Font.create(f.familyName, f.weight, f.isItalic, delta.value);
                break;
            }
            default:
                break;
        }
    }

    _applyParagraphDelta(delta) {
        if (!delta) return;

        if (delta.kind === 'composite') {
            for (const d of delta.deltas || []) {
                if (d && (d.target === 'paragraph' || d.target === 'both')) this._applyParagraphDelta(d);
            }
            return;
        }
        if (delta.target === 'glyph') return;

        switch (delta.kind) {
            case 'setAtts':
                if (delta.paragraphAtts) this._paragraphAtts = delta.paragraphAtts.clone();
                break;
            case 'alignX':
                this._paragraphAtts.alignXType = delta.value;
                break;
            case 'leadingType':
                this._paragraphAtts.leadingType = delta.value;
                break;
            case 'paragraphDouble':
                this._paragraphAtts.setDoubleValue(delta.att, delta.value);
                break;
            case 'paragraphString':
                this._paragraphAtts.setStringValue(delta.att, delta.value);
                break;
            case 'paragraphEnum':
            case 'paragraphBool':
            case 'paragraphInt':
                this._paragraphAtts[delta.prop] = delta.value;
                break;
            default:
                break;
        }

        // Paragraph attributes apply to the whole paragraph being built.
        this._current.paragraphAtts = this._paragraphAtts.clone();
    }

    // A deep snapshot: the current paragraph is included when it has runs, or when
    // the story is empty. A trailing paragraph break therefore renders as a blank
    // line but does not add a phantom line at the end of the story.
    get paragraphs() {
        const list = this._paragraphs.slice();
        if (this._current.runs.length || !list.length) list.push(this._current);

        return list.map((p) => ({
            runs: p.runs.map((r) => ({ text: r.text, glyphAtts: r.glyphAtts.clone() })),
            paragraphAtts: p.paragraphAtts.clone(),
        }));
    }

    get text() {
        return this.paragraphs
            .map((p) => p.runs.map((r) => r.text).join(''))
            .join('\n');
    }
}

module.exports = { StoryBuilder };
