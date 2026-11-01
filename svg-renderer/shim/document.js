'use strict';

const { UnitType } = require('./enums.js');

let docCounter = 0;

// A document that just collects node definitions. The SVG writer reads `nodes`.
class ShimDocument {
    constructor(opts) {
        opts = opts || {};
        this.widthPixels = opts.width;
        this.heightPixels = opts.height;
        this.dpi = opts.dpi;
        this.units = opts.units;
        this.title = 'shim';
        this.sessionUuid = 'shim-' + (++docCounter);
        this.nodes = [];
        this._selection = null;
    }

    get selection() {
        return this._selection;
    }

    set selection(v) {
        this._selection = v;
    }

    // Clearing/selecting are no-ops beyond emptying the node list; the drawings
    // call these at the start of every run.
    selectAll() {
        this._selection = { nodes: { toArray: () => this.nodes.slice() } };
    }

    deleteSelection() {
        this.nodes.length = 0;
        this._selection = null;
    }

    addNode(def) {
        this.nodes.push(def);
        this._selection = { nodes: { toArray: () => [def] } };
        return undefined;                 // matches the real SDK
    }

    get currentSpread() {
        return { children: { all: { toArray: () => this.nodes } } };
    }
}

const NewDocumentOptions = {
    createDefault() {
        return {
            units: UnitType.Millimetre,
            width: 210,
            height: 297,
            dpi: 300,
            margins: 0,
            marginsEnabled: false,
            bleed: 0,
            createArtboard: false,
            pageCount: 1,
            isMultiPage: false,
            isFacing: false,
            isVerticalStack: false,
            isDoublePageStart: false,
            useDrawingScale: false,
            drawingScale: 1,
        };
    },
};

module.exports = { ShimDocument, NewDocumentOptions };
