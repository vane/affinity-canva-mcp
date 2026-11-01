'use strict';

// Shape geometry. Each shape implements getCurves(bounds) -> PolyCurve, mirroring the
// SDK's ShapeApi.getCurves. Geometry was checked against Affinity's own output for the
// same bounds: every shape below reproduces Affinity to well under a pixel. The only
// remaining approximations are ShapeQRCode (which needs a QR encoder) and the arrow end
// styles other than Arrow/None; both raise a warning through ./warnings.js.

const { CurveBuilder, Curve, PolyCurve, rectangleCurve } = require('./geometry.js');
const {
    ShapeCornerType, ShapeType, ShapeArrowEndStyle, ShapeSpiralStyle, ShapeCornerIndex,
} = require('./enums.js');
const warnings = require('./warnings.js');

const warnShape = warnings.warn;

// Affinity's optimal cubic approximation of a quarter circle. The ellipse-family shapes
// use it for exact quarter turns; other arcs use the generic 4/3*tan(span/4) fit.
const QUARTER_K = 0.551915024494;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const arcK = (span) => (4 / 3) * Math.tan(Math.abs(span) / 4) * Math.sign(span);

// Elliptical arc split into <=90deg beziers (generic constant).
function arcSegments(b, cx, cy, rx, ry, a1, a2) {
    const total = a2 - a1;
    // The epsilon stops an exact quarter turn from being split in two by rounding.
    const steps = Math.max(1, Math.ceil(Math.abs(total) / (Math.PI / 2) - 1e-9));
    const da = total / steps;
    for (let i = 0; i < steps; i++) {
        const s = a1 + i * da;
        const e = s + da;
        const k = (4 / 3) * Math.tan((e - s) / 4);
        const cs1 = Math.cos(s), sn1 = Math.sin(s);
        const cs2 = Math.cos(e), sn2 = Math.sin(e);
        const px1 = cx + rx * cs1, py1 = cy + ry * sn1;
        const px2 = cx + rx * cs2, py2 = cy + ry * sn2;
        const tx1 = -rx * sn1, ty1 = ry * cs1;
        const tx2 = -rx * sn2, ty2 = ry * cs2;
        b.addBezierXY(px1 + k * tx1, py1 + k * ty1, px2 - k * tx2, py2 - k * ty2, px2, py2);
    }
}

// Elliptical arc split at multiples of 90deg, using the precision quarter-circle constant
// for exact quarter turns. This is what Affinity's ellipse family emits (ellipse, callout
// corners, cog hole).
function addArc(b, cx, cy, rx, ry, a1, a2) {
    const dir = a2 >= a1 ? 1 : -1;
    let cur = a1;
    let guard = 0;
    while (Math.abs(a2 - cur) > 1e-9 && guard++ < 64) {
        let next;
        if (dir > 0) {
            const m = Math.floor(cur / (Math.PI / 2) + 1e-9) + 1;
            next = Math.min(a2, m * (Math.PI / 2));
        } else {
            const m = Math.ceil(cur / (Math.PI / 2) - 1e-9) - 1;
            next = Math.max(a2, m * (Math.PI / 2));
        }
        const span = next - cur;
        const k = Math.abs(Math.abs(span) - Math.PI / 2) < 1e-9
            ? QUARTER_K * Math.sign(span)
            : arcK(span);
        const px1 = cx + rx * Math.cos(cur), py1 = cy + ry * Math.sin(cur);
        const px2 = cx + rx * Math.cos(next), py2 = cy + ry * Math.sin(next);
        const tx1 = -rx * Math.sin(cur), ty1 = ry * Math.cos(cur);
        const tx2 = -rx * Math.sin(next), ty2 = ry * Math.cos(next);
        b.addBezierXY(px1 + k * tx1, py1 + k * ty1, px2 - k * tx2, py2 - k * ty2, px2, py2);
        cur = next;
    }
}

function oneCurve(curve) {
    const pc = PolyCurve.create();
    pc.addCurve(curve);
    return pc;
}

function rotateCurve(curve, cx, cy, rot) {
    if (!rot) return curve;
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const rp = (p) => ({
        x: cx + (p.x - cx) * cs - (p.y - cy) * sn,
        y: cy + (p.x - cx) * sn + (p.y - cy) * cs,
    });
    const beziers = curve.beziers.map((bz) => ({
        start: rp(bz.start), c1: rp(bz.c1), c2: rp(bz.c2), end: rp(bz.end),
    }));
    return new Curve(beziers, curve.isClosed);
}

// Normalised shapes live on the unit square [-1,1]^2, mapped onto `bounds`.
function mapPoint(u, v, cx, cy, rx, ry) {
    return { x: cx + u * rx, y: cy + v * ry };
}

// Closed polyline from normalised points. Consecutive duplicate points are dropped: a
// degenerate spike (e.g. SquareStar with cutout 0 or 1) collapses to a single vertex in
// Affinity too.
function polygonPolyCurve(pts, cx, cy, rx, ry) {
    const b = CurveBuilder.create();
    let started = false;
    let prev = null;
    for (const p of pts) {
        if (prev && Math.abs(prev[0] - p[0]) < 1e-9 && Math.abs(prev[1] - p[1]) < 1e-9) continue;
        const q = mapPoint(p[0], p[1], cx, cy, rx, ry);
        if (!started) { b.beginXY(q.x, q.y); started = true; } else { b.lineToXY(q.x, q.y); }
        prev = p;
    }
    if (started) b.close();
    return oneCurve(b.createCurve());
}

// Same, but keeps zero-length segments. Affinity keeps them for arrows whose shaft has
// zero length (the two heads meet at the centre).
function polygonPolyCurveKeepingDegenerate(pts, cx, cy, rx, ry) {
    const b = CurveBuilder.create();
    for (let i = 0; i < pts.length; i++) {
        const q = mapPoint(pts[i][0], pts[i][1], cx, cy, rx, ry);
        if (i === 0) b.beginXY(q.x, q.y); else b.lineToXY(q.x, q.y);
    }
    // close() drops the final segment when it is zero-length, matching Affinity.
    b.close();
    return oneCurve(b.createCurve());
}

// ---------------------------------------------------------------- base

class Shape {
    get shapeType() {
        return 'Unknown';
    }

    getCurves() {
        throw new Error('SVG shim does not implement geometry for ' + this.constructor.name);
    }

    static create(shapeType) {
        const name = shapeType && shapeType.name ? shapeType.name : String(shapeType);
        const cls = SHAPE_BY_TYPE[name];
        if (!cls) throw new Error('Unknown shape type: ' + name);
        return cls.create();
    }
}

