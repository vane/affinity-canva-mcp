'use strict';

// Story formatting deltas. Each factory returns a small tagged object that
// StoryBuilder.applyGlyphDelta / applyParagraphDelta applies to the builder's current
// attributes. Deltas that only change non-rendered fields are still carried so the
// same scripts run unchanged.

const {
    ParagraphAlignXType,
    ParagraphLeadingType,
    ParagraphAttDoubleType,
    ParagraphAttStringType,
    GlyphAttDoubleType,
    GlyphAttStringType,
    TypographicLineType,
    CapsType,
    SuperSubType,
    LeadingOverrideType,
    OpticalAlignmentType,
    TocRoleType,
    FontField,
    FontWidth,
} = require('./enums.js');

class StoryDelta {
    constructor(kind, target, data) {
        this.kind = kind;
        this.target = target;
        Object.assign(this, data || {});
    }

    static createUnderlineType(type) {
        return new StoryDelta('glyphEnum', 'glyph', { prop: 'underlineType', value: type });
    }

    static createStrikeoutType(type) {
        return new StoryDelta('glyphEnum', 'glyph', { prop: 'strikeoutType', value: type });
    }

    static createSuperSubType(type) {
        return new StoryDelta('glyphEnum', 'glyph', { prop: 'superSubType', value: type });
    }

    static createCapsType(type) {
        return new StoryDelta('glyphEnum', 'glyph', { prop: 'capsType', value: type });
    }

    static createLeadingOverrideType(type) {
        return new StoryDelta('glyphEnum', 'glyph', { prop: 'leadingOverrideType', value: type });
    }

    static createOpticalAlignmentType(type) {
        return new StoryDelta('glyphEnum', 'glyph', { prop: 'opticalAlignmentType', value: type });
    }

    static createTocRoleType(type) {
        return new StoryDelta('glyphEnum', 'glyph', { prop: 'tocRoleType', value: type });
    }

    static createIsNoBreak(isNoBreak) {
        return new StoryDelta('glyphBool', 'glyph', { prop: 'isNoBreak', value: !!isNoBreak });
    }

    static createOpenTypeScriptTag(tag) {
        return new StoryDelta('glyphNumber', 'glyph', { prop: 'openTypeScriptTag', value: tag });
    }

    static createOpenTypeLanguageTag(tag) {
        return new StoryDelta('glyphNumber', 'glyph', { prop: 'openTypeLanguageTag', value: tag });
    }

    static createGlyphDouble(key, value) {
        return new StoryDelta('glyphDouble', 'glyph', { att: key, value });
    }

    static createGlyphString(key, value) {
        return new StoryDelta('glyphString', 'glyph', { att: key, value });
    }

    static createBrushFill(fillDescriptor) {
        return new StoryDelta('glyphFill', 'glyph', { prop: 'brushFill', value: fillDescriptor });
    }

    static createPenFill(fillDescriptor) {
        return new StoryDelta('glyphFill', 'glyph', { prop: 'penFill', value: fillDescriptor });
    }

    static createTransparency(fillDescriptor) {
        return new StoryDelta('glyphFill', 'glyph', { prop: 'transparency', value: fillDescriptor });
    }

    static createHighlightFill(fillDescriptor) {
        return new StoryDelta('glyphFill', 'glyph', { prop: 'highlightFill', value: fillDescriptor });
    }

    static createUnderlineFill(fillDescriptor) {
        return new StoryDelta('glyphFill', 'glyph', { prop: 'underlineFill', value: fillDescriptor });
    }

    static createStrikeoutFill(fillDescriptor) {
        return new StoryDelta('glyphFill', 'glyph', { prop: 'strikeoutFill', value: fillDescriptor });
    }

    static createGlyphLineStyleDescriptor(lineStyleDescriptor) {
        return new StoryDelta('glyphLineStyle', 'glyph', { value: lineStyleDescriptor });
    }

    static createFont(fields, font) {
        return new StoryDelta('font', 'glyph', { fields, font });
    }

    static createPostscriptName(postscriptName) {
        return new StoryDelta('fontFamily', 'glyph', { value: postscriptName });
    }

    static createFamilyName(familyName) {
        return new StoryDelta('fontFamily', 'glyph', { value: familyName });
    }

    static createWeight(weight) {
        return new StoryDelta('fontWeight', 'glyph', { value: weight });
    }

    static createItalic(italic) {
        return new StoryDelta('fontItalic', 'glyph', { value: !!italic });
    }

    static createWidth(width) {
        return new StoryDelta('fontWidth', 'glyph', { value: width });
    }

    static createLeftIndent(value) {
        return new StoryDelta('paragraphDouble', 'paragraph', { att: ParagraphAttDoubleType.LeftIndent, value });
    }

