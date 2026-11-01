'use strict';

// Colours. The shim only needs the 8-bit RGBA form, which is what the SVG writer reads.

function RGB8(r, g, b) {
    return { isColour: true, rgba8: { r, g, b, alpha: 255 }, toString: () => `RGB8(${r},${g},${b})` };
}

module.exports = { RGB8 };