// ---------------------------------------------------------------- rectangle

class ShapeRectangleCorner {
    constructor() {
        this.radius = 0;
        // Affinity defaults this to None, and a radius is only honoured once the
        // corner is set to Round.
        this.cornerType = ShapeCornerType.None;
    }

    setRadius(value) {
        this.radius = value;
    }

    assign(src) {
        if (src && src.radius != null) this.radius = src.radius;
        if (src && src.cornerType != null) this.cornerType = src.cornerType;
    }
}

class ShapeRectangle extends Shape {
    constructor() {
        super();
        this.topLeft = new ShapeRectangleCorner();
        this.topRight = new ShapeRectangleCorner();
        this.bottomRight = new ShapeRectangleCorner();
        this.bottomLeft = new ShapeRectangleCorner();
        this.useSingleRadius = false;
    }

    static create() {
        return new ShapeRectangle();
    }

    get shapeType() {
        return 'Rectangle';
    }

    setTopLeft(v) { this.topLeft.assign(v); }
    setTopRight(v) { this.topRight.assign(v); }
    setBottomLeft(v) { this.bottomLeft.assign(v); }
    setBottomRight(v) { this.bottomRight.assign(v); }

    getCurves(bounds) {
        const { x, y, width: w, height: h } = bounds;
        const radiusOf = (c) => {
            const t = c.cornerType && c.cornerType.value;
            if (t !== 'round') return 0;
            // Affinity stores the corner radius as a fraction of the shape's smaller
            // dimension, not as pixels: setRadius(0.2) on a 110px square gives 22px.
            const f = Math.max(0, Math.min(1, c.radius || 0));
            return f * Math.min(w, h);
        };
        const cap = Math.min(w, h) / 2;
        const rTL = Math.min(radiusOf(this.topLeft), cap);
        const rTR = Math.min(radiusOf(this.topRight), cap);
        const rBR = Math.min(radiusOf(this.bottomRight), cap);
        const rBL = Math.min(radiusOf(this.bottomLeft), cap);

        const b = CurveBuilder.create();
        b.beginXY(x + rTL, y);
        b.lineToXY(x + w - rTR, y);
        if (rTR > 0) arcSegments(b, x + w - rTR, y + rTR, rTR, rTR, -Math.PI / 2, 0);
        b.lineToXY(x + w, y + h - rBR);
        if (rBR > 0) arcSegments(b, x + w - rBR, y + h - rBR, rBR, rBR, 0, Math.PI / 2);
        b.lineToXY(x + rBL, y + h);
        if (rBL > 0) arcSegments(b, x + rBL, y + h - rBL, rBL, rBL, Math.PI / 2, Math.PI);
        b.lineToXY(x, y + rTL);
        if (rTL > 0) arcSegments(b, x + rTL, y + rTL, rTL, rTL, Math.PI, Math.PI * 1.5);
        b.close();
        return oneCurve(b.createCurve());
    }
}

// ---------------------------------------------------------------- ellipse

class ShapeEllipse extends Shape {
    static create() { return new ShapeEllipse(); }

    get shapeType() { return 'Ellipse'; }

    getCurves(bounds) {
        const cx = bounds.x + bounds.width / 2;
        const cy = bounds.y + bounds.height / 2;
        const rx = bounds.width / 2;
        const ry = bounds.height / 2;
        const b = CurveBuilder.create();
        b.beginXY(cx, cy - ry);
        arcSegments(b, cx, cy, rx, ry, -Math.PI / 2, Math.PI * 1.5);
        b.close();
        return oneCurve(b.createCurve());
    }
}

// ---------------------------------------------------------------- polygon / stars

class ShapePolygon extends Shape {
    constructor() {
        super();
        this.sides = 5;
        this.smoothPoints = false;
    }

    static create() { return new ShapePolygon(); }

    get shapeType() { return 'Polygon'; }

    getCurves(bounds) {
        const n = Math.max(3, Math.round(this.sides));
        const cx = bounds.x + bounds.width / 2;
        const cy = bounds.y + bounds.height / 2;
        const rx = bounds.width / 2;
        const ry = bounds.height / 2;
        const b = CurveBuilder.create();
        for (let i = 0; i < n; i++) {
            const a = -Math.PI / 2 + (i * Math.PI * 2) / n;
            const px = cx + rx * Math.cos(a);
            const py = cy + ry * Math.sin(a);
            if (i === 0) b.beginXY(px, py); else b.lineToXY(px, py);
        }
        b.close();
        return oneCurve(b.createCurve());
    }
}

class ShapeStar extends Shape {
    constructor() {
        super();
        this.points = 5;
        this.innerRadius = 0.3819660112501051;
    }

    static create() { return new ShapeStar(); }

    get shapeType() { return 'Star'; }

    getCurves(bounds) {
        return this.getCurvesWith(bounds, Math.max(3, Math.round(this.points)), this.innerRadius);
    }

    // Shared star builder used by the star family.
    getCurvesWith(bounds, n, ir) {
        const cx = bounds.x + bounds.width / 2;
        const cy = bounds.y + bounds.height / 2;
        const rx = bounds.width / 2;
        const ry = bounds.height / 2;
        const inner = Math.min(1, Math.max(0.01, ir));
        const b = CurveBuilder.create();
        for (let i = 0; i < n * 2; i++) {
            const a = -Math.PI / 2 + (i * Math.PI) / n;
            const f = (i % 2 === 0) ? 1 : inner;
            const px = cx + rx * f * Math.cos(a);
            const py = cy + ry * f * Math.sin(a);
            if (i === 0) b.beginXY(px, py); else b.lineToXY(px, py);
        }
        b.close();
        return oneCurve(b.createCurve());
    }
}

// Affinity's square star: a regular n-gon whose points are cut square. Each point has a
// flat tip pulled in to radius (1 - cutout), and two corners sitting cutout*cos(pi/n)
// further out along the point's edges (which lie on the n-gon).
class ShapeSquareStar extends Shape {
    constructor() {
        super();
        this.sides = 5;
        this.cutout = 0.5;
    }

    static create() { return new ShapeSquareStar(); }

    get shapeType() { return 'SquareStar'; }

