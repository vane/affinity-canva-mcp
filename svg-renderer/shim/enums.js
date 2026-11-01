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

module.exports = {
    enumOf,
    UnitType,
    LineCap,
    LineJoin,
    LineType,
    StrokeAlignment,
    FillType,
    ShapeCornerType,
    ShapeType,
    ShapeArrowEndStyle,
    ShapeSpiralStyle,
    ShapeCornerIndex,
};