    static createRightIndent(value) {
        return new StoryDelta('paragraphDouble', 'paragraph', { att: ParagraphAttDoubleType.RightIndent, value });
    }

    static createAlignX(type) {
        return new StoryDelta('alignX', 'paragraph', { value: type });
    }

    static createLeadingType(type) {
        return new StoryDelta('leadingType', 'paragraph', { value: type });
    }

    static createStartAtHardBreak(type) {
        return new StoryDelta('paragraphEnum', 'paragraph', { prop: 'startAtHardBreakType', value: type });
    }

    static createUseSpaceBeforeMode(mode) {
        return new StoryDelta('paragraphEnum', 'paragraph', { prop: 'useSpaceBeforeMode', value: mode });
    }

    static createPDFExportTag(type) {
        return new StoryDelta('paragraphEnum', 'paragraph', { prop: 'pdfExportTagType', value: type });
    }

    static createLineBreakMode(mode) {
        return new StoryDelta('paragraphEnum', 'paragraph', { prop: 'lineBreakModeType', value: mode });
    }

    static createIsKeepWithPrevious(value) {
        return new StoryDelta('paragraphBool', 'paragraph', { prop: 'isKeepWithPrevious', value: !!value });
    }

    static createIsKeepTogether(value) {
        return new StoryDelta('paragraphBool', 'paragraph', { prop: 'isKeepTogether', value: !!value });
    }

    static createIsPreventWidows(value) {
        return new StoryDelta('paragraphBool', 'paragraph', { prop: 'isPreventWidows', value: !!value });
    }

    static createIsPreventOrphans(value) {
        return new StoryDelta('paragraphBool', 'paragraph', { prop: 'isPreventOrphans', value: !!value });
    }

    static createAlignToBaselineGrid(value) {
        return new StoryDelta('paragraphBool', 'paragraph', { prop: 'alignToBaselineGrid', value: !!value });
    }

    static createIsAutoHyphenate(value) {
        return new StoryDelta('paragraphBool', 'paragraph', { prop: 'isAutoHyphenate', value: !!value });
    }

    static createUseSpaceBetweenSameStyles(value) {
        return new StoryDelta('paragraphBool', 'paragraph', { prop: 'useSpaceBetweenSameStyles', value: !!value });
    }

    static createIsSumBeforeAndAfterSpace(value) {
        return new StoryDelta('paragraphBool', 'paragraph', { prop: 'isSumBeforeAndAfterSpace', value: !!value });
    }

    static createUseModernLeading(value) {
        return new StoryDelta('paragraphBool', 'paragraph', { prop: 'useModernLeading', value: !!value });
    }

    static createKeepWithNext(value) {
        return new StoryDelta('paragraphInt', 'paragraph', { prop: 'keepWithNext', value });
    }

    static createHyphenateMinLength(value) {
        return new StoryDelta('paragraphInt', 'paragraph', { prop: 'hyphenateMinLength', value });
    }

    static createHyphenateMinPrefix(value) {
        return new StoryDelta('paragraphInt', 'paragraph', { prop: 'hyphenateMinPrefix', value });
    }

    static createHyphenateMinSuffix(value) {
        return new StoryDelta('paragraphInt', 'paragraph', { prop: 'hyphenateMinSuffix', value });
    }

    static createMaxConsecutiveHyphens(value) {
        return new StoryDelta('paragraphInt', 'paragraph', { prop: 'maxConsecutiveHyphens', value });
    }

    static createParagraphDouble(key, value) {
        return new StoryDelta('paragraphDouble', 'paragraph', { att: key, value });
    }

    static createParagraphString(key, value) {
        return new StoryDelta('paragraphString', 'paragraph', { att: key, value });
    }

    static createComposite(deltas) {
        return new StoryDelta('composite', 'both', { deltas: deltas || [] });
    }

    static createFromGlyphAtts(glyphAtts) {
        return new StoryDelta('setAtts', 'both', { glyphAtts });
    }

    static createFromParagraphAtts(paragraphAtts) {
        return new StoryDelta('setAtts', 'both', { paragraphAtts });
    }

    static createFromAtts(glyphAtts, paragraphAtts) {
        return new StoryDelta('setAtts', 'both', { glyphAtts, paragraphAtts });
    }
}

module.exports = {
    StoryDelta,
    CapsType,
    FontField,
    FontWidth,
    GlyphAttDoubleType,
    GlyphAttStringType,
    LeadingOverrideType,
    OpticalAlignmentType,
    ParagraphAlignXType,
    ParagraphAttDoubleType,
    ParagraphAttStringType,
    ParagraphLeadingType,
    SuperSubType,
    TocRoleType,
    TypographicLineType,
};