    getCurves(bounds) {
        const cx = bounds.x + bounds.width / 2;
        const cy = bounds.y + bounds.height / 2;
        const rx = bounds.width / 2;
        const ry = bounds.height / 2;
        const n = Math.max(3, Math.round(this.sides));
        const cutout = clamp(this.cutout, 0, 1);
        const inner = 1 - cutout;
        const step = (Math.PI * 2) / n;
        const cornerOffset = cutout * Math.cos(Math.PI / n);
        const pts = [];
        for (let k = 0; k < n; k++) {
            const th = -Math.PI / 2 + k * step;
            const th1 = th + step;
            const t = [inner * Math.cos(th), inner * Math.sin(th)];
            const p = [
                t[0] + cornerOffset * Math.cos(th + Math.PI / n),
                t[1] + cornerOffset * Math.sin(th + Math.PI / n),
            ];
            const q = [
                inner * Math.cos(th1) + cornerOffset * Math.cos(th1 - Math.PI / n),
                inner * Math.sin(th1) + cornerOffset * Math.sin(th1 - Math.PI / n),
            ];
            pts.push(t, p, q);
        }
        return polygonPolyCurve(pts, cx, cy, rx, ry);
    }
}

// Affinity's double star: 4n vertices alternating between the outer tip (radius 1), the
// inner valley (`innerRadius`), the secondary point (`pointRadius`) and the valley again.
class ShapeDoubleStar extends Shape {
    constructor() {
        super();
        this.points = 5;
        this.innerRadius = 0.5257311121191336;
        this.pointRadius = 0.8090169943749475;
    }

    static create() { return new ShapeDoubleStar(); }

    get shapeType() { return 'DoubleStar'; }

    getCurves(bounds) {
        const cx = bounds.x + bounds.width / 2;
        const cy = bounds.y + bounds.height / 2;
        const rx = bounds.width / 2;
        const ry = bounds.height / 2;
        const n = Math.max(2, Math.trunc(this.points));
        const inner = clamp(this.innerRadius, 0, 1);
        const pointRadius = clamp(this.pointRadius, 0, 1);
        const radii = [1, inner, pointRadius, inner];
        const total = n * 4;
        const pts = [];
        for (let i = 0; i < total; i++) {
            const a = -Math.PI / 2 + (i * Math.PI * 2) / total;
            const r = radii[i % 4];
            pts.push([r * Math.cos(a), r * Math.sin(a)]);
        }
        return polygonPolyCurve(pts, cx, cy, rx, ry);
    }
}

class ShapeCloud extends Shape {
    constructor() {
        super();
        this.bubbles = 12;
        this.innerRadius = 0.816496580927726;
    }

    static create() { return new ShapeCloud(); }

    get shapeType() { return 'Cloud'; }

    getCurves(bounds) {
        // Affinity's cloud is n bubbles. Each bubble is a quarter of an ellipse centred
        // rb*cos(PI/n) along its apex direction, with semi-axes rb*sin(PI/n) across and
        // 1-rb*cos(PI/n) along it. That puts every apex exactly on the bounding radius
        // (as Affinity does) and every valley on radius rb. With the canonical inner
        // radius 1/(cos(PI/n)+sin(PI/n)) the two semi-axes are equal and it is a circle.
        const cx = bounds.x + bounds.width / 2;
        const cy = bounds.y + bounds.height / 2;
        const rx = bounds.width / 2;
        const ry = bounds.height / 2;
        const n = Math.max(3, Math.round(this.bubbles));
        const rb = clamp(this.innerRadius, 0.05, 1);
        const cosStep = Math.cos(Math.PI / n);
        const sinStep = Math.sin(Math.PI / n);
        const centreDist = rb * cosStep;
        const across = rb * sinStep;          // semi-axis perpendicular to the bubble
        const along = 1 - centreDist;         // semi-axis along the bubble

        // Collect the arcs in normalised space, then map onto the bounds.
        const segs = [];
        const bubbleArc = (th, t1, t2) => {
            const axis = [Math.cos(th), Math.sin(th)];
            const perp = [-Math.sin(th), Math.cos(th)];
            const centre = [centreDist * axis[0], centreDist * axis[1]];
            const P = (t) => [
                centre[0] + across * Math.cos(t) * perp[0] + along * Math.sin(t) * axis[0],
                centre[1] + across * Math.cos(t) * perp[1] + along * Math.sin(t) * axis[1],
            ];
            const D = (t) => [
                -across * Math.sin(t) * perp[0] + along * Math.cos(t) * axis[0],
                -across * Math.sin(t) * perp[1] + along * Math.cos(t) * axis[1],
            ];
            const span = t2 - t1;
            const steps = Math.max(1, Math.ceil(Math.abs(span) / (Math.PI / 2) - 1e-9));
            const dt = span / steps;
            const k = Math.abs(Math.abs(dt) - Math.PI / 2) < 1e-9
                ? QUARTER_K * Math.sign(dt)
                : (4 / 3) * Math.tan(Math.abs(dt) / 4) * Math.sign(dt);
            for (let i = 0; i < steps; i++) {
                const s = t1 + i * dt;
                const e = s + dt;
                const p1 = P(s), p2 = P(e), d1 = D(s), d2 = D(e);
                segs.push({
                    start: p1,
                    c1: [p1[0] + k * d1[0], p1[1] + k * d1[1]],
                    c2: [p2[0] - k * d2[0], p2[1] - k * d2[1]],
                    end: p2,
                });
            }
        };

        for (let i = 0; i < n; i++) {
            const th = -Math.PI / 2 + (i * Math.PI * 2) / n;
            const tn = th + (Math.PI * 2) / n;
            bubbleArc(th, Math.PI / 2, 0);          // apex -> valley
            bubbleArc(tn, Math.PI, Math.PI / 2);    // valley -> next apex
        }

        const b = CurveBuilder.create();
        b.beginXY(cx + segs[0].start[0] * rx, cy + segs[0].start[1] * ry);
        for (const s of segs) {
            b.addBezierXY(cx + s.c1[0] * rx, cy + s.c1[1] * ry,
                          cx + s.c2[0] * rx, cy + s.c2[1] * ry,
                          cx + s.end[0] * rx, cy + s.end[1] * ry);
        }
        b.close();
        return oneCurve(b.createCurve());
    }
}

// ---------------------------------------------------------------- triangle / diamond / trapezoid

class ShapeTriangle extends Shape {
    constructor() {
        super();
        this.position = 0.5;
    }

    static create() { return new ShapeTriangle(); }

    get shapeType() { return 'Triangle'; }

    getCurves(bounds) {
        const { x, y, width: w, height: h } = bounds;
        const b = CurveBuilder.create();
        b.beginXY(x + w * this.position, y);
        b.lineToXY(x + w, y + h);
        b.lineToXY(x, y + h);
        b.close();
        return oneCurve(b.createCurve());
    }
}

