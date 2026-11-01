'use strict';

class Rectangle {
    constructor(x, y, width, height) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
    }
}

class Curve {
    constructor(beziers, isClosed) {
        this.beziers = beziers;      // [{ start, c1, c2, end }]
        this.isClosed = !!isClosed;
    }

    get isEmpty() {
        return this.beziers.length === 0;
    }

    get pointCount() {
        return this.beziers.length;
    }
}

// Records segments, then flattens them to cubics. A line becomes a cubic with
// c1 = start and c2 = end, which is how Affinity represents straight segments.
class CurveBuilder {
    constructor() {
        this.reset();
    }

    static create() {
        return new CurveBuilder();
    }

    reset() {
        this.segs = [];
        this.start = null;
        this.cur = null;
        this.closed = false;
    }

    beginXY(x, y) {
        this.reset();
        this.start = { x, y };
        this.cur = { x, y };
        return this;
    }

    lineToXY(x, y) {
        this.segs.push({ t: 'L', p: { x, y } });
        this.cur = { x, y };
        return this;
    }

    addBezierXY(c1x, c1y, c2x, c2y, x, y) {
        this.segs.push({ t: 'C', c1: { x: c1x, y: c1y }, c2: { x: c2x, y: c2y }, p: { x, y } });
        this.cur = { x, y };
        return this;
    }

    close() {
        this.closed = true;
        return this;
    }

    createCurve() {
        const beziers = [];
        let cur = this.start;

        for (const s of this.segs) {
            if (s.t === 'L') {
                beziers.push({ start: cur, c1: cur, c2: s.p, end: s.p });
            } else {
                beziers.push({ start: cur, c1: s.c1, c2: s.c2, end: s.p });
            }
            cur = s.p;
        }

        // close() adds the implied segment back to the start, matching Affinity.
        // The epsilon matters: arc endpoints come from cos/sin, so a point that is
        // geometrically the start can differ by ~1e-16 and otherwise emit a
        // degenerate cubic.
        if (this.closed && cur && this.start) {
            const dx = cur.x - this.start.x;
            const dy = cur.y - this.start.y;
            if (Math.hypot(dx, dy) > 1e-6) {
                beziers.push({ start: cur, c1: cur, c2: this.start, end: this.start });
            }
        }

        return new Curve(beziers, this.closed);
    }
}

class PolyCurve {
    constructor() {
        this._curves = [];
    }

    static create() {
        return new PolyCurve();
    }

    addCurve(curve) {
        this._curves.push(curve);
        return this;
    }

    get curveCount() {
        return this._curves.length;
    }

    at(index) {
        return this._curves[index];
    }

    get curves() {
        return this._curves;
    }
}

// A rectangle as a closed curve of four line segments.
function rectangleCurve(rect) {
    const x0 = rect.x, y0 = rect.y;
    const x1 = rect.x + rect.width, y1 = rect.y + rect.height;
    return CurveBuilder.create()
        .beginXY(x0, y0)
        .lineToXY(x1, y0)
        .lineToXY(x1, y1)
        .lineToXY(x0, y1)
        .close()
        .createCurve();
}

function rectanglePolyCurve(rect) {
    const pc = PolyCurve.create();
    pc.addCurve(rectangleCurve(rect));
    return pc;
}

module.exports = {
    Rectangle,
    Curve,
    CurveBuilder,
    PolyCurve,
    rectangleCurve,
    rectanglePolyCurve,
};
