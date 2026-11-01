'use strict';

// Shape geometry. Each shape implements getCurves(bounds) -> PolyCurve, mirroring the
// SDK's ShapeApi.getCurves. Shapes marked "approximated" below render a plausible
// outline and raise a warning through ../warnings.js.
//
// Geometry was checked against Affinity's own output for the same bounds: Polygon,
// Star, Triangle, Diamond, Trapezoid, Heart and Tear match exactly; Ellipse, Pie and
// Segment differ only in bezier fitting; the rest are approximations.

const { CurveBuilder, Curve, PolyCurve, rectangleCurve } = require('./geometry.js');
const { ShapeCornerType, ShapeType } = require('./enums.js');
const warnings = require('./warnings.js');

const warnShape = warnings.warn;

// Elliptical arc split into <=90deg beziers.
function arcSegments(b, cx, cy, rx, ry, a1, a2) {
    const total = a2 - a1;
    const steps = Math.max(1, Math.ceil(Math.abs(total) / (Math.PI / 2)));
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

class ShapeSquareStar extends Shape {
    constructor() {
        super();
        this.sides = 5;
        this.cutout = 0.5;
    }

    static create() { return new ShapeSquareStar(); }

    get shapeType() { return 'SquareStar'; }

    getCurves(bounds) {
        // Approximation: Affinity draws each point as a square-cut spike (4 vertices per
        // point). This emits a plain star using `cutout` as the inner radius.
        warnShape('SquareStar is approximated as a plain star (square-cut points not reproduced)');
        return new ShapeStar().getCurvesWith(bounds, Math.round(this.sides), this.cutout);
    }
}

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
        // Approximation: emits a 2n-point star. `pointRadius` is not applied.
        warnShape('DoubleStar is approximated as a 2n-point star (pointRadius not applied)');
        return new ShapeStar().getCurvesWith(bounds, Math.round(this.points) * 2, this.innerRadius);
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
        // Affinity's cloud is n bubbles, each a 180deg arc around a centre sitting
        // rb*cos(PI/n) along that bubble's apex direction, with radius rb*sin(PI/n).
        // Consecutive arcs meet at the valleys (radius rb), so each apex reaches
        // exactly the bounding radius: rb*(cos(PI/n) + sin(PI/n)) = 1.
        //
        // This reproduces Affinity's control points exactly, which a plain cosine
        // radius wave does not - that reads as a starburst rather than bubbles.
        const cx = bounds.x + bounds.width / 2;
        const cy = bounds.y + bounds.height / 2;
        const rx = bounds.width / 2;
        const ry = bounds.height / 2;
        const n = Math.max(3, Math.round(this.bubbles));
        const rb = Math.min(1, Math.max(0.05, this.innerRadius));
        const cosStep = Math.cos(Math.PI / n);
        const sinStep = Math.sin(Math.PI / n);
        const arcRx = rx * rb * sinStep;
        const arcRy = ry * rb * sinStep;

        const b = CurveBuilder.create();
        b.beginXY(cx, cy - ry);                 // apex of bubble 0

        for (let i = 0; i < n; i++) {
            const th = -Math.PI / 2 + (i * Math.PI * 2) / n;
            const ccx = cx + rx * rb * cosStep * Math.cos(th);
            const ccy = cy + ry * rb * cosStep * Math.sin(th);
            arcSegments(b, ccx, ccy, arcRx, arcRy, th, th + Math.PI / 2);   // apex -> valley

            const tn = th + (Math.PI * 2) / n;
            const ncx = cx + rx * rb * cosStep * Math.cos(tn);
            const ncy = cy + ry * rb * cosStep * Math.sin(tn);
            arcSegments(b, ncx, ncy, arcRx, arcRy, tn - Math.PI / 2, tn);   // valley -> next apex
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

class ShapeArrow extends Shape {
    constructor() {
        super();
        this.thickness = 0.35;
        this.leftEnd = { style: { name: 'Arrow' }, length: 0.35, innerOffset: 0, isProportional: true };
        this.rightEnd = { style: { name: 'Arrow' }, length: 0.35, innerOffset: 0, isProportional: true };
    }

    static create() { return new ShapeArrow(); }

    get shapeType() { return 'Arrow'; }

    getCurves(bounds) {
        // Approximation: a horizontal double-headed arrow. Affinity's default arrow
        // outline (both ends styled) is not reproduced exactly.
        warnShape('Arrow is approximated as a horizontal double-headed arrow');
        const { x, y, width: w, height: h } = bounds;
        const t = Math.min(0.95, Math.max(0.02, this.thickness));
        const half = (h * t) / 2;
        const head = w * 0.35;
        const cy = y + h / 2;
        const b = CurveBuilder.create();
        b.beginXY(x, cy);
        b.lineToXY(x + head, cy - half);
        b.lineToXY(x + w - head, cy - half);
        b.lineToXY(x + w, cy);
        b.lineToXY(x + w - head, cy + half);
        b.lineToXY(x + head, cy + half);
        b.close();
        return oneCurve(b.createCurve());
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

class ShapeCrescent extends Shape {
    constructor() {
        super();
        this.leftArc = -1;
        this.rightArc = -0.3;
    }

    static create() { return new ShapeCrescent(); }

    get shapeType() { return 'Crescent'; }

    getCurves(bounds) {
        // Approximation: outer half-ellipse on the left, inner curve bulging left by
        // |rightArc|. leftArc is not applied.
        warnShape('Crescent is approximated (leftArc not applied)');
        const cx = bounds.x + bounds.width / 2;
        const cy = bounds.y + bounds.height / 2;
        const rx = bounds.width / 2;
        const ry = bounds.height / 2;
        const bulge = Math.min(1, Math.max(0, -this.rightArc));

        const b = CurveBuilder.create();
        b.beginXY(cx, cy - ry);
        b.addBezierXY(cx - rx * bulge * 0.55, cy - ry * 0.77,
                      cx - rx * bulge, cy - ry * 0.4,
                      cx - rx * bulge, cy);
        b.addBezierXY(cx - rx * bulge, cy + ry * 0.4,
                      cx - rx * bulge * 0.55, cy + ry * 0.77,
                      cx, cy + ry);
        arcSegments(b, cx, cy, rx, ry, Math.PI / 2, Math.PI * 1.5);
        b.close();
        return oneCurve(b.createCurve());
    }
}

// ---------------------------------------------------------------- cog

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
        warnShape('Cog is approximated (tooth/notch sizes and curvature not applied)');
        const cx = bounds.x + bounds.width / 2;
        const cy = bounds.y + bounds.height / 2;
        const rx = bounds.width / 2;
        const ry = bounds.height / 2;
        const n = Math.max(3, Math.round(this.teeth));
        const inner = Math.min(1, Math.max(0.05, this.innerRadius));

        const pc = PolyCurve.create();

        const outer = CurveBuilder.create();
        for (let i = 0; i < n * 2; i++) {
            const a = -Math.PI / 2 + (i * Math.PI) / n;
            const f = (i % 2 === 0) ? 1 : inner;
            const px = cx + rx * f * Math.cos(a);
            const py = cy + ry * f * Math.sin(a);
            if (i === 0) outer.beginXY(px, py); else outer.lineToXY(px, py);
        }
        outer.close();
        pc.addCurve(outer.createCurve());

        const hole = Math.min(1, Math.max(0, this.holeRadius));
        if (hole > 0) {
            const hrx = rx * hole;
            const hry = ry * hole;
            const h = CurveBuilder.create();
            h.beginXY(cx + hrx, cy);
            arcSegments(h, cx, cy, hrx, hry, 0, Math.PI * 2);
            h.close();
            pc.addCurve(h.createCurve());
        }
        return pc;
    }
}

// ---------------------------------------------------------------- spiral

class ShapeSpiral extends Shape {
    constructor() {
        super();
        this.turns = 5;
        this.decay = 0.5;
        this.divisions = 12;
        this.innerRadius = 0;
        this.style = { name: 'SegmentedLinear' };
    }

    static create() { return new ShapeSpiral(); }

    get shapeType() { return 'Spiral'; }

    getCurves(bounds) {
        warnShape('Spiral is approximated (decay/style not applied)');
        const cx = bounds.x + bounds.width / 2;
        const cy = bounds.y + bounds.height / 2;
        const rx = bounds.width / 2;
        const ry = bounds.height / 2;
        const turns = Math.max(1, this.turns);
        const divisions = Math.max(3, Math.round(this.divisions));
        const total = Math.round(turns * divisions);

        const b = CurveBuilder.create();
        for (let i = 0; i <= total; i++) {
            const a = (i * Math.PI * 2) / divisions;
            const f = 1 - i / total;
            const px = cx + rx * f * Math.cos(a);
            const py = cy + ry * f * Math.sin(a);
            if (i === 0) b.beginXY(px, py); else b.lineToXY(px, py);
        }
        return oneCurve(b.createCurve());
    }
}

// ---------------------------------------------------------------- callouts

class ShapeCalloutRectangle extends Shape {
    constructor() {
        super();
        this.useSingleRadius = false;
        this.radii = [0, 0, 0, 0];
        this.tail = { startPosition: 0.25, endPosition: 0.0, width: 0.25, height: 0.25 };
    }

    static create() { return new ShapeCalloutRectangle(); }

    get shapeType() { return 'CalloutRectangle'; }

    setCornerRadius(index, radius) { this.radii[index] = radius; }

    getCurves(bounds) {
        // Approximation: rectangle plus a triangular tail on the bottom edge.
        warnShape('CalloutRectangle is approximated (tail geometry not reproduced)');
        const { x, y, width: w, height: h } = bounds;
        const b = CurveBuilder.create();
        b.beginXY(x, y);
        b.lineToXY(x + w, y);
        b.lineToXY(x + w, y + h);
        b.lineToXY(x + w * 0.35, y + h);
        b.lineToXY(x + w * 0.1, y + h + h * 0.25);
        b.lineToXY(x + w * 0.2, y + h);
        b.lineToXY(x, y + h);
        b.close();
        return oneCurve(b.createCurve());
    }
}

class ShapeCalloutEllipse extends Shape {
    constructor() {
        super();
        this.tail = { angle: 0, endPosition: 0.0, height: 0.25 };
    }

    static create() { return new ShapeCalloutEllipse(); }

    get shapeType() { return 'CalloutEllipse'; }

    getCurves(bounds) {
        // Approximation: ellipse plus a triangular tail on the bottom edge.
        warnShape('CalloutEllipse is approximated (tail geometry not reproduced)');
        const cx = bounds.x + bounds.width / 2;
        const cy = bounds.y + bounds.height / 2;
        const rx = bounds.width / 2;
        const ry = bounds.height / 2;
        const b = CurveBuilder.create();
        b.beginXY(cx + rx, cy);
        arcSegments(b, cx, cy, rx, ry, 0, Math.PI);
        b.lineToXY(cx - rx * 0.15, cy + ry + ry * 0.25);
        b.lineToXY(cx - rx * 0.35, cy + ry);
        arcSegments(b, cx, cy, rx, ry, Math.PI, Math.PI * 2);
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

function makeCatShape(name) {
    return class extends Shape {
        static create() { return new this(); }
        get shapeType() { return name; }
        getCurves(bounds) {
            warnShape(name + ' renders as an ellipse (not reproduced)');
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
    ShapeSquareStar,
    ShapeStar,
    ShapeTear,
    ShapeTrapezoid,
    ShapeTriangle,
    ShapeCornerType,
    ShapeType,
};

module.exports = {
    ...sdkSurface,
    sdkSurface,
    // helpers, used by the other shim modules and the tests
    arcSegments,
    oneCurve,
    rotateCurve,
    SHAPE_BY_TYPE,
};
