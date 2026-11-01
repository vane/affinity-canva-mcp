'use strict';

// A minimal stand-in for the Affinity SDK, sufficient to run the drawing scripts in
// this repo under plain Node and emit SVG instead of talking to Affinity.
//
// It implements only the surface the drawings touch, spread across the sibling files:
//
//   enums.js       enum helpers + UnitType, LineCap, LineJoin, LineType,
//                  StrokeAlignment, FillType, ShapeCornerType, ShapeType
//   colours.js     RGB8
//   fills.js       FillDescriptor
//   linestyle.js   LineStyle, LineStyleDescriptor
//   geometry.js    Rectangle, Curve, CurveBuilder, PolyCurve
//   shapes.js      Shape + every Shape* class
//   nodes.js       PolyCurveNodeDefinition, ShapeNodeDefinition
//   document.js    ShimDocument, NewDocumentOptions
//   svg.js         document -> SVG
//   warnings.js    approximation warnings collected per run
//
// Anything else throws, so a script that starts using more of the SDK fails loudly
// rather than silently rendering something wrong.
//
// Scripts are executed in a fresh `vm` context with a custom `require`, so
// `require('/document.js')` resolves to the shim rather than the filesystem root.
// State is per-run: two scripts rendered in sequence cannot see each other's nodes.

const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const enums = require('./enums.js');
const { RGB8 } = require('./colours.js');
const { FillDescriptor } = require('./fills.js');
const { LineStyle, LineStyleDescriptor } = require('./linestyle.js');
const { Rectangle, Curve, CurveBuilder, PolyCurve } = require('./geometry.js');
const shapes = require('./shapes.js');
const { PolyCurveNodeDefinition, ShapeNodeDefinition } = require('./nodes.js');
const { ShimDocument, NewDocumentOptions } = require('./document.js');
const { svgFromDocument } = require('./svg.js');
const warnings = require('./warnings.js');

// The SDK modules a drawing script may require.
const sdkModules = {
    '/document.js': { Document: null, NewDocumentOptions },
    '/nodes.js': { PolyCurveNodeDefinition, ShapeNodeDefinition },
    '/shapes.js': shapes.sdkSurface,
    '/geometry.js': { Rectangle, Curve, CurveBuilder, PolyCurve },
    '/colours.js': { RGB8 },
    '/fills.js': { FillDescriptor, FillType: enums.FillType },
    '/linestyle.js': {
        LineStyle, LineStyleDescriptor,
        LineCap: enums.LineCap, LineJoin: enums.LineJoin,
        LineType: enums.LineType, StrokeAlignment: enums.StrokeAlignment,
    },
    '/units.js': { UnitType: enums.UnitType },
};

// Runs one drawing script and returns its SVG. Fresh state per call.
function renderScriptToSvg(source, filename) {
    let current = null;

    // `Document` is per-run because `current` is; the static `Document` object is what
    // the scripts hold on to.
    const Document = {
        get current() { return current; },
        create(opts) {
            current = new ShimDocument(opts);
            return current;
        },
        get all() { return current ? [current] : []; },
    };

    const modules = Object.assign({}, sdkModules, {
        '/document.js': { Document, NewDocumentOptions },
    });

    const logs = [];
    warnings.reset();

    const sandbox = {
        require(spec) {
            if (Object.prototype.hasOwnProperty.call(modules, spec)) return modules[spec];
            throw new Error('SVG shim does not implement ' + spec);
        },
        console: {
            log(...args) { logs.push(args.map((a) => String(a)).join(' ')); },
            warn(...args) { logs.push(args.map((a) => String(a)).join(' ')); },
            error(...args) { logs.push(args.map((a) => String(a)).join(' ')); },
        },
    };

    vm.runInNewContext(source, sandbox, { filename: filename || 'drawing.js' });

    if (!current) throw new Error('Script did not create a document (no Document.create call)');

    return {
        svg: svgFromDocument(current),
        logs,
        warnings: warnings.list(),
        doc: current,
    };
}

function renderFileToSvg(filePath) {
    const source = fs.readFileSync(filePath, 'utf8');
    return renderScriptToSvg(source, path.basename(filePath));
}

module.exports = { renderScriptToSvg, renderFileToSvg, sdkModules };
