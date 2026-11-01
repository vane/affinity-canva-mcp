'use strict';

// Warnings raised while converting shapes to geometry. The runner resets this before
// each script and reports whatever was collected afterwards.

let items = [];

function warn(msg) {
    if (items.indexOf(msg) === -1) items.push(msg);
}

function reset() {
    items = [];
}

function list() {
    return items.slice();
}

module.exports = { warn, reset, list };
