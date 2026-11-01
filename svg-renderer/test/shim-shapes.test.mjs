// Shape geometry tests. The golden block compares the shim's curves with reference
// geometry captured from Affinity for the same bounds (test/shapes-reference.json);
// everything else asserts structure and parameter behaviour.
//
// Run from svg-renderer/ with:  node --test test/*.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

const { Rectangle } = require("../shim/geometry.js");
const shapes = require("../shim/shapes.js");
const { ShapeArrowEndStyle, ShapeCornerType, ShapeSpiralStyle } = require("../shim/enums.js");
const warnings = require("../shim/warnings.js");

const { SHAPE_BY_TYPE, Shape } = shapes;

const reference = JSON.parse(fs.readFileSync(path.join(here, "shapes-reference.json"), "utf8"));

const SQUARE = new Rectangle(0, 0, 110, 110);

/** Builds a shim shape from a reference case's params. */
function buildShape(c) {
  const s = SHAPE_BY_TYPE[c.type].create();
  const p = c.params;
  const [x, y, w, h] = c.bounds;
  switch (c.type) {
    case "SquareStar":
      s.sides = p.sides; s.cutout = p.cutout; break;
    case "DoubleStar":
      s.points = p.points; s.innerRadius = p.innerRadius; s.pointRadius = p.pointRadius; break;
    case "Cog":
      s.teeth = p.teeth; s.innerRadius = p.innerRadius; s.holeRadius = p.holeRadius;
      s.toothSize = p.toothSize; s.notchSize = p.notchSize; s.curvature = p.curvature; break;
    case "Crescent":
      s.leftArc = p.leftArc; s.rightArc = p.rightArc; break;
    case "Spiral":
      s.turns = p.turns; s.innerRadius = p.innerRadius;
      s.segmentAngle = p.segmentAngle * Math.PI / 180;
      s.partTurn = p.partTurn; s.flip = p.flip; break;
    case "CalloutRectangle":
      s.tail.startPosition = p.startPosition; s.tail.endPosition = p.endPosition;
      s.tail.width = p.width; s.tail.height = p.height;
      if (p.radiusIndex != null) {
        if (p.useSingleRadius != null) s.useSingleRadius = p.useSingleRadius;
        s.setCornerRadius(p.radiusIndex, p.radius, w, h);
      }
      break;
    case "CalloutEllipse":
      s.tail.angle = p.angle; s.tail.endPosition = p.endPosition; s.tail.height = p.height; break;
    case "Arrow":
      s.thickness = p.thickness;
      s.leftEnd.style = ShapeArrowEndStyle[p.leftStyle];
      s.rightEnd.style = ShapeArrowEndStyle[p.rightStyle];
      s.leftEnd.setLength(p.leftLength, w, h); s.rightEnd.setLength(p.rightLength, w, h);
      s.leftEnd.setInnerOffset(p.leftInnerOffset, w, h);
      s.rightEnd.setInnerOffset(p.rightInnerOffset, w, h);
      break;
    default: break;
  }
  return { shape: s, bounds: new Rectangle(x, y, w, h) };
}

function allPoints(pc) {
  const out = [];
  for (let i = 0; i < pc.curveCount; i++) {
    for (const bz of pc.at(i).beziers) {
      out.push(bz.start, bz.c1, bz.c2, bz.end);
    }
  }
  return out;
}

