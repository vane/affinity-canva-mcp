'use strict';

const { FillDescriptor, asFill } = require('./fills.js');
const { LineStyleDescriptor } = require('./linestyle.js');
const { rectanglePolyCurve } = require('./geometry.js');
const { StoryBuilder } = require('./storybuilder.js');

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

// Text definitions copy the story at creation time, exactly like the real SDK: the
// builder can be reused afterwards without changing a node already created from it.
class TextNodeDefinition {
    constructor(storyBuilder) {
        if (!(storyBuilder instanceof StoryBuilder)) {
            throw new TypeError('expected StoryBuilderHandle');
        }

        this.storyBuilder = storyBuilder;
        this.text = storyBuilder.text;
        this.paragraphs = storyBuilder.paragraphs;
        this.userDescription = '';
    }
}

class FrameTextNodeDefinition extends TextNodeDefinition {
    constructor(frameBox, storyBuilder) {
        if (!frameBox || typeof frameBox !== 'object') throw new TypeError('expected Rectangle');
        super(storyBuilder);
        this.textKind = 'frame';
        this.frameBox = frameBox;
    }

    static createFromStoryBuilder(frameBox, storyBuilder) {
        return new FrameTextNodeDefinition(frameBox, storyBuilder);
    }
}

class ArtTextNodeDefinition extends TextNodeDefinition {
    constructor(position, storyBuilder) {
        if (!position || typeof position !== 'object') throw new TypeError('expected Point');
        super(storyBuilder);
        this.textKind = 'art';
        this.position = position;
    }

    static createFromStoryBuilder(position, storyBuilder) {
        return new ArtTextNodeDefinition(position, storyBuilder);
    }
}

module.exports = {
    PolyCurveNodeDefinition,
    ShapeNodeDefinition,
    TextNodeDefinition,
    FrameTextNodeDefinition,
    ArtTextNodeDefinition,
};
