'use strict';

const { FillDescriptor, asFill } = require('./fills.js');
const { LineStyleDescriptor } = require('./linestyle.js');
const { rectanglePolyCurve } = require('./geometry.js');

class PolyCurveNodeDefinition {
    constructor(polyCurve, brushFill, lineFill, lineStyleDescriptor, transparencyFill) {
        // The real factory dereferences .handle on every argument, so all five must
        // be real descriptors.
        if (!(brushFill instanceof FillDescriptor)) throw new TypeError('expected FillDescriptorHandle');
        if (!(lineFill instanceof FillDescriptor)) throw new TypeError('expected FillDescriptorHandle');
        if (!(transparencyFill instanceof FillDescriptor)) throw new TypeError('expected FillDescriptorHandle');
        if (!(lineStyleDescriptor instanceof LineStyleDescriptor)) {
            throw new TypeError('expected parameter lineStyleDescriptor to be LineStyleDescriptorHandle');
        }

        this.polyCurve = polyCurve;
        this.brushFill = brushFill;
        this.lineFill = lineFill;
        this.lineStyleDescriptor = lineStyleDescriptor;
        this.userDescription = '';
    }

    static create(polyCurve, brushFill, lineFill, lineStyleDescriptor, transparencyFill) {
        return new PolyCurveNodeDefinition(polyCurve, brushFill, lineFill, lineStyleDescriptor, transparencyFill);
    }
}

class ShapeNodeDefinition {
    constructor(shape, rect, brushFill, lineFill, lineStyleDescriptor, transparencyFill) {
        this.shape = shape;
        this.rect = rect;
        this.brushFill = asFill(brushFill);
        this.lineFill = asFill(lineFill);
        this.lineStyleDescriptor = lineStyleDescriptor;
        this.userDescription = '';
        this.polyCurve = shape && typeof shape.getCurves === 'function'
            ? shape.getCurves(rect)
            : rectanglePolyCurve(rect);
    }

    static create(shape, rect, brushFill, lineFill, lineStyleDescriptor, transparencyFill) {
        return new ShapeNodeDefinition(shape, rect, brushFill, lineFill, lineStyleDescriptor, transparencyFill);
    }
}

module.exports = { PolyCurveNodeDefinition, ShapeNodeDefinition };
