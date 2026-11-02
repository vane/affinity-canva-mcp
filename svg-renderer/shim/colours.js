'use strict';

// Colours. The shim only needs the 8-bit RGBA form, which is what the SVG writer reads.
// Gradients are modelled here too, because the SDK exposes `Gradient` from `/colours.js`.

function RGB8(r, g, b) {
    return { isColour: true, rgba8: { r, g, b, alpha: 255 }, toString: () => `RGB8(${r},${g},${b})` };
}

function normalizeStop(stop) {
    if (!stop || typeof stop !== 'object') throw new TypeError('expected ColourStop object');
    if (!stop.colour || !stop.colour.rgba8) throw new TypeError('expected Colour');

    return {
        colour: stop.colour,
        position: typeof stop.position === 'number' ? stop.position : 0,
        midpoint: typeof stop.midpoint === 'number' ? stop.midpoint : 0.5,
        smoothness: typeof stop.smoothness === 'number' ? stop.smoothness : 0,
    };
}

class Gradient {
    constructor(stops) {
        this._stops = (stops || []).map(normalizeStop);
        if (this._stops.length < 2) throw new TypeError('Gradient needs at least two stops');

        this.alpha = 1;
        this.noise = 0;
        this.intensity = 1;
        this.tint = 1;
    }

    static create(stops) {
        if (stops === undefined || stops === null) return Gradient.default;
        if (!Array.isArray(stops)) throw new TypeError('expected array of ColourStop objects');
        return new Gradient(stops);
    }

    static get default() {
        return new Gradient([
            { colour: RGB8(0, 0, 0), position: 0 },
            { colour: RGB8(255, 255, 255), position: 1 },
        ]);
    }

    clone() {
        const g = new Gradient(this._stops);
        g.alpha = this.alpha;
        g.noise = this.noise;
        g.intensity = this.intensity;
        g.tint = this.tint;
        return g;
    }

    get isGradient() {
        return true;
    }

    get stops() {
        return this._stops.map((stop) => ({ ...stop }));
    }

    getStop(index) {
        return this._stops[index];
    }

    get stopCount() {
        return this._stops.length;
    }

    get hasNonFullAlpha() {
        return this.alpha < 1 || this._stops.some((stop) => stop.colour.rgba8.alpha < 255);
    }

    get hasNoise() {
        return this.noise !== 0;
    }

    get hasNonLinearMapping() {
        return false;
    }
}

module.exports = { RGB8, Gradient };