class ShapeDiamond extends Shape {
    constructor() {
        super();
        this.position = 0.5;
    }

    static create() { return new ShapeDiamond(); }

    get shapeType() { return 'Diamond'; }

    getCurves(bounds) {
        const { x, y, width: w, height: h } = bounds;
        const ym = y + h * this.position;
        const b = CurveBuilder.create();
        b.beginXY(x + w / 2, y);
        b.lineToXY(x + w, ym);
        b.lineToXY(x + w / 2, y + h);
        b.lineToXY(x, ym);
        b.close();
        return oneCurve(b.createCurve());
    }
}

class ShapeTrapezoid extends Shape {
    constructor() {
        super();
        this.left = 0.25;
        this.right = 0.75;
    }

    static create() { return new ShapeTrapezoid(); }

    get shapeType() { return 'Trapezoid'; }

    setPositions(left, right) {
        this.left = left;
        this.right = right;
    }

    getCurves(bounds) {
        const { x, y, width: w, height: h } = bounds;
        const b = CurveBuilder.create();
        b.beginXY(x + w * this.right, y);
        b.lineToXY(x + w, y + h);
        b.lineToXY(x, y + h);
        b.lineToXY(x + w * this.left, y);
        b.close();
        return oneCurve(b.createCurve());
    }
}

// ---------------------------------------------------------------- arrow

// Mirrors the SDK's ShapeArrowLeftEndProxy / ShapeArrowRightEndProxy: the values are
// readable directly and writable through the set* methods.
class ShapeArrowEnd {
    constructor() {
        this.style = ShapeArrowEndStyle.Arrow;
        this.length = 0.5;
        this.innerOffset = 0;
        this.isProportional = true;
    }

    setLength(value) { this.length = value; }
    setInnerOffset(value) { this.innerOffset = value; }
    setIsProportional(value) { this.isProportional = value; }

    assign(src) {
        if (!src) return;
        if (src.style != null) this.style = src.style;
        if (src.length != null) this.length = src.length;
        if (src.innerOffset != null) this.innerOffset = src.innerOffset;
        if (src.isProportional != null) this.isProportional = src.isProportional;
    }
}

function endStyleName(end) {
    const style = end && end.style;
    if (!style) return 'Arrow';
    return style.name || style.value || String(style);
}

class ShapeArrow extends Shape {
    constructor() {
        super();
        this.thickness = 0.35;
        this.leftEnd = new ShapeArrowEnd();
        this.rightEnd = new ShapeArrowEnd();
    }

    static create() { return new ShapeArrow(); }

    get shapeType() { return 'Arrow'; }

    setLeftEnd(value) { this.leftEnd.assign(value); }
    setRightEnd(value) { this.rightEnd.assign(value); }

    getCurves(bounds) {
        const { x, y, width: w, height: h } = bounds;
        const cy = y + h / 2;
        const t = clamp(this.thickness, 0, 1);
        const half = (t * h) / 2;
        const maxHead = 0.5 * h;

        // A head is `length * height` long (Affinity measures the arrow's length against
        // the height, not the width), and its shaft meets it at hb - innerOffset*height,
        // clipped by the head's slanted edge. The left head base is additionally capped so
        // it cannot sit closer to the right edge than a maximum-length head.
        const endGeom = (end, isRight) => {
            const style = endStyleName(end);
            if (style !== 'Arrow' && style !== 'None') {
                warnShape('Arrow end style "' + style + '" is not implemented (drawn as Arrow)');
            }
            if (style === 'None') {
                const edgeX = isRight ? x + w : x;
                return { style: 'None', hb: edgeX, xs: edgeX };
            }
            const headLen = clamp(end.length, 0, 0.5) * h;
            let hb = isRight ? x + w - headLen : x + headLen;
            if (!isRight) hb = Math.min(hb, x + w - maxHead);
            let xs = isRight ? hb - end.innerOffset * h : hb + end.innerOffset * h;
            const edge = isRight
                ? hb + (1 - t) * (x + w - hb)
                : hb - (1 - t) * (hb - x);
            xs = isRight ? Math.min(xs, edge) : Math.max(xs, edge);
            return { style: 'Arrow', hb, xs };
        };

        const right = endGeom(this.rightEnd, true);
        const left = endGeom(this.leftEnd, false);
        // The shaft cannot cross the opposite head's base.
        const xsR = Math.max(right.xs, left.hb);
        const xsL = Math.min(left.xs, right.hb);

        const pts = [];

        // Right end: shaft top -> head -> shaft bottom.
        if (right.style === 'None') {
            pts.push([x + w, cy - half], [x + w, cy + half]);
        } else {
            pts.push([xsR, cy - half], [right.hb, y], [x + w, cy], [right.hb, y + h], [xsR, cy + half]);
        }

        // Left end: shaft bottom -> head -> shaft top.
        if (left.style === 'None') {
            pts.push([x, cy + half], [x, cy - half]);
        } else {
            pts.push([xsL, cy + half], [left.hb, y + h], [x, cy], [left.hb, y], [xsL, cy - half]);
        }

        return polygonPolyCurveKeepingDegenerate(pts, 0, 0, 1, 1);
    }
}

// ---------------------------------------------------------------- pie

class ShapePie extends Shape {
    constructor() {
        super();
        this.startAngle = Math.PI / 2;
        this.endAngle = 0;
        this.innerRadius = 0;
    }

    static create() { return new ShapePie(); }

    get shapeType() { return 'Pie'; }

    getCurves(bounds) {
        const cx = bounds.x + bounds.width / 2;
        const cy = bounds.y + bounds.height / 2;
        const rx = bounds.width / 2;
        const ry = bounds.height / 2;

        // Affinity measures pie angles from 12 o'clock, clockwise, and sweeps from
        // startAngle to endAngle. In y-down space that is angle - PI/2.
        const a1 = this.startAngle - Math.PI / 2;
        let sweep = (this.endAngle - Math.PI / 2) - a1;
        while (sweep <= 0) sweep += Math.PI * 2;
        const a2 = a1 + sweep;

        const ir = Math.min(1, Math.max(0, this.innerRadius || 0));
        const b = CurveBuilder.create();

        if (ir > 0) {
            const irx = rx * ir;
            const iry = ry * ir;
            b.beginXY(cx + irx * Math.cos(a1), cy + iry * Math.sin(a1));
            b.lineToXY(cx + rx * Math.cos(a1), cy + ry * Math.sin(a1));
            arcSegments(b, cx, cy, rx, ry, a1, a2);
            b.lineToXY(cx + irx * Math.cos(a2), cy + iry * Math.sin(a2));
            arcSegments(b, cx, cy, irx, iry, a2, a1);
        } else {
            b.beginXY(cx, cy);
            b.lineToXY(cx + rx * Math.cos(a1), cy + ry * Math.sin(a1));
            arcSegments(b, cx, cy, rx, ry, a1, a2);
        }
        b.close();
        return oneCurve(b.createCurve());
    }
}

