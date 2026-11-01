'use strict';

const { FillType } = require('./enums.js');

// Fill descriptors. `kind` is the shim's own tag ('solid' | 'none'); `fillType`
// exposes it in the SDK's enum form so scripts that inspect it still work.

class FillDescriptor {
    constructor(kind, colour) {
        this.kind = kind;
        this.colour = colour || null;
    }

    static createSolid(colour) {
        if (!colour || !colour.rgba8) throw new TypeError('expected Colour');
        return new FillDescriptor('solid', colour);
    }

    static createNone() {
        return new FillDescriptor('none', null);
    }

    get fillType() {
        return this.kind === 'none' ? FillType.None : FillType.Solid;
    }
}

// ShapeNodeDefinition accepts bare Colours in the real SDK; normalise either form.
function asFill(v) {
    if (v instanceof FillDescriptor) return v;
    if (v && v.rgba8) return FillDescriptor.createSolid(v);
    return FillDescriptor.createNone();
}

module.exports = { FillDescriptor, asFill };
