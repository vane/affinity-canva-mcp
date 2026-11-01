'use strict';

const { LineCap, LineJoin, LineType, StrokeAlignment } = require('./enums.js');

class LineStyle {
    constructor(o) {
        o = o || {};
        this.weight = o.weight !== undefined ? o.weight : 1;
        this.cap = o.cap || LineCap.Butt;
        this.join = o.join || LineJoin.Miter;
        this.type = o.type || LineType.Solid;
    }

    static create(o) {
        return new LineStyle(o);
    }
}

class LineStyleDescriptor {
    constructor(lineStyle, o) {
        this.lineStyle = lineStyle;
        this.strokeAlignment = (o && o.strokeAlignment) || StrokeAlignment.Centre;
    }

    static create(lineStyle, o) {
        return new LineStyleDescriptor(lineStyle, o);
    }
}

module.exports = { LineStyle, LineStyleDescriptor };