// ---------------------------------------------------------------- segment

class ShapeSegment extends Shape {
    constructor() {
        super();
        this.angle = Math.PI / 2;
        this.lowerLine = 0.25;
        this.upperLine = 1;
    }

    static create() { return new ShapeSegment(); }

    get shapeType() { return 'Segment'; }

    getCurves(bounds) {
        const cx = bounds.x + bounds.width / 2;
        const cy = bounds.y + bounds.height / 2;
        const rx = bounds.width / 2;
        const ry = bounds.height / 2;

        // The cut is a horizontal chord; lowerLine is measured from the bottom edge.
        if (this.upperLine < 1) {
            warnShape('Segment upperLine < 1 is not implemented (chord at the top ignored)');
        }
        const yBottom = bounds.y + bounds.height * (1 - this.lowerLine);
        const s = Math.max(-1, Math.min(1, (yBottom - cy) / ry));
        const th = Math.asin(s);
        const a1 = Math.PI - th;
        const a2 = Math.PI * 2 + th;

        const b = CurveBuilder.create();
        b.beginXY(cx + rx * Math.cos(a1), cy + ry * Math.sin(a1));
        arcSegments(b, cx, cy, rx, ry, a1, a2);
        b.close();
        return oneCurve(b.createCurve());
    }
}

// ---------------------------------------------------------------- heart

class ShapeHeart extends Shape {
    constructor() {
        super();
        this.spread = 0.2;
    }

    static create() { return new ShapeHeart(); }

    get shapeType() { return 'Heart'; }

    getCurves(bounds) {
        // Normalised outline taken from Affinity's own output; `spread` is not applied.
        const { x, y, width: w, height: h } = bounds;
        const px = (u) => x + w * u;
        const py = (v) => y + h * v;

        const b = CurveBuilder.create();
        b.beginXY(px(0.5), py(0.2));
        b.addBezierXY(px(0.6053), py(0.0), px(0.8158), py(0.0), px(0.9211), py(0.1));
        b.addBezierXY(px(1.0263), py(0.2), px(1.0263), py(0.4), px(0.9211), py(0.6));
        b.addBezierXY(px(0.8474), py(0.75), px(0.6579), py(0.9), px(0.5), py(1.0));
        b.addBezierXY(px(0.3421), py(0.9), px(0.1526), py(0.75), px(0.0789), py(0.6));
        b.addBezierXY(px(-0.0263), py(0.4), px(-0.0263), py(0.2), px(0.0789), py(0.1));
        b.addBezierXY(px(0.1842), py(0.0), px(0.3947), py(0.0), px(0.5), py(0.2));
        b.close();
        return oneCurve(b.createCurve());
    }
}

// ---------------------------------------------------------------- tear

class ShapeTear extends Shape {
    constructor() {
        super();
        this.bend = 0;
        this.tailPosition = 0.5;
        this.ball = { size: 0.25, fixedSize: false };
    }

    static create() { return new ShapeTear(); }

    get shapeType() { return 'Tear'; }

    getCurves(bounds) {
        const cx = bounds.x + bounds.width / 2;
        const cy = bounds.y + bounds.height / 2;
        const rx = bounds.width / 2;
        const ry = bounds.height / 2;

        // Built with the tail at 12 o'clock, then rotated by tailPosition.
        const rot = (this.tailPosition - 0.5) * Math.PI * 2;

        const b = CurveBuilder.create();
        b.beginXY(cx, cy - ry);
        b.addBezierXY(cx, cy - ry, cx + rx, cy - ry * 0.3, cx + rx, cy);
        arcSegments(b, cx, cy, rx, ry, 0, Math.PI);
        b.addBezierXY(cx - rx, cy - ry * 0.3, cx, cy - ry, cx, cy - ry);
        b.close();

        const curve = rotateCurve(b.createCurve(), cx, cy, rot);
        if (this.bend) warnShape('Tear bend is not applied');
        return oneCurve(curve);
    }
}

// ---------------------------------------------------------------- crescent

// Affinity's crescent is two arcs between the same two tips. Each arc interpolates its
// control points between a straight line and a quarter circle: at arc 0 it is the centre
// line, at |arc| = 1 it is the full half-circle.
//
//   top    segment: (0,-1) -> apex(arc,0)
//   bottom segment: apex(arc,0) -> (0,1)
//
// The arcs are clamped so that leftArc <= rightArc; setting one moves the other.
class ShapeCrescent extends Shape {
    constructor() {
        super();
        this._leftArc = -1;
        this._rightArc = -0.3;
    }

    static create() { return new ShapeCrescent(); }

    get shapeType() { return 'Crescent'; }

    get leftArc() { return this._leftArc; }
    get rightArc() { return this._rightArc; }

    set leftArc(value) {
        this._leftArc = Math.min(clamp(value, -1, 1), this._rightArc);
    }

    set rightArc(value) {
        this._rightArc = Math.max(clamp(value, -1, 1), this._leftArc);
    }

    getCurves(bounds) {
        const cx = bounds.x + bounds.width / 2;
        const cy = bounds.y + bounds.height / 2;
        const rx = bounds.width / 2;
        const ry = bounds.height / 2;

        const l = this._leftArc;
        const r = this._rightArc;
        const a = Math.abs(l);
        const b = Math.abs(r);
        const C = QUARTER_K - 1 / 3;   // control-point slope term

        // Normalised helper: map (u,v) to spread coordinates.
        const X = (u) => cx + u * rx;
        const Y = (v) => cy + v * ry;

        const curve = CurveBuilder.create();
        curve.beginXY(X(0), Y(-1));

        // inner arc: tip -> right apex
        curve.addBezierXY(X(QUARTER_K * r), Y((1 - b) / 3 - 1),
                          X(r), Y(-1 / 3 - C * b),
                          X(r), Y(0));
        // inner arc: right apex -> bottom tip
        curve.addBezierXY(X(r), Y(1 / 3 + C * b),
                          X(QUARTER_K * r), Y(1 - (1 - b) / 3),
                          X(0), Y(1));
        // outer arc: bottom tip -> left apex
        curve.addBezierXY(X(QUARTER_K * l), Y(1 - (1 - a) / 3),
                          X(l), Y(1 / 3 + C * a),
                          X(l), Y(0));
        // outer arc: left apex -> top tip
        curve.addBezierXY(X(l), Y(-1 / 3 - C * a),
                          X(QUARTER_K * l), Y((1 - a) / 3 - 1),
                          X(0), Y(-1));

        curve.close();
        return oneCurve(curve.createCurve());
    }
}

