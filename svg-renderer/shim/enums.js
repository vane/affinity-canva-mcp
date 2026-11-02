'use strict';

// Enum stand-ins. Affinity's enums are objects exposing `keys`, `values` and
// `entries`, and each member stringifies to its name (scripts compare with `.value`).

function enumOf(names) {
    const e = {};
    for (const n of names) {
        e[n] = { name: n, value: n.toLowerCase(), toString: () => n };
    }
    e.keys = names.slice();
    e.values = names.map((n) => e[n]);
    e.entries = names.map((n) => [n, e[n]]);
    return e;
}

const UnitType = enumOf([
    'Number', 'Percentage', 'Permille', 'Degree', 'Radian', 'Pixel', 'Inch', 'Point',
    'Millimetre', 'Centimetre', 'Metre', 'Foot', 'Yard', 'Cat', 'Pica', 'Kilometre',
    'Mile', 'Byte',
]);
const LineCap = enumOf(['Butt', 'Square', 'Round']);
const LineJoin = enumOf(['MiterLegacy', 'Miter', 'Round', 'Bevel']);
const LineType = enumOf(['None', 'Solid', 'Dash', 'Texture']);
const StrokeAlignment = enumOf(['Centre', 'Inside', 'Outside']);
const FillType = enumOf(['Unknown', 'None', 'Solid', 'Gradient', 'Bitmap', 'Mesh', 'Hatch', 'Diffusion']);
const GradientFillType = enumOf(['Linear', 'Elliptical', 'Conical', 'Radial']);
const ShapeCornerType = enumOf(['Round', 'Straight', 'RoundInverse', 'Cutout', 'None']);
const ShapeType = enumOf([
    'Rectangle', 'Ellipse', 'Triangle', 'Diamond', 'Trapezoid', 'Polygon', 'Star',
    'DoubleStar', 'Arrow', 'Pie', 'Cog', 'Cloud', 'CalloutRectangle', 'CalloutEllipse',
    'Crescent', 'Segment', 'SquareStar', 'Tear', 'Heart', 'Cat', 'Cat2', 'Cat3', 'Cat4',
    'QRCode', 'Spiral', 'Style',
]);
const ShapeArrowEndStyle = enumOf([
    'None', 'Arrow', 'TailTriangular', 'TailSquare', 'Circle', 'HalfCircleInner',
    'HalfCircleOuter', 'Diamond', 'Box', 'Barb', 'Chevron',
]);
const ShapeSpiralStyle = enumOf([
    'SemiCircle', 'CounterSemiCircle', 'Fibonacci', 'SegmentedLogarithmic',
    'SegmentedLinear', 'Plotted',
]);
// Corner order matches Affinity's ShapeCornerIndex.
const ShapeCornerIndex = enumOf(['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft']);

// Text formatting enums. Only the members the shim renders or the drawing scripts
// commonly touch are listed; unknown members are absent rather than silently wrong.
const ParagraphAlignXType = enumOf([
    'Left', 'Centre', 'Right', 'JustifyLeft', 'JustifyCentre',
    'JustifyRight', 'JustifyAll', 'AwayFromSpine', 'TowardsSpine',
]);
const ParagraphLeadingType = enumOf(['RelativeToHeight', 'Absolute']);
const ParagraphAttDoubleType = enumOf([
    'RelativeLeading', 'AbsoluteLeading', 'LeftIndent', 'RightIndent',
    'FirstLineIndent', 'SpaceBefore', 'SpaceAfter', 'DefaultTabStops',
    'MinWordSpacing', 'DesiredWordSpacing', 'MaxWordSpacing',
    'MinLetterSpacing', 'DesiredLetterSpacing', 'MaxLetterSpacing',
    'MinHyphenScore', 'HyphenationZone', 'HyphenationZoneCapitals',
    'HyphenationZoneParagraphEnd', 'HyphenationZoneColumnEnd',
    'LastLineOutdent', 'SpaceBetweenSameStyles',
]);
const ParagraphAttStringType = enumOf(['StyleName']);
const GlyphAttDoubleType = enumOf([
    'Height', 'CharacterSpacing', 'BaselineAdvance', 'AutoKernMinHeight',
    'OffsetX', 'OffsetY', 'ManualKerning', 'ScaleX', 'ScaleY', 'ShearX',
    'AbsoluteLeading',
]);
const GlyphAttStringType = enumOf([
    'SpellingLanguageId', 'StyleName', 'HyphenationLanguageId',
]);
const TypographicLineType = enumOf(['None', 'Single', 'Double']);
const CapsType = enumOf([
    'None', 'CapsToSmallCaps', 'SmallCaps', 'AllCaps', 'AllSmallCaps',
    'CapsToPetiteCaps', 'PetiteCaps', 'AllPetiteCaps', 'Titling', 'Unicase',
]);
const SuperSubType = enumOf(['None', 'Superscript', 'Subscript']);
const LeadingOverrideType = enumOf(['None', 'AtLeast', 'Exactly']);
const OpticalAlignmentType = enumOf(['None', 'Font', 'Manual']);
const TocRoleType = enumOf(['None', 'PageNumber']);
const FontWeight = enumOf([
    'Thin', 'ExtraLight', 'Light', 'Normal', 'Medium',
    'SemiBold', 'Bold', 'ExtraBold', 'Black',
]);
const FontWidth = enumOf([
    'UltraCondensed', 'ExtraCondensed', 'Condensed', 'SemiCondensed',
    'Normal', 'SemiExpanded', 'Expanded', 'ExtraExpanded', 'UltraExpanded',
]);
const FontField = enumOf(['FamilyName', 'PostscriptName', 'Weight', 'Italic', 'Width']);

module.exports = {
    enumOf,
    UnitType,
    LineCap,
    LineJoin,
    LineType,
    StrokeAlignment,
    FillType,
    GradientFillType,
    ShapeCornerType,
    ShapeType,
    ShapeArrowEndStyle,
    ShapeSpiralStyle,
    ShapeCornerIndex,
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
    FontWeight,
    FontWidth,
    FontField,
};
