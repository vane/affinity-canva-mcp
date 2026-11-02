'use strict';

// Fill descriptors. `kind` is the shim's own tag ('solid' | 'gradient' | 'none');
// `fillType` exposes it in the SDK's enum form so scripts that inspect it still work.
// Gradient fills carry the Gradient from `/colours.js` and a GradientFillType.

const { FillType, GradientFillType } = require('./enums.js');
const { RGB8, Gradient } = require('./colours.js');

class Fill {
    constructor() {
        this.alpha = 1;
        this.intensity = 1;
        this.noise = 0;
        this.tint = 1;
    }

    get isVisible() {
        return this.fillType !== FillType.None;
    }

    get hasNonFullAlpha() {
        return this.alpha < 1;
    }

    get hasFlatAlpha() {
        return true;
    }

    get hasNoise() {
        return this.noise !== 0;
    }

    get isSpatiallyInvariant() {
        return true;
    }

    get meanAlpha() {
        return this.alpha;
    }

    copyBaseTo(other) {
        other.alpha = this.alpha;
        other.intensity = this.intensity;
        other.noise = this.noise;
        other.tint = this.tint;
        return other;
    }
}

class SolidFill extends Fill {
    constructor(colour) {
        super();
        if (!colour || !colour.rgba8) throw new TypeError('expected Colour');
        this.colour = colour;
    }

    static create(colour) {
        return new SolidFill(colour);
    }

    static createDefault() {
        return new SolidFill(RGB8(0, 0, 0));
    }

    static fromFill(fill) {
        if (fill instanceof SolidFill) return fill.clone();
        if (fill instanceof FillDescriptor && fill.kind === 'solid') return new SolidFill(fill.colour);
        throw new TypeError('expected SolidFill');
    }

    clone() {
        return this.copyBaseTo(new SolidFill(this.colour));
    }

    get fillType() {
        return FillType.Solid;
    }
}

class GradientFill extends Fill {
    constructor(gradient, gradientFillType) {
        super();
        if (!gradient || !gradient.isGradient) throw new TypeError('expected Gradient');
        this._gradient = gradient;
        this._gradientFillType = gradientFillType || GradientFillType.Linear;
    }

    static create(gradient, gradientFillType) {
        return new GradientFill(gradient, gradientFillType);
    }

    static createDefault() {
        return new GradientFill(Gradient.default, GradientFillType.Linear);
    }

    static fromFill(fill) {
        if (fill instanceof GradientFill) return fill.clone();
        throw new TypeError('expected GradientFill');
    }

    clone() {
        return this.copyBaseTo(new GradientFill(this._gradient.clone(), this._gradientFillType));
    }

    cloneWithNewGradient(gradient) {
        return this.copyBaseTo(new GradientFill(gradient, this._gradientFillType));
    }

    cloneWithNewGradientFillType(gradientFillType) {
        return this.copyBaseTo(new GradientFill(this._gradient.clone(), gradientFillType));
    }

    get gradient() {
        return this._gradient;
    }

    get gradientFillType() {
        return this._gradientFillType;
    }

    get fillType() {
        return FillType.Gradient;
    }
}

function scaleColour(colour, alpha) {
    if (alpha === 1) return colour;

    const c = colour.rgba8;
    return {
        isColour: true,
        rgba8: {
            r: c.r,
            g: c.g,
            b: c.b,
            alpha: Math.max(0, Math.min(255, Math.round(c.alpha * alpha))),
        },
        toString: () => String(colour),
    };
}

class FillDescriptor {
    constructor(kind, colour, options) {
        this.kind = kind;
        this.colour = colour || null;

        options = options || {};
        this.gradient = options.gradient || null;
        this.gradientFillType = options.gradientFillType || null;
        this.alpha = options.alpha === undefined ? 1 : options.alpha;
        this.noise = options.noise === undefined ? 0 : options.noise;
        this.intensity = options.intensity === undefined ? 1 : options.intensity;
        this.tint = options.tint === undefined ? 1 : options.tint;
        this.transform = options.transform || null;
        this.blendMode = options.blendMode || null;
        this.scaleWithObject = !!options.scaleWithObject;
        this.anchoredToSpread = !!options.anchoredToSpread;
    }