// ---------------------------------------------------------------- cog

// Affinity's cog: per tooth a tip arc at radius 1, a straight (or curved) flank down to
// `innerRadius`, a notch arc there, and a flank back up. The hole is a separate circle.
//
// Flank curvature bends the flank by a tangent angle that grows with the flank's angular
// width and shrinks with tooth depth; `curvature` scales it and may be negative.
class ShapeCog extends Shape {
    constructor() {
        super();
        this.teeth = 12;
        this.innerRadius = 0.85;
        this.holeRadius = 0.2;
        this.toothSize = 0.37;
        this.notchSize = 0.42;
        this.curvature = 0;
    }

    static create() { return new ShapeCog(); }

    get shapeType() { return 'Cog'; }

    getCurves(bounds) {
        const cx = bounds.x + bounds.width / 2;
        const cy = bounds.y + bounds.height / 2;
        const rx = bounds.width / 2;
        const ry = bounds.height / 2;

        const n = Math.max(3, Math.trunc(this.teeth));
        const inner = clamp(this.innerRadius, 0.2, 1);
        const hole = clamp(this.holeRadius, 0, 0.85);
        const toothSize = clamp(this.toothSize, 0, 1);
        const notchSize = clamp(this.notchSize, 0, 1);
        const curvature = clamp(this.curvature, -1, 1);

        const step = (Math.PI * 2) / n;
        const tipSpan = toothSize * step;
        const notchSpan = notchSize * step;
        const flankSpan = Math.max(0, (1 - toothSize - notchSize) * step / 2);
        const dev = Math.atan(Math.tan(Math.abs(flankSpan)) / (1 - inner)) * curvature;

        // Flank control points, in normalised space. At curvature 0 this is a line
        // (Affinity emits a degenerate cubic, which lineToXY reproduces).
        const flank = (S, E) => {
            if (Math.abs(dev) < 1e-9) return { c1: S, c2: E };
            const chord = Math.atan2(E[1] - S[1], E[0] - S[0]);
            const dS = [Math.cos(chord - dev), Math.sin(chord - dev)];
            const dE = [Math.cos(chord + dev), Math.sin(chord + dev)];
            const det = dS[0] * (-dE[1]) - dS[1] * (-dE[0]);
            const dx = E[0] - S[0], dy = E[1] - S[1];
            const a = (dx * (-dE[1]) - dy * (-dE[0])) / det;
            const Q = [S[0] + a * dS[0], S[1] + a * dS[1]];
            return {
                c1: [S[0] + (2 / 3) * (Q[0] - S[0]), S[1] + (2 / 3) * (Q[1] - S[1])],
                c2: [E[0] + (2 / 3) * (Q[0] - E[0]), E[1] + (2 / 3) * (Q[1] - E[1])],
            };
        };

        const X = (u) => cx + u * rx;
        const Y = (v) => cy + v * ry;

        const b = CurveBuilder.create();
        const first = -Math.PI / 2 - tipSpan / 2;
        b.beginXY(X(Math.cos(first)), Y(Math.sin(first)));

        for (let k = 0; k < n; k++) {
            const th = -Math.PI / 2 + k * step;
            const a1 = th - tipSpan / 2;
            const a2 = a1 + tipSpan;
            const a3 = a2 + flankSpan;
            const a4 = a3 + notchSpan;
            const a5 = a4 + flankSpan;

            // tooth tip (radius 1)
            arcSegments(b, cx, cy, rx, ry, a1, a2);

            // flank: tip -> notch
            const S = [Math.cos(a2), Math.sin(a2)];
            const E = [inner * Math.cos(a3), inner * Math.sin(a3)];
            const f1 = flank(S, E);
            b.addBezierXY(X(f1.c1[0]), Y(f1.c1[1]), X(f1.c2[0]), Y(f1.c2[1]), X(E[0]), Y(E[1]));

            // notch arc (radius inner)
            arcSegments(b, cx, cy, rx * inner, ry * inner, a3, a4);

            // flank: notch -> next tip
            const S2 = [inner * Math.cos(a4), inner * Math.sin(a4)];
            const E2 = [Math.cos(a5), Math.sin(a5)];
            const f2 = flank(S2, E2);
            b.addBezierXY(X(f2.c1[0]), Y(f2.c1[1]), X(f2.c2[0]), Y(f2.c2[1]), X(E2[0]), Y(E2[1]));
        }
        b.close();

        const pc = PolyCurve.create();
        pc.addCurve(b.createCurve());

        if (hole > 0) {
            const h = CurveBuilder.create();
            h.beginXY(X(0), Y(-hole));
            addArc(h, cx, cy, rx * hole, ry * hole, -Math.PI / 2, Math.PI * 1.5);
            h.close();
            pc.addCurve(h.createCurve());
        }
        return pc;
    }
}

// ---------------------------------------------------------------- spiral

function rotateVector(v, ang) {
    const c = Math.cos(ang), s = Math.sin(ang);
    return [v[0] * c - v[1] * s, v[0] * s + v[1] * c];
}

// Affinity's SegmentedLinear spiral: a chain of tangent arcs whose radii decrease
// linearly. `M` is the fractional arc count (turns plus partTurn times the arcs per
// turn); the radii are R(j) = Mq(Mq-j+1)/(Mq^2-1), with R(1) pinned to 1 and
// Mq = (M+innerRadius)/(1-innerRadius). The last arc is truncated so the spiral covers
// exactly M * segmentAngle.
class ShapeSpiral extends Shape {
    constructor() {
        super();
        this.style = ShapeSpiralStyle.SegmentedLinear;
        this.flip = false;
        this.turns = 5;
        this.partTurn = 0;
        this.decay = 0.5;
        this.segmentAngle = Math.PI / 2;
        this.divisions = 12;
        this.innerRadius = 0;
        this.decayPerSegment = false;
        this.cusped = false;
        this.choke = 0.01;
        this.capChoke = true;
        this.bias = 0;
    }

    static create() { return new ShapeSpiral(); }

    get shapeType() { return 'Spiral'; }

