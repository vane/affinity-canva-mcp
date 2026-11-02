'use strict';

// Character formatting. The shim keeps the fields the SVG writer can emit (font,
// height, spacing, colour, underline/strikeout, super/subscript) and stores the rest
// so scripts can set them without failing. Anything that would visibly change the
// output but is not implemented is reported through ./warnings.js by the SVG writer.

const { RGB8 } = require('./colours.js');
const { FillDescriptor, asFill } = require('./fills.js');
const { Font } = require('./fonts.js');
const {
    GlyphAttDoubleType,
    GlyphAttStringType,
    TypographicLineType,
    CapsType,
    SuperSubType,
    LeadingOverrideType,
    OpticalAlignmentType,
    TocRoleType,
} = require('./enums.js');

const DOUBLE_FIELDS = {
    Height: 'height',
    CharacterSpacing: 'characterSpacing',
    BaselineAdvance: 'baselineAdvance',
    AutoKernMinHeight: 'autoKernMinHeight',
    OffsetX: 'offsetX',
    OffsetY: 'offsetY',
    ManualKerning: 'manualKerning',
    ScaleX: 'scaleX',
    ScaleY: 'scaleY',
    ShearX: 'shearX',
    AbsoluteLeading: 'absoluteLeading',
};

const STRING_FIELDS = {
    SpellingLanguageId: 'spellingLanguageId',
    StyleName: 'styleName',
    HyphenationLanguageId: 'hyphenationLanguageId',
};

class GlyphAtts {
    constructor() {
        this._font = Font.createDefault();

        this.height = 12;
        this.characterSpacing = 0;
        this.baselineAdvance = 0;
        this.autoKernMinHeight = 0;
        this.offsetX = 0;
        this.offsetY = 0;
        this.manualKerning = 0;
        this.scaleX = 1;
        this.scaleY = 1;
        this.shearX = 0;
        this.absoluteLeading = 0;

        this.underlineType = TypographicLineType.None;
        this.strikeoutType = TypographicLineType.None;
        this.superSubType = SuperSubType.None;
        this.capsType = CapsType.None;
        this.leadingOverrideType = LeadingOverrideType.None;
        this.opticalAlignmentType = OpticalAlignmentType.None;
        this.tocRoleType = TocRoleType.None;

        this.isNoBreak = false;
        this.openTypeScriptTag = 0;
        this.openTypeLanguageTag = 0;
        this.spellingLanguageId = '';
        this.styleName = '';
        this.hyphenationLanguageId = '';

        this._brushFill = FillDescriptor.createSolid(RGB8(0, 0, 0));
        this._penFill = FillDescriptor.createNone();
        this._transparency = FillDescriptor.createNone();
        this._highlightFill = FillDescriptor.createNone();
        this._underlineFill = FillDescriptor.createNone();
        this._strikeoutFill = FillDescriptor.createNone();
        this.lineStyleDescriptor = null;
    }

    static create() {
        return new GlyphAtts();
    }

    clone() {
        const c = new GlyphAtts();
        c._font = this._font.clone();
        c.height = this.height;
        c.characterSpacing = this.characterSpacing;
        c.baselineAdvance = this.baselineAdvance;
        c.autoKernMinHeight = this.autoKernMinHeight;
        c.offsetX = this.offsetX;
        c.offsetY = this.offsetY;
        c.manualKerning = this.manualKerning;
        c.scaleX = this.scaleX;
        c.scaleY = this.scaleY;
        c.shearX = this.shearX;
        c.absoluteLeading = this.absoluteLeading;
        c.underlineType = this.underlineType;
        c.strikeoutType = this.strikeoutType;
        c.superSubType = this.superSubType;
        c.capsType = this.capsType;
        c.leadingOverrideType = this.leadingOverrideType;
        c.opticalAlignmentType = this.opticalAlignmentType;
        c.tocRoleType = this.tocRoleType;
        c.isNoBreak = this.isNoBreak;
        c.openTypeScriptTag = this.openTypeScriptTag;
        c.openTypeLanguageTag = this.openTypeLanguageTag;
        c.spellingLanguageId = this.spellingLanguageId;
        c.styleName = this.styleName;
        c.hyphenationLanguageId = this.hyphenationLanguageId;
        c._brushFill = this._brushFill;
        c._penFill = this._penFill;
        c._transparency = this._transparency;
        c._highlightFill = this._highlightFill;
        c._underlineFill = this._underlineFill;
        c._strikeoutFill = this._strikeoutFill;
        c.lineStyleDescriptor = this.lineStyleDescriptor;
        return c;
    }

    get font() {
        return this._font;
    }

    set font(font) {
        this._font = font;
    }

    get brushFill() {
        return this._brushFill;
    }

    set brushFill(fill) {
        this._brushFill = asFill(fill);
    }

    get penFill() {
        return this._penFill;
    }

    set penFill(fill) {
        this._penFill = asFill(fill);
    }

    get transparency() {
        return this._transparency;
    }

    set transparency(fill) {
        this._transparency = asFill(fill);
    }

    get highlightFill() {
        return this._highlightFill;
    }

    set highlightFill(fill) {
        this._highlightFill = asFill(fill);
    }

    get underlineFill() {
        return this._underlineFill;
    }

    set underlineFill(fill) {
        this._underlineFill = asFill(fill);
    }

    get strikeoutFill() {
        return this._strikeoutFill;
    }

    set strikeoutFill(fill) {
        this._strikeoutFill = asFill(fill);
    }

    getDoubleValue(att) {
        const key = String(att);
        const field = DOUBLE_FIELDS[key];
        if (!field) throw new Error('SVG shim does not implement GlyphAttDoubleType.' + key);
        return this[field];
    }

    setDoubleValue(att, value) {
        const key = String(att);
        const field = DOUBLE_FIELDS[key];
        if (!field) throw new Error('SVG shim does not implement GlyphAttDoubleType.' + key);
        this[field] = value;
    }

    getStringValue(att) {
        const key = String(att);
        const field = STRING_FIELDS[key];
        if (!field) throw new Error('SVG shim does not implement GlyphAttStringType.' + key);
        return this[field];
    }

    setStringValue(att, value) {
        const key = String(att);
        const field = STRING_FIELDS[key];
        if (!field) throw new Error('SVG shim does not implement GlyphAttStringType.' + key);
        this[field] = value;
    }
}

module.exports = {
    GlyphAtts,
    TypographicLineType,
    SuperSubType,
    CapsType,
    LeadingOverrideType,
    OpticalAlignmentType,
    TocRoleType,
    GlyphAttDoubleType,
    GlyphAttStringType,
};
