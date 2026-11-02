'use strict';

// Paragraph formatting. Rendering honours alignment, leading, indents and paragraph
// spacing; the remaining fields are stored so scripts that set them still run.

const {
    ParagraphAlignXType,
    ParagraphLeadingType,
    ParagraphAttDoubleType,
    ParagraphAttStringType,
} = require('./enums.js');

const DOUBLE_FIELDS = {
    RelativeLeading: 'relativeLeading',
    AbsoluteLeading: 'absoluteLeading',
    LeftIndent: 'leftIndent',
    RightIndent: 'rightIndent',
    FirstLineIndent: 'firstLineIndent',
    SpaceBefore: 'spaceBefore',
    SpaceAfter: 'spaceAfter',
    DefaultTabStops: 'defaultTabStops',
    MinWordSpacing: 'minWordSpacing',
    DesiredWordSpacing: 'desiredWordSpacing',
    MaxWordSpacing: 'maxWordSpacing',
    MinLetterSpacing: 'minLetterSpacing',
    DesiredLetterSpacing: 'desiredLetterSpacing',
    MaxLetterSpacing: 'maxLetterSpacing',
    MinHyphenScore: 'minHyphenScore',
    HyphenationZone: 'hyphenationZone',
    HyphenationZoneCapitals: 'hyphenationZoneCapitals',
    HyphenationZoneParagraphEnd: 'hyphenationZoneParagraphEnd',
    HyphenationZoneColumnEnd: 'hyphenationZoneColumnEnd',
    LastLineOutdent: 'lastLineOutdent',
    SpaceBetweenSameStyles: 'spaceBetweenSameStyles',
};

const STRING_FIELDS = {
    StyleName: 'styleName',
};

class ParagraphAtts {
    constructor() {
        this.alignXType = ParagraphAlignXType.Left;
        this.leadingType = ParagraphLeadingType.RelativeToHeight;

        this.relativeLeading = 1;
        this.absoluteLeading = 0;
        this.leftIndent = 0;
        this.rightIndent = 0;
        this.firstLineIndent = 0;
        this.spaceBefore = 0;
        this.spaceAfter = 0;
        this.defaultTabStops = 0;
        this.minWordSpacing = 0;
        this.desiredWordSpacing = 0;
        this.maxWordSpacing = 0;
        this.minLetterSpacing = 0;
        this.desiredLetterSpacing = 0;
        this.maxLetterSpacing = 0;
        this.minHyphenScore = 0;
        this.hyphenationZone = 0;
        this.hyphenationZoneCapitals = 0;
        this.hyphenationZoneParagraphEnd = 0;
        this.hyphenationZoneColumnEnd = 0;
        this.lastLineOutdent = 0;
        this.spaceBetweenSameStyles = 0;

        this.isKeepWithPrevious = false;
        this.isKeepTogether = false;
        this.isPreventWidows = false;
        this.isPreventOrphans = false;
        this.alignToBaselineGrid = false;
        this.isAutoHyphenate = false;
        this.isIndex = false;
        this.useSpaceBetweenSameStyles = false;
        this.isSumBeforeAndAfterSpace = false;
        this.isBookEndnotes = false;
        this.useModernLeading = false;

        this.keepWithNext = 0;
        this.hyphenateMinLength = 0;
        this.hyphenateMinPrefix = 0;
        this.hyphenateMinSuffix = 0;
        this.maxConsecutiveHyphens = 0;
        this.styleName = '';
    }

    static create() {
        return new ParagraphAtts();
    }

    clone() {
        const c = new ParagraphAtts();
        for (const key of Object.keys(this)) c[key] = this[key];
        return c;
    }

    getDoubleValue(att) {
        const key = String(att);
        const field = DOUBLE_FIELDS[key];
        if (!field) throw new Error('SVG shim does not implement ParagraphAttDoubleType.' + key);
        return this[field];
    }

    setDoubleValue(att, value) {
        const key = String(att);
        const field = DOUBLE_FIELDS[key];
        if (!field) throw new Error('SVG shim does not implement ParagraphAttDoubleType.' + key);
        this[field] = value;
    }

    getStringValue(att) {
        const key = String(att);
        const field = STRING_FIELDS[key];
        if (!field) throw new Error('SVG shim does not implement ParagraphAttStringType.' + key);
        return this[field];
    }

    setStringValue(att, value) {
        const key = String(att);
        const field = STRING_FIELDS[key];
        if (!field) throw new Error('SVG shim does not implement ParagraphAttStringType.' + key);
        this[field] = value;
    }
}

module.exports = {
    ParagraphAtts,
    ParagraphAlignXType,
    ParagraphLeadingType,
    ParagraphAttDoubleType,
    ParagraphAttStringType,
};