    getCurves(bounds) {
        const cx = bounds.x + bounds.width / 2;
        const cy = bounds.y + bounds.height / 2;
        const rx = bounds.width / 2;
        const ry = bounds.height / 2;

        const styleName = this.style && (this.style.name || this.style.value);
        if (styleName && styleName !== 'SegmentedLinear') {
            warnShape('Spiral style "' + styleName + '" is not implemented (drawn as SegmentedLinear)');
        }

        const turns = clamp(Math.trunc(this.turns), 0, 400);
        const partTurn = clamp(this.partTurn, 0, 1);
        let segmentAngle = Math.abs(this.segmentAngle);
        if (!(segmentAngle > 1e-6)) segmentAngle = Math.PI / 2;

        let halvings = 0;
        let sub = segmentAngle;
        while (sub > Math.PI / 2 + 1e-9) { sub /= 2; halvings++; }

        const perTurn = (Math.PI * 2) / segmentAngle;
        const M = (turns + partTurn) * perTurn;
        const inner = clamp(this.innerRadius, 0, 1);

        const empty = CurveBuilder.create().createCurve();
        if (!(M > 1e-9) || !isFinite(M)) return oneCurve(empty);

        const Mq = (M + inner) / (1 - inner);
        const C = Mq / (Mq * Mq - 1);
        const N = Math.max(1, Math.ceil(M - 1e-9));
        const R = [];
        for (let j = 1; j <= N; j++) R.push(j === 1 ? 1 : C * (Mq - j + 1));

        const total = M * segmentAngle;
        const segs = [];
        let ccx = 0, ccy = 0, rv = [1, 0], swept = 0;

        for (let j = 0; j < N; j++) {
            const r = R[j];
            const segSpan = Math.min(segmentAngle, total - swept);
            let nsub, span;
            if (segSpan >= segmentAngle - 1e-9) {
                nsub = Math.pow(2, halvings);
                span = segmentAngle / nsub;
            } else {
                nsub = Math.max(1, Math.ceil(segSpan / (Math.PI / 2) - 1e-9));
                span = segSpan / nsub;
            }

            for (let s2 = 0; s2 < nsub; s2++) {
                swept += span;
                const len = Math.hypot(rv[0], rv[1]);
                const vS = [(rv[0] / len) * r, (rv[1] / len) * r];
                const vE = rotateVector(vS, -span);
                const start = [ccx + vS[0], ccy + vS[1]];
                const end = [ccx + vE[0], ccy + vE[1]];
                const k = arcK(span);
                const t1 = [vS[1], -vS[0]];
                const t2 = [vE[1], -vE[0]];
                segs.push({
                    start,
                    c1: [start[0] + k * t1[0], start[1] + k * t1[1]],
                    c2: [end[0] - k * t2[0], end[1] - k * t2[1]],
                    end,
                });
                rv = vE;
            }

            if (j < N - 1) {
                const d = R[j] - R[j + 1];
                const len = Math.hypot(rv[0], rv[1]);
                ccx += (rv[0] / len) * d;
                ccy += (rv[1] / len) * d;
            }
        }

        const flip = !!this.flip;
        const Y = (v) => cy + (flip ? -v : v) * ry;
        const b = CurveBuilder.create();
        b.beginXY(cx + segs[0].start[0] * rx, Y(segs[0].start[1]));
        for (const s of segs) {
            b.addBezierXY(cx + s.c1[0] * rx, Y(s.c1[1]),
                          cx + s.c2[0] * rx, Y(s.c2[1]),
                          cx + s.end[0] * rx, Y(s.end[1]));
        }
        return oneCurve(b.createCurve());
    }
}

// ---------------------------------------------------------------- callouts

const CORNER_NAMES = {
    TopLeft: 0, TopRight: 1, BottomRight: 2, BottomLeft: 3,
    topleft: 0, topright: 1, bottomright: 2, bottomleft: 3,
};

function cornerIndex(index) {
    if (typeof index === 'number') return clamp(Math.trunc(index), 0, 3);
    const name = (index && (index.name || index.value)) || '';
    return CORNER_NAMES[name] != null ? CORNER_NAMES[name] : 0;
}

// Affinity's rounded-rectangle callout: a rounded rectangle whose height is
// h*(1-tail.height), plus a triangular tail whose base is centred on `startPosition`
// (width wide) and whose tip sits at `endPosition` on the bottom edge.
class ShapeCalloutRectangle extends Shape {
    constructor() {
        super();
        this.absoluteSizes = false;
        this.useSingleRadius = true;
        this.radii = [0.25, 0.25, 0.25, 0.25];   // TopLeft, TopRight, BottomRight, BottomLeft
        this.tail = { startPosition: 0.4, endPosition: 0.2, width: 0.15, height: 0.3 };
    }

    static create() { return new ShapeCalloutRectangle(); }

    get shapeType() { return 'CalloutRectangle'; }

    getCornerRadius(index) {
        return this.radii[cornerIndex(index)];
    }

    setCornerRadius(index, radius) {
        this.radii[cornerIndex(index)] = radius;
    }

    setAbsoluteSizes(value) {
        this.absoluteSizes = value;
    }

    getCurves(bounds) {
        const { x, y, width: w, height: h } = bounds;
        const tail = this.tail || {};
        const tailHeight = tail.height != null ? tail.height : 0.3;
        const mainH = h * (1 - tailHeight);
        const minDim = Math.min(w, mainH);

        const fracs = this.useSingleRadius
            ? [this.radii[0], this.radii[0], this.radii[0], this.radii[0]]
            : this.radii;
        const rp = fracs.map((f) => {
            const px = this.absoluteSizes ? f : f * minDim;
            return clamp(px, 0, minDim / 2);
        });
        const TL = rp[0], TR = rp[1], BR = rp[2], BL = rp[3];

        const x0 = x, x1 = x + w, y0 = y, y1 = y + mainH;
        const startPos = tail.startPosition != null ? tail.startPosition : 0.4;
        const endPos = tail.endPosition != null ? tail.endPosition : 0.2;
        const tailWidth = tail.width != null ? tail.width : 0.15;
        const half = (tailWidth * w) / 2;
        // The tail base must fit between the bottom corners; when a corner radius eats
        // into it, Affinity slides the base along the edge rather than shrinking it.
        const baseCx = clamp(x + startPos * w, x0 + BL + half, x1 - BR - half);
        const tipX = x + endPos * w;
        const tipY = y + h;

        const b = CurveBuilder.create();
        b.beginXY(x1, y0 + TR);
        // Affinity drops a zero-length leading segment (happens when the corner radii
        // consume the whole right edge); later degenerate segments are kept.
        if (Math.abs(y0 + TR - (y1 - BR)) > 1e-9) b.lineToXY(x1, y1 - BR);
        addArc(b, x1 - BR, y1 - BR, BR, BR, 0, Math.PI / 2);
        b.lineToXY(baseCx + half, y1);
        b.lineToXY(tipX, tipY);
        b.lineToXY(baseCx - half, y1);
        b.lineToXY(x0 + BL, y1);
        addArc(b, x0 + BL, y1 - BL, BL, BL, Math.PI / 2, Math.PI);
        b.lineToXY(x0, y0 + TL);
        addArc(b, x0 + TL, y0 + TL, TL, TL, Math.PI, Math.PI * 1.5);
        b.lineToXY(x1 - TR, y0);
        addArc(b, x1 - TR, y0 + TR, TR, TR, -Math.PI / 2, 0);
        b.close();
        return oneCurve(b.createCurve());
    }
}