function boundsOf(pc) {
  const pts = allPoints(pc);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

// ------------------------------------------------------------------ dispatch

test("Shape.create dispatches on ShapeType name and rejects unknown types", () => {
  const star = Shape.create(shapes.sdkSurface.ShapeType.SquareStar);
  assert.equal(star.constructor.name, "ShapeSquareStar");
  assert.equal(star.shapeType, "SquareStar");

  // Plain strings work too.
  assert.equal(Shape.create("Cog").shapeType, "Cog");
  assert.throws(() => Shape.create("Nope"), /Unknown shape type: Nope/);
});

test("the base Shape refuses to generate geometry", () => {
  assert.throws(() => new Shape().getCurves(SQUARE), /does not implement geometry/);
});

test("every shape reports its shapeType", () => {
  const expected = {
    Rectangle: "Rectangle", Ellipse: "Ellipse", Triangle: "Triangle", Diamond: "Diamond",
    Trapezoid: "Trapezoid", Polygon: "Polygon", Star: "Star", DoubleStar: "DoubleStar",
    Arrow: "Arrow", Pie: "Pie", Cog: "Cog", Cloud: "Cloud", CalloutRectangle: "CalloutRectangle",
    CalloutEllipse: "CalloutEllipse", Crescent: "Crescent", Segment: "Segment",
    SquareStar: "SquareStar", Tear: "Tear", Heart: "Heart", Cat: "Cat", Cat2: "Cat2",
    Cat3: "Cat3", Cat4: "Cat4", QRCode: "QRCode", Spiral: "Spiral",
  };
  for (const [name, type] of Object.entries(expected)) {
    assert.equal(SHAPE_BY_TYPE[name].create().shapeType, type, name);
  }
});

// ------------------------------------------------------------------ golden reference

test("shape geometry matches Affinity's output within a pixel", () => {
  const failures = [];
  for (const [id, c] of Object.entries(reference)) {
    const { shape, bounds } = buildShape(c);
    warnings.reset();
    const pc = shape.getCurves(bounds);

    if (pc.curveCount !== c.curves.length) {
      failures.push(`${id}: curve count ${pc.curveCount} != ${c.curves.length}`);
      continue;
    }
    for (let ci = 0; ci < pc.curveCount; ci++) {
      const curve = pc.at(ci);
      const rc = c.curves[ci];
      if (curve.isClosed !== rc.closed) {
        failures.push(`${id}: curve ${ci} closed mismatch`);
        break;
      }
      if (curve.beziers.length !== rc.segs.length) {
        failures.push(`${id}: curve ${ci} segment count ${curve.beziers.length} != ${rc.segs.length}`);
        break;
      }
      for (let i = 0; i < curve.beziers.length; i++) {
        const bz = curve.beziers[i];
        const vals = [bz.start.x, bz.start.y, bz.c1.x, bz.c1.y, bz.c2.x, bz.c2.y, bz.end.x, bz.end.y];
        const rs = rc.segs[i];
        for (let k = 0; k < 8; k++) {
          const err = Math.abs(vals[k] - rs[k]);
          if (err >= 1) {
            failures.push(`${id}: curve ${ci} seg ${i} coord ${k} off by ${err.toFixed(3)}px`);
          }
        }
      }
    }
  }
  assert.deepEqual(failures, [], failures.join("\n"));
});

test("every golden case stays inside (or within 1px of) its bounds", () => {
  for (const [id, c] of Object.entries(reference)) {
    const { shape, bounds } = buildShape(c);
    const pc = shape.getCurves(bounds);
    const bb = boundsOf(pc);
    const tol = 1;
    assert.ok(bb.x0 >= bounds.x - tol, `${id}: left ${bb.x0} < ${bounds.x - tol}`);
    assert.ok(bb.x1 <= bounds.x + bounds.width + tol, `${id}: right ${bb.x1} > ${bounds.x + bounds.width + tol}`);
    assert.ok(bb.y0 >= bounds.y - tol, `${id}: top ${bb.y0} < ${bounds.y - tol}`);
    assert.ok(bb.y1 <= bounds.y + bounds.height + tol, `${id}: bottom ${bb.y1} > ${bounds.y + bounds.height + tol}`);
  }
});

// ------------------------------------------------------------------ individual shapes

test("ShapeRectangle: plain, rounded and corner-type gating", () => {
  const plain = SHAPE_BY_TYPE.Rectangle.create().getCurves(SQUARE);
  assert.equal(plain.curveCount, 1);
  assert.equal(plain.at(0).isClosed, true);
  assert.equal(plain.at(0).beziers.length, 4);

  const rounded = SHAPE_BY_TYPE.Rectangle.create();
  for (const corner of [rounded.topLeft, rounded.topRight, rounded.bottomLeft, rounded.bottomRight]) {
    corner.cornerType = ShapeCornerType.Round;
    corner.setRadius(0.2, 110, 110);
  }
  const rpc = rounded.getCurves(SQUARE);
  assert.equal(rpc.at(0).beziers.length, 8, "four sides + four quarter arcs");
  const bb = boundsOf(rpc);
  assert.ok(Math.abs(bb.x0 - 0) < 1e-6, "left edge");
  assert.ok(Math.abs(bb.x1 - 110) < 1e-6, "right edge");
  assert.ok(Math.abs(bb.y0 - 0) < 1e-6, "top edge");
  assert.ok(Math.abs(bb.y1 - 110) < 1e-6, "bottom edge");

  // A radius with cornerType left at None is ignored (Affinity behaves the same).
  const ignored = SHAPE_BY_TYPE.Rectangle.create();
  ignored.topLeft.setRadius(0.4, 110, 110);
  assert.equal(ignored.getCurves(SQUARE).at(0).beziers.length, 4);
});

test("ShapeEllipse fills the bounds with four arcs", () => {
  const pc = SHAPE_BY_TYPE.Ellipse.create().getCurves(new Rectangle(100, 200, 60, 40));
  assert.equal(pc.curveCount, 1);
  assert.equal(pc.at(0).beziers.length, 4);
  const bb = boundsOf(pc);
  assert.ok(Math.abs(bb.x0 - 100) < 0.5);
  assert.ok(Math.abs(bb.x1 - 160) < 0.5);
  assert.ok(Math.abs(bb.y0 - 200) < 0.5);
  assert.ok(Math.abs(bb.y1 - 240) < 0.5);
});

test("ShapePolygon and ShapeStar vertex counts follow their parameters", () => {
  const poly = SHAPE_BY_TYPE.Polygon.create();
  assert.equal(poly.getCurves(SQUARE).at(0).beziers.length, 5);
  poly.sides = 8;
  assert.equal(poly.getCurves(SQUARE).at(0).beziers.length, 8);

  const star = SHAPE_BY_TYPE.Star.create();
  assert.equal(star.getCurves(SQUARE).at(0).beziers.length, 10, "5 points -> 10 vertices");
  star.points = 7;
  assert.equal(star.getCurves(SQUARE).at(0).beziers.length, 14);
});

test("ShapeSquareStar: 3 vertices per point, collapsing degenerate spikes", () => {
  const s = SHAPE_BY_TYPE.SquareStar.create();
  assert.equal(s.getCurves(SQUARE).at(0).beziers.length, 15, "5 points x 3 vertices");

  s.cutout = 0;
  assert.equal(s.getCurves(SQUARE).at(0).beziers.length, 5, "cutout 0 -> plain pentagon");

  s.cutout = 1;
  assert.equal(s.getCurves(SQUARE).at(0).beziers.length, 10, "cutout 1 -> paired corners");

  s.cutout = 0.5;
  s.sides = 4;
  assert.equal(s.getCurves(SQUARE).at(0).beziers.length, 12);
});

test("ShapeDoubleStar: four vertices per point", () => {
  const s = SHAPE_BY_TYPE.DoubleStar.create();
  assert.equal(s.getCurves(SQUARE).at(0).beziers.length, 20, "5 points x 4 vertices");
  s.points = 2;
  assert.equal(s.getCurves(SQUARE).at(0).beziers.length, 8);
});

test("ShapeCloud: two arcs per bubble", () => {
  const c = SHAPE_BY_TYPE.Cloud.create();
  assert.equal(c.getCurves(SQUARE).at(0).beziers.length, 24);

  // The canonical inner radius fills the bounds: 1 / (cos(PI/n) + sin(PI/n)).
  c.bubbles = 6;
  c.innerRadius = 1 / (Math.cos(Math.PI / 6) + Math.sin(Math.PI / 6));
  assert.equal(c.getCurves(SQUARE).at(0).beziers.length, 12);
  const bb = boundsOf(c.getCurves(SQUARE));
  assert.ok(Math.abs(bb.y0 - 0) < 1e-6, "apex reaches the top edge");
  assert.ok(Math.abs(bb.y1 - 110) < 1e-6, "apex reaches the bottom edge");

  c.bubbles = 20;
  c.innerRadius = 1 / (Math.cos(Math.PI / 20) + Math.sin(Math.PI / 20));
  assert.equal(c.getCurves(SQUARE).at(0).beziers.length, 40);
});

test("ShapeTriangle / Diamond / Trapezoid vertex counts and position handling", () => {
  const t = SHAPE_BY_TYPE.Triangle.create();
  const tpc = t.getCurves(SQUARE);
  assert.equal(tpc.at(0).beziers.length, 3);
  assert.equal(tpc.at(0).beziers[0].start.x, 55, "apex centred by default");
  t.position = 0.25;
  assert.equal(t.getCurves(SQUARE).at(0).beziers[0].start.x, 27.5);

  const d = SHAPE_BY_TYPE.Diamond.create();
  assert.equal(d.getCurves(SQUARE).at(0).beziers.length, 4);
  d.position = 0.25;
  const dBz = d.getCurves(SQUARE).at(0).beziers;
  assert.equal(dBz[0].end.y, 27.5, "right vertex moves up");

  const tr = SHAPE_BY_TYPE.Trapezoid.create();
  const trBz = tr.getCurves(SQUARE).at(0).beziers;
  assert.equal(trBz.length, 4);
  assert.equal(trBz[0].start.x, 82.5, "default right 0.75");
  assert.equal(trBz[3].start.x, 27.5, "default left 0.25");
});

test("ShapeArrow: heads, shaft thickness, length and inner offset", () => {
  const arrow = SHAPE_BY_TYPE.Arrow.create();
  const pc = arrow.getCurves(SQUARE);
  assert.equal(pc.curveCount, 1);
  assert.equal(pc.at(0).isClosed, true);
  // Both heads meet at the centre, leaving a zero-length shaft segment (kept).
  assert.equal(pc.at(0).beziers.length, 9);
  const pts = allPoints(pc);
  const ys = pts.map((p) => p.y);
  assert.equal(Math.min(...ys), 0);
  assert.equal(Math.max(...ys), 110);
  // Shaft half-height = thickness * height / 2.
  assert.ok(pts.some((p) => Math.abs(p.y - (55 - 19.25)) < 1e-6));

  arrow.thickness = 0.1;
  const thin = arrow.getCurves(SQUARE);
  assert.ok(allPoints(thin).some((p) => Math.abs(p.y - (55 - 5.5)) < 1e-6));

  arrow.thickness = 0.35;
  arrow.rightEnd.setLength(0.2, 110, 110);
  const shortHead = arrow.getCurves(SQUARE).at(0).beziers;
  // Head base sits 0.2*height = 22px from the right edge.
  assert.ok(shortHead.some((bz) => Math.abs(bz.start.x - 88) < 1e-6));

  arrow.rightEnd.setLength(0.5, 110, 110);
  arrow.rightEnd.setInnerOffset(-0.2, 110, 110);
  const extended = arrow.getCurves(SQUARE).at(0).beziers;
  // innerOffset shifts the shaft end by innerOffset * height (22px) into the head.
  assert.ok(extended.some((bz) => Math.abs(bz.start.x - 77) < 1e-6));
});

test("ShapeArrow: flat (None) ends and unsupported style fallback", () => {
  const arrow = SHAPE_BY_TYPE.Arrow.create();
  arrow.leftEnd.style = ShapeArrowEndStyle.None;
  arrow.rightEnd.style = ShapeArrowEndStyle.None;
  assert.equal(arrow.getCurves(SQUARE).at(0).beziers.length, 4, "both flat ends -> rectangle");

  const oneFlat = SHAPE_BY_TYPE.Arrow.create();
  oneFlat.leftEnd.style = ShapeArrowEndStyle.None;
  assert.equal(oneFlat.getCurves(SQUARE).at(0).beziers.length, 7);

  const unsupported = SHAPE_BY_TYPE.Arrow.create();
  warnings.reset();
  unsupported.leftEnd.style = ShapeArrowEndStyle.Circle;
  const pc = unsupported.getCurves(SQUARE);
  assert.ok(pc.curveCount > 0);
  assert.match(warnings.list().join(" "), /Arrow end style "Circle" is not implemented/);
});

test("ShapePie: wedge and donut", () => {
  const pie = SHAPE_BY_TYPE.Pie.create();
  const pc = pie.getCurves(SQUARE);
  assert.equal(pc.at(0).isClosed, true);
  assert.ok(pc.at(0).beziers.length >= 4);

  pie.innerRadius = 0.5;
  const donut = pie.getCurves(SQUARE);
  assert.ok(donut.at(0).beziers.length >= 6, "inner arc adds segments");
  const bb = boundsOf(donut);
  assert.ok(bb.x0 >= -1e-6 && bb.x1 <= 110 + 1e-6);
});

test("ShapeSegment closes with a chord", () => {
  const seg = SHAPE_BY_TYPE.Segment.create();
  const pc = seg.getCurves(SQUARE);
  assert.equal(pc.at(0).isClosed, true);
  assert.ok(pc.at(0).beziers.length >= 4);
  warnings.reset();
  seg.upperLine = 0.5;
  seg.getCurves(SQUARE);
  assert.match(warnings.list().join(" "), /upperLine < 1 is not implemented/);
});

test("ShapeHeart and ShapeTear produce closed outlines", () => {
  const heart = SHAPE_BY_TYPE.Heart.create().getCurves(SQUARE);
  assert.equal(heart.at(0).isClosed, true);
  assert.equal(heart.at(0).beziers.length, 6);

  const tear = SHAPE_BY_TYPE.Tear.create().getCurves(SQUARE);
  assert.equal(tear.at(0).isClosed, true);
  assert.equal(tear.at(0).beziers.length, 4);
});

test("ShapeCrescent: arc parameters and clamping", () => {
  const cr = SHAPE_BY_TYPE.Crescent.create();
  assert.equal(cr.leftArc, -1);
  assert.equal(cr.rightArc, -0.3);

  const pc = cr.getCurves(SQUARE);
  assert.equal(pc.at(0).beziers.length, 4);
  // Inner apex (rightArc) and outer apex (leftArc) sit at x = centre + arc * radius.
  assert.ok(Math.abs(pc.at(0).beziers[0].end.x - (55 - 0.3 * 55)) < 1e-6);
  assert.ok(Math.abs(pc.at(0).beziers[2].end.x - (55 - 1 * 55)) < 1e-6);

  // leftArc is clamped to rightArc, rightArc to leftArc.
  const clamped = SHAPE_BY_TYPE.Crescent.create();
  clamped.leftArc = 0.5;
  assert.equal(clamped.leftArc, -0.3);
  assert.equal(clamped.rightArc, -0.3);
  clamped.rightArc = 0.5;
  assert.equal(clamped.leftArc, -0.3);
  assert.equal(clamped.rightArc, 0.5);

  const outOfRange = SHAPE_BY_TYPE.Crescent.create();
  outOfRange.leftArc = -5;
  assert.equal(outOfRange.leftArc, -1);
});

test("ShapeCog: teeth, hole and curvature", () => {
  const cog = SHAPE_BY_TYPE.Cog.create();
  const pc = cog.getCurves(SQUARE);
  assert.equal(pc.curveCount, 2, "outline + hole");
  assert.equal(pc.at(0).beziers.length, 12 * 4);
  assert.equal(pc.at(1).beziers.length, 4);
  assert.equal(pc.at(0).isClosed, true);
  assert.equal(pc.at(1).isClosed, true);

  cog.holeRadius = 0;
  assert.equal(cog.getCurves(SQUARE).curveCount, 1, "no hole");

  cog.holeRadius = 0.2;
  cog.teeth = 8;
  assert.equal(cog.getCurves(SQUARE).at(0).beziers.length, 8 * 4);

  // curvature 0 gives straight flanks (degenerate cubics); >0 bends them.
  cog.teeth = 12;
  const straight = cog.getCurves(SQUARE).at(0).beziers[1];
  assert.deepEqual(straight.c1, straight.start);
  assert.deepEqual(straight.c2, straight.end);

  cog.curvature = 1;
  const bent = cog.getCurves(SQUARE).at(0).beziers[1];
  assert.notDeepEqual(bent.c1, bent.start);
});

test("ShapeSpiral: turns, flip and unsupported styles", () => {
  const sp = SHAPE_BY_TYPE.Spiral.create();
  const pc = sp.getCurves(SQUARE);
  assert.equal(pc.curveCount, 1);
  assert.equal(pc.at(0).isClosed, false);
  assert.equal(pc.at(0).beziers.length, 20, "5 turns x 4 arcs");

  sp.turns = 1;
  assert.equal(sp.getCurves(SQUARE).at(0).beziers.length, 4);

  sp.turns = 0;
  assert.equal(sp.getCurves(SQUARE).at(0).beziers.length, 0, "no turns -> empty curve");

  sp.turns = 2;
  sp.partTurn = 0.25;
  assert.equal(sp.getCurves(SQUARE).at(0).beziers.length, 9);

  const normal = SHAPE_BY_TYPE.Spiral.create();
  normal.turns = 2;
  const up = normal.getCurves(SQUARE);
  normal.flip = true;
  const down = normal.getCurves(SQUARE);
  assert.ok(Math.abs(up.at(0).beziers[1].start.y - (55 - 55)) < 1e-6);
  assert.ok(Math.abs(down.at(0).beziers[1].start.y - (55 + 55)) < 1e-6);

  const styled = SHAPE_BY_TYPE.Spiral.create();
  warnings.reset();
  styled.style = ShapeSpiralStyle.Fibonacci;
  assert.ok(styled.getCurves(SQUARE).curveCount === 1);
  assert.match(warnings.list().join(" "), /Spiral style "Fibonacci" is not implemented/);
});

test("ShapeCalloutRectangle: rounded box, tail and per-corner radii", () => {
  const clr = SHAPE_BY_TYPE.CalloutRectangle.create();
  const pc = clr.getCurves(SQUARE);
  assert.equal(pc.curveCount, 1);
  assert.equal(pc.at(0).beziers.length, 11);
  assert.equal(clr.useSingleRadius, true);

  // Tail tip at endPosition along the bottom edge.
  const pts = allPoints(pc);
  assert.ok(pts.some((p) => Math.abs(p.x - 22) < 1e-6 && Math.abs(p.y - 110) < 1e-6));

  // useSingleRadius means setting corner 1 is ignored; disabling it applies it.
  const single = SHAPE_BY_TYPE.CalloutRectangle.create();
  single.setCornerRadius(1, 0.1, 110, 110);
  assert.equal(single.getCurves(SQUARE).at(0).beziers.length, 11);
  single.useSingleRadius = false;
  const multi = single.getCurves(SQUARE).at(0).beziers;
  // TR radius = 0.1 * min(110, 77) = 7.7px, so the top edge ends at x = 102.3.
  assert.ok(multi.some((bz) => Math.abs(bz.start.y) < 1e-6 && Math.abs(bz.start.x - 102.3) < 1e-6),
    "top-right corner radius 0.1 -> 7.7px");

  // A huge radius is clamped to half the smaller dimension and the tail slides inwards.
  const huge = SHAPE_BY_TYPE.CalloutRectangle.create();
  huge.setCornerRadius(0, 0.8, 110, 110);
  const hugePc = huge.getCurves(SQUARE);
  assert.equal(hugePc.at(0).beziers.length, 10, "degenerate leading segment is dropped");
});

test("ShapeCalloutEllipse: tail angle, direction and clamping", () => {
  const ce = SHAPE_BY_TYPE.CalloutEllipse.create();
  const pc = ce.getCurves(SQUARE);
  assert.equal(pc.curveCount, 1);
  assert.equal(pc.at(0).beziers.length, 7);
  const pts = allPoints(pc);
  assert.ok(pts.some((p) => Math.abs(p.x - 16.5) < 1e-6 && Math.abs(p.y - 110) < 1e-6),
    "tail tip at endPosition 0.15");

  // A very wide tail is clamped to the tangent points from the tip, which leaves the
  // ellipse in two arcs (0..a1 and a2..360).
  ce.tail.angle = Math.PI * 143 / 180;
  const clamped = ce.getCurves(SQUARE);
  assert.equal(clamped.at(0).beziers.length, 6);

  ce.tail.endPosition = 0.85;
  ce.tail.angle = Math.PI / 6;
  const right = ce.getCurves(SQUARE);
  assert.ok(allPoints(right).some((p) => Math.abs(p.x - 93.5) < 1e-6 && Math.abs(p.y - 110) < 1e-6));
});

test("ShapeQRCode warns and falls back to its bounding rectangle", () => {
  warnings.reset();
  const pc = SHAPE_BY_TYPE.QRCode.create().getCurves(SQUARE);
  assert.equal(pc.curveCount, 1);
  assert.equal(pc.at(0).beziers.length, 4);
  assert.match(warnings.list().join(" "), /QRCode renders as its bounding rectangle/);
});

// ------------------------------------------------------------------ cats

test("cat shapes warn and fall back to an ellipse", () => {
  for (const name of ["Cat", "Cat2", "Cat3", "Cat4"]) {
    warnings.reset();
    const pc = SHAPE_BY_TYPE[name].create().getCurves(SQUARE);
    assert.equal(pc.curveCount, 1, name + " curves");
    assert.equal(pc.at(0).isClosed, true);
    assert.equal(pc.at(0).beziers.length, 4, name + " segments");
    assert.match(
      warnings.list().join(" "),
      new RegExp(name + " renders as an ellipse"),
      name + " should warn",
    );
  }
});

// ------------------------------------------------------------------ non-square bounds

test("normalised shapes stretch with non-square bounds", () => {
  const sq = SHAPE_BY_TYPE.SquareStar.create().getCurves(new Rectangle(0, 0, 110, 110));
  const wide = SHAPE_BY_TYPE.SquareStar.create().getCurves(new Rectangle(0, 0, 220, 110));
  const tall = SHAPE_BY_TYPE.SquareStar.create().getCurves(new Rectangle(0, 0, 110, 220));
  const sqb = boundsOf(sq);
  const wideb = boundsOf(wide);
  const tallb = boundsOf(tall);
  // Doubling one axis doubles that extent and leaves the other alone.
  assert.ok(Math.abs(wideb.x1 - 2 * sqb.x1) < 1e-6, "wide x extent doubles");
  assert.ok(Math.abs(wideb.y1 - sqb.y1) < 1e-6, "wide y extent unchanged");
  assert.ok(Math.abs(tallb.x1 - sqb.x1) < 1e-6, "tall x extent unchanged");
  assert.ok(Math.abs(tallb.y1 - 2 * sqb.y1) < 1e-6, "tall y extent doubles");
});