    clone() {
        return new FillDescriptor(this.kind, this.colour, {
            gradient: this.gradient,
            gradientFillType: this.gradientFillType,
            alpha: this.alpha,
            noise: this.noise,
            intensity: this.intensity,
            tint: this.tint,
            transform: this.transform,
            blendMode: this.blendMode,
            scaleWithObject: this.scaleWithObject,
            anchoredToSpread: this.anchoredToSpread,
        });
    }

    cloneWithNewFill(fill) {
        return FillDescriptor.create(
            fill, this.scaleWithObject, this.transform, this.blendMode, this.anchoredToSpread);
    }

    cloneWithNewIsScaleWithObject(isScaleWithObject) {
        const c = this.clone();
        c.scaleWithObject = !!isScaleWithObject;
        return c;
    }

    cloneWithNewTransform(transform) {
        const c = this.clone();
        c.transform = transform;
        return c;
    }

    cloneWithNewTransformInfo(transform, isAnchoredToSpread) {
        const c = this.clone();
        c.transform = transform;
        c.anchoredToSpread = !!isAnchoredToSpread;
        return c;
    }

    cloneWithNewBlendMode(blendMode) {
        const c = this.clone();
        c.blendMode = blendMode;
        return c;
    }

    cloneWithNewIsAnchoredToSpread(isAnchoredToSpread) {
        const c = this.clone();
        c.anchoredToSpread = !!isAnchoredToSpread;
        return c;
    }

    get fill() {
        if (this.kind === 'none') return null;
        if (this.kind === 'gradient') {
            const gf = new GradientFill(this.gradient, this.gradientFillType);
            gf.alpha = this.alpha;
            return gf;
        }
        return new SolidFill(this.colour);
    }

    get fillType() {
        if (this.kind === 'gradient') return FillType.Gradient;
        if (this.kind === 'none') return FillType.None;
        return FillType.Solid;
    }

    static createNone() {
        return new FillDescriptor('none');
    }

    static createSolid(solidFill, blendMode) {
        if (solidFill instanceof SolidFill) {
            return new FillDescriptor('solid', scaleColour(solidFill.colour, solidFill.alpha), { blendMode });
        }
        if (!solidFill || !solidFill.rgba8) throw new TypeError('expected Colour');
        return new FillDescriptor('solid', solidFill, { blendMode });
    }

    static create(fill, scaleWithObject, transform, blendMode, anchoredToSpread) {
        if (fill instanceof FillDescriptor) return fill;

        if (fill instanceof GradientFill) {
            return new FillDescriptor('gradient', null, {
                gradient: fill.gradient,
                gradientFillType: fill.gradientFillType,
                alpha: fill.alpha,
                noise: fill.noise,
                intensity: fill.intensity,
                tint: fill.tint,
                transform,
                blendMode,
                scaleWithObject,
                anchoredToSpread,
            });
        }

        if (fill instanceof SolidFill) {
            return new FillDescriptor('solid', scaleColour(fill.colour, fill.alpha), {
                transform, blendMode, scaleWithObject, anchoredToSpread,
                noise: fill.noise, intensity: fill.intensity, tint: fill.tint,
            });
        }

        if (fill && fill.rgba8) {
            return new FillDescriptor('solid', fill, {
                transform, blendMode, scaleWithObject, anchoredToSpread,
            });
        }

        throw new TypeError('expected Fill');
    }
}

// Node definitions accept bare Colours, fill objects or descriptors.
function asFill(v) {
    if (v instanceof FillDescriptor) return v;
    if (v instanceof SolidFill) return FillDescriptor.createSolid(v);
    if (v instanceof GradientFill) return FillDescriptor.create(v);
    if (v && v.rgba8) return FillDescriptor.createSolid(v);
    return FillDescriptor.createNone();
}

// Mirrors the SDK helper: null becomes none, colours become solid descriptors, and
// anything else (GradientFill, FillDescriptor) is passed through unchanged.
function makeFillDescriptor(fillDescriptor) {
    if (fillDescriptor == null) return FillDescriptor.createNone();
    if (fillDescriptor instanceof SolidFill || (fillDescriptor && fillDescriptor.rgba8 && !(fillDescriptor instanceof FillDescriptor))) {
        return FillDescriptor.createSolid(fillDescriptor);
    }
    return fillDescriptor;
}

module.exports = {
    Fill,
    SolidFill,
    GradientFill,
    FillDescriptor,
    FillType,
    GradientFillType,
    asFill,
    makeFillDescriptor,
};