// Affinity's ellipse callout: an ellipse of height h*(1-tail.height), plus a triangular
// tail whose base is the ellipse arc centred on the direction towards the tip, spanning
// `angle`. If the angle would reach past the tangent points from the tip, it is clamped
// to them.
class ShapeCalloutEllipse extends Shape {
    constructor() {
        super();
        this.absoluteSizes = false;
        this.tail = { angle: 0.3490658402442932, endPosition: 0.15, height: 0.2 };
    }

    static create() { return new ShapeCalloutEllipse(); }

    get shapeType() { return 'CalloutEllipse'; }

    setAbsoluteSizes(value) {
        this.absoluteSizes = value;
    }

    getCurves(bounds) {
        const { x, y, width: w, height: h } = bounds;
        const tail = this.tail || {};
        const tailHeight = clamp(tail.height != null ? tail.height : 0.2, 0, 0.999);
        const rx = w / 2;
        const ry = (h * (1 - tailHeight)) / 2;
        const cx = x + w / 2;
        const cy = y + ry;

        const endPos = tail.endPosition != null ? tail.endPosition : 0.15;
        const tipX = x + endPos * w;
        const tipY = y + h;

        // Tail direction, measured in the ellipse's unit circle.
        const tx = (tipX - cx) / rx;
        const ty = (tipY - cy) / ry;
        const dist = Math.hypot(tx, ty);
        let thc = Math.atan2(ty, tx);
        thc = ((thc % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

        // The tail cannot be wider than the tangent points from the tip.
        const halfMax = Math.acos(clamp(1 / dist, -1, 1));
        const angle = Math.abs(tail.angle != null ? tail.angle : Math.PI / 9);
        const half = Math.min(angle / 2, halfMax);
        const a1 = thc - half;
        const a2 = thc + half;

        const b = CurveBuilder.create();
        b.beginXY(cx + rx, cy);
        addArc(b, cx, cy, rx, ry, 0, a1);
        b.lineToXY(tipX, tipY);
        b.lineToXY(cx + rx * Math.cos(a2), cy + ry * Math.sin(a2));
        addArc(b, cx, cy, rx, ry, a2, Math.PI * 2);
        b.close();
        return oneCurve(b.createCurve());
    }
}

// ---------------------------------------------------------------- QR code / cat placeholders

class ShapeQRCode extends Shape {
    constructor() {
        super();
        this.payload = null;
    }

    static create() { return new ShapeQRCode(); }

    get shapeType() { return 'QRCode'; }

    getCurves(bounds) {
        warnShape('QRCode renders as its bounding rectangle (module pattern not generated)');
        return oneCurve(rectangleCurve(bounds));
    }
}

// The Cat shapes are fixed silhouettes baked into Affinity; there is no formula for
// them, so they render as an ellipse placeholder and raise a warning.
function makeCatShape(name) {
    return class extends Shape {
        static create() { return new this(); }
        get shapeType() { return name; }
        getCurves(bounds) {
            warnShape(name + ' renders as an ellipse (silhouette not reproduced)');
            return new ShapeEllipse().getCurves(bounds);
        }
    };
}

const ShapeCat = makeCatShape('Cat');
const ShapeCat2 = makeCatShape('Cat2');
const ShapeCat3 = makeCatShape('Cat3');
const ShapeCat4 = makeCatShape('Cat4');

const SHAPE_BY_TYPE = {
    Rectangle: ShapeRectangle,
    Ellipse: ShapeEllipse,
    Triangle: ShapeTriangle,
    Diamond: ShapeDiamond,
    Trapezoid: ShapeTrapezoid,
    Polygon: ShapePolygon,
    Star: ShapeStar,
    DoubleStar: ShapeDoubleStar,
    Arrow: ShapeArrow,
    Pie: ShapePie,
    Cog: ShapeCog,
    Cloud: ShapeCloud,
    CalloutRectangle: ShapeCalloutRectangle,
    CalloutEllipse: ShapeCalloutEllipse,
    Crescent: ShapeCrescent,
    Segment: ShapeSegment,
    SquareStar: ShapeSquareStar,
    Tear: ShapeTear,
    Heart: ShapeHeart,
    Cat: ShapeCat,
    Cat2: ShapeCat2,
    Cat3: ShapeCat3,
    Cat4: ShapeCat4,
    QRCode: ShapeQRCode,
    Spiral: ShapeSpiral,
};

// Exactly what `/shapes.js` exposes to a drawing script.
const sdkSurface = {
    Shape,
    ShapeArrow,
    ShapeArrowEndStyle,
    ShapeCalloutEllipse,
    ShapeCalloutRectangle,
    ShapeCat,
    ShapeCat2,
    ShapeCat3,
    ShapeCat4,
    ShapeCloud,
    ShapeCog,
    ShapeCrescent,
    ShapeDiamond,
    ShapeDoubleStar,
    ShapeEllipse,
    ShapeHeart,
    ShapePie,
    ShapePolygon,
    ShapeQRCode,
    ShapeRectangle,
    ShapeSegment,
    ShapeSpiral,
    ShapeSpiralStyle,
    ShapeSquareStar,
    ShapeStar,
    ShapeTear,
    ShapeTrapezoid,
    ShapeTriangle,
    ShapeCornerIndex,
    ShapeCornerType,
    ShapeType,
};

module.exports = {
    ...sdkSurface,
    sdkSurface,
    // helpers, used by the other shim modules and the tests
    arcSegments,
    addArc,
    oneCurve,
    rotateCurve,
    SHAPE_BY_TYPE,
};
