'use strict';

// Turns a shim document's node definitions into an SVG string. Every geometry node is
// emitted as one <path>, in insertion order (back to front); text nodes are emitted as
// <text> with one <tspan> per styled run. Gradient paints become <defs> entries and
// `url(#…)` paint servers.

const { asFill } = require('./fills.js');
const warnings = require('./warnings.js');

// Approximate baseline offset from the top of a line, as a fraction of the font size.
const ASCENT_RATIO = 0.8;

const WEIGHT_CSS = {
    Thin: '100',
    ExtraLight: '200',
    Light: '300',
    Normal: null,
    Medium: '500',
    SemiBold: '600',
    Bold: 'bold',
    ExtraBold: '800',
    Black: '900',
};

const fmt = (v) => String(Math.round(v * 100) / 100);

function num(v, fallback) {
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function clamp01(v) {
    return Math.max(0, Math.min(1, v));
}

function hexOf(rgba8) {
    const h = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    return '#' + h(rgba8.r) + h(rgba8.g) + h(rgba8.b);
}

function xmlEscape(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function isNoneEnum(v) {
    return !v || String(v) === 'None';
}

function cssWeight(weight) {
    if (!weight) return null;
    return WEIGHT_CSS[String(weight)] || null;
}

function pathData(polyCurve) {
    const parts = [];

    for (let i = 0; i < polyCurve.curveCount; i++) {
        const curve = polyCurve.at(i);
        if (!curve || curve.isEmpty) continue;

        const bzs = curve.beziers;
        if (!bzs.length) continue;

        parts.push('M ' + fmt(bzs[0].start.x) + ' ' + fmt(bzs[0].start.y));
        for (const bz of bzs) {
            parts.push('C ' + fmt(bz.c1.x) + ' ' + fmt(bz.c1.y) + ' ' +
                       fmt(bz.c2.x) + ' ' + fmt(bz.c2.y) + ' ' +
                       fmt(bz.end.x) + ' ' + fmt(bz.end.y));
        }
        if (curve.isClosed) parts.push('Z');
    }

    return parts.join(' ');
}

function closedSubpathCount(polyCurve) {
    let n = 0;
    for (let i = 0; i < polyCurve.curveCount; i++) {
        const curve = polyCurve.at(i);
        if (curve && curve.isClosed && !curve.isEmpty) n++;
    }
    return n;
}

// ---------------------------------------------------------------- gradients

function averageColour(a, b) {
    const ca = a.rgba8;
    const cb = b.rgba8;
    return {
        isColour: true,
        rgba8: {
            r: Math.round((ca.r + cb.r) / 2),
            g: Math.round((ca.g + cb.g) / 2),
            b: Math.round((ca.b + cb.b) / 2),
            alpha: Math.round((ca.alpha + cb.alpha) / 2),
        },
        toString: () => 'average',
    };
}

// Converts the gradient to SVG stops. Affinity's midpoint biases where the 50%
// blend sits between two stops; a synthetic stop at that point reproduces it.
function gradientStops(gradient) {
    const raw = gradient && gradient.stops ? gradient.stops.slice() : [];
    if (!raw.length) {
        return [
            { position: 0, colour: { rgba8: { r: 0, g: 0, b: 0, alpha: 255 } } },
            { position: 1, colour: { rgba8: { r: 255, g: 255, b: 255, alpha: 255 } } },
        ];
    }

    raw.sort((a, b) => num(a.position, 0) - num(b.position, 0));

    const out = [];
    for (let i = 0; i < raw.length; i++) {
        const stop = raw[i];
        const position = clamp01(num(stop.position, i === 0 ? 0 : 1));
        out.push({ position, colour: stop.colour });

        const next = raw[i + 1];
        if (!next) continue;

        const midpoint = num(stop.midpoint, 0.5);
        if (midpoint === 0.5) continue;

        const end = clamp01(num(next.position, 1));
        const midPosition = position + (end - position) * clamp01(midpoint);
        if (midPosition > position && midPosition < end) {
            out.push({ position: midPosition, colour: averageColour(stop.colour, next.colour) });
        }
    }

    if (out.length < 2) {
        const first = out[0] || { position: 0, colour: { rgba8: { r: 0, g: 0, b: 0, alpha: 255 } } };
        return [first, { position: 1, colour: first.colour }];
    }

    return out;
}

function gradientMarkup(id, fill) {
    const gradient = fill.gradient;
    if (!gradient) return '';

    const typeName = fill.gradientFillType ? String(fill.gradientFillType) : 'Linear';

    let tag = 'linearGradient';
    let geometry = 'x1="0" y1="0" x2="1" y2="0"';

    if (typeName === 'Elliptical' || typeName === 'Radial') {
        tag = 'radialGradient';
        geometry = 'cx="0.5" cy="0.5" r="0.5"';
        if (typeName === 'Radial') {
            warnings.warn('Radial gradients are rendered as elliptical (objectBoundingBox)');
        }
    } else if (typeName === 'Conical') {
        warnings.warn('conical gradients are rendered as linear');
    } else if (typeName !== 'Linear') {
        warnings.warn('gradient type ' + typeName + ' is rendered as linear');
    }

    if (fill.transform) warnings.warn('gradient transforms are ignored');
    if (num(fill.noise, 0) !== 0 || gradient.hasNoise) warnings.warn('gradient noise is ignored');
    if (gradient.hasNonLinearMapping) warnings.warn('non-linear gradient mapping is ignored');
    if (num(fill.tint, 1) !== 1 || num(gradient.tint, 1) !== 1) warnings.warn('gradient tint is ignored');
    if (num(fill.intensity, 1) !== 1 || num(gradient.intensity, 1) !== 1) warnings.warn('gradient intensity is ignored');

    const overallAlpha = clamp01(num(fill.alpha, 1) * num(gradient.alpha, 1));
    const stops = gradientStops(gradient);

    const lines = ['    <' + tag + ' id="' + id + '" ' + geometry + '>'];
    for (const stop of stops) {
        const rgba = stop.colour.rgba8;
        const alpha = clamp01((rgba.alpha / 255) * overallAlpha);
        let attrs = 'offset="' + fmt(stop.position) + '" stop-color="' + hexOf(rgba) + '"';
        if (alpha < 1) attrs += ' stop-opacity="' + fmt(alpha) + '"';
        lines.push('      <stop ' + attrs + '/>');
    }
    lines.push('    </' + tag + '>');

    return lines.join('\n');
}

function createGradientRegistry() {
    let counter = 0;
    const defs = [];

    return {
        defs,
        idFor(fill) {
            const id = 'gradient-' + (++counter);
            const markup = gradientMarkup(id, fill);
            if (markup) defs.push(markup);
            return id;
        },
    };
}

function paintFor(fill, registry) {
    if (!fill) return 'none';
    if (fill.kind === 'solid') return hexOf(fill.colour.rgba8);
    if (fill.kind === 'gradient' && fill.gradient) {
        return 'url(#' + registry.idFor(fill) + ')';
    }
    return 'none';
}

// ---------------------------------------------------------------- text

function maxGlyphHeight(runs) {
    let h = 0;
    for (const run of runs || []) {
        const v = num(run.glyphAtts && run.glyphAtts.height, 0);
        if (v > h) h = v;
    }
    return h || 12;
}

function leadingFor(paragraphAtts, height) {
    const pa = paragraphAtts || {};
    if (String(pa.leadingType) === 'Absolute') {
        const abs = num(pa.absoluteLeading, 0);
        return abs > 0 ? abs : height;
    }
    const rel = num(pa.relativeLeading, 1);
    return height * (rel > 0 ? rel : 1);
}

// Maps Affinity's paragraph alignment to an SVG text-anchor, and warns about the
// cases the shim cannot reproduce (justification and spine-relative alignment).
function alignmentFor(paragraphAtts) {
    const name = paragraphAtts && paragraphAtts.alignXType
        ? String(paragraphAtts.alignXType)
        : 'Left';

    switch (name) {
        case 'Centre':
            return { anchor: 'middle' };
        case 'Right':
            return { anchor: 'end' };
        case 'JustifyCentre':
            warnings.warn('justified text is rendered as centre aligned (no justification)');
            return { anchor: 'middle' };
        case 'JustifyRight':
            warnings.warn('justified text is rendered as right aligned (no justification)');
            return { anchor: 'end' };
        case 'JustifyLeft':
            warnings.warn('justified text is rendered as left aligned (no justification)');
            return { anchor: 'start' };
        case 'JustifyAll':
            warnings.warn('JustifyAll is rendered as left aligned (no justification)');
            return { anchor: 'start' };
        case 'TowardsSpine':
            warnings.warn('TowardsSpine is rendered as right aligned');
            return { anchor: 'end' };
        case 'AwayFromSpine':
            warnings.warn('AwayFromSpine is rendered as left aligned');
            return { anchor: 'start' };
        default:
            return { anchor: 'start' };
    }
}

function anchorX(isFrame, def, paragraphAtts, align) {
    const pa = paragraphAtts || {};
    const left = num(pa.leftIndent, 0);
    const right = num(pa.rightIndent, 0);
    const first = num(pa.firstLineIndent, 0);

    if (isFrame) {
        const box = def.frameBox || {};
        const x = num(box.x, 0);
        const w = num(box.width, 0);
        if (align.anchor === 'middle') return x + w / 2;
        if (align.anchor === 'end') return x + w - right;
        return x + left + first;
    }

    // Art text is anchored at its position: left starts there, centre is centred on
    // it and right ends there.
    const x = num(def.position && def.position.x, 0);
    if (align.anchor === 'middle' || align.anchor === 'end') return x;
    return x + left + first;
}

function applyCaps(text, glyphAtts) {
    const caps = glyphAtts && glyphAtts.capsType ? String(glyphAtts.capsType) : 'None';

    switch (caps) {
        case 'AllCaps':
        case 'AllSmallCaps':
        case 'AllPetiteCaps':
        case 'Titling':
        case 'Unicase':
            return text.toUpperCase();
        case 'SmallCaps':
        case 'CapsToSmallCaps':
        case 'PetiteCaps':
        case 'CapsToPetiteCaps':
            warnings.warn('capsType ' + caps + ' is approximated by uppercasing');
            return text.toUpperCase();
        default:
            return text;
    }
}

function glyphAttrs(glyphAtts, registry) {
    registry = registry || createGradientRegistry();

    const ga = glyphAtts || {};
    const attrs = [];

    const height = num(ga.height, 12);
    attrs.push('font-size="' + fmt(height) + '"');

    const font = ga.font || {};
    attrs.push('font-family="' + xmlEscape(font.familyName || 'Helvetica') + '"');

    const weight = cssWeight(font.weight);
    if (weight) attrs.push('font-weight="' + weight + '"');
    if (font.isItalic) attrs.push('font-style="italic"');

    const spacing = num(ga.characterSpacing, 0);
    if (spacing) attrs.push('letter-spacing="' + fmt(spacing) + '"');

    const brush = asFill(ga.brushFill);
    if (brush.kind === 'solid') {
        const c = brush.colour.rgba8;
        attrs.push('fill="' + hexOf(c) + '"');
        if (c.alpha < 255) attrs.push('fill-opacity="' + fmt(c.alpha / 255) + '"');
    } else if (brush.kind === 'gradient') {
        attrs.push('fill="' + paintFor(brush, registry) + '"');
    } else {
        attrs.push('fill="none"');
    }

    const pen = asFill(ga.penFill);
    const ls = ga.lineStyleDescriptor && ga.lineStyleDescriptor.lineStyle;
    if (ls && num(ls.weight, 0) > 0) {
        if (pen.kind === 'solid') {
            attrs.push('stroke="' + hexOf(pen.colour.rgba8) + '"');
            attrs.push('stroke-width="' + fmt(ls.weight) + '"');
        } else if (pen.kind === 'gradient') {
            attrs.push('stroke="' + paintFor(pen, registry) + '"');
            attrs.push('stroke-width="' + fmt(ls.weight) + '"');
        }
    }

    const decorations = [];
    if (!isNoneEnum(ga.underlineType)) decorations.push('underline');
    if (!isNoneEnum(ga.strikeoutType)) decorations.push('line-through');
    if (decorations.length) attrs.push('text-decoration="' + decorations.join(' ') + '"');

    const superSub = ga.superSubType ? String(ga.superSubType) : 'None';
    if (superSub === 'Superscript') attrs.push('baseline-shift="super"');
    else if (superSub === 'Subscript') attrs.push('baseline-shift="sub"');

    if (asFill(ga.transparency).kind === 'solid') {
        warnings.warn('glyph transparency is ignored');
    }
    if (asFill(ga.highlightFill).kind === 'solid') {
        warnings.warn('glyph highlight fill is ignored');
    }

    return attrs;
}

function textNodeMarkup(def, registry) {
    const paragraphs = def.paragraphs || [];
    if (!paragraphs.length) return [];

    const isFrame = def.textKind === 'frame';
    const out = [];

    let top = isFrame ? num(def.frameBox && def.frameBox.y, 0) : 0;
    let baseline = isFrame ? 0 : num(def.position && def.position.y, 0);
    let firstParagraph = true;

    for (const paragraph of paragraphs) {
        const runs = paragraph.runs || [];
        const pa = paragraph.paragraphAtts || {};
        const height = maxGlyphHeight(runs);
        const leading = leadingFor(pa, height);
        const ascent = height * ASCENT_RATIO;

        if (isFrame) {
            top += num(pa.spaceBefore, 0);
            baseline = top + ascent;
        } else if (!firstParagraph) {
            baseline += num(pa.spaceBefore, 0);
        }

        const align = alignmentFor(pa);
        const x = anchorX(isFrame, def, pa, align);

        const spans = [];
        for (const run of runs) {
            if (!run || run.text === undefined || run.text === '') continue;
            const text = applyCaps(run.text, run.glyphAtts);
            if (!text) continue;
            spans.push('<tspan ' + glyphAttrs(run.glyphAtts, registry).join(' ') + '>' +
                       xmlEscape(text) + '</tspan>');
        }

        if (spans.length) {
            out.push('  <text x="' + fmt(x) + '" y="' + fmt(baseline) +
                     '" text-anchor="' + align.anchor + '" xml:space="preserve">' +
                     spans.join('') + '</text>');
        }

        if (isFrame) {
            top += leading + num(pa.spaceAfter, 0);
        } else {
            baseline += leading + num(pa.spaceAfter, 0);
        }
        firstParagraph = false;
    }

    return out;
}

// ---------------------------------------------------------------- document

function svgFromDocument(doc) {
    const registry = createGradientRegistry();
    const body = [];

    for (const def of doc.nodes) {
        if (def && def.textKind) {
            body.push(...textNodeMarkup(def, registry));
            continue;
        }

        const pc = def.polyCurve;
        if (!pc || !pc.curveCount) continue;

        const d = pathData(pc);
        if (!d) continue;

        const brush = asFill(def.brushFill);
        const line = asFill(def.lineFill);
        const ls = def.lineStyleDescriptor && def.lineStyleDescriptor.lineStyle;

        const attrs = ['d="' + d + '"'];

        if (brush && brush.kind === 'solid') {
            const c = brush.colour.rgba8;
            attrs.push('fill="' + hexOf(c) + '"');
            if (c.alpha < 255) attrs.push('fill-opacity="' + fmt(c.alpha / 255) + '"');
        } else if (brush && brush.kind === 'gradient') {
            attrs.push('fill="' + paintFor(brush, registry) + '"');
        } else {
            attrs.push('fill="none"');
        }

        // Multiple closed subpaths (e.g. a cog's hole) only punch holes under
        // even-odd, regardless of winding direction.
        if (closedSubpathCount(pc) > 1) attrs.push('fill-rule="evenodd"');

        if (ls && ls.weight > 0) {
            if (line && line.kind === 'solid') {
                attrs.push('stroke="' + hexOf(line.colour.rgba8) + '"');
                attrs.push('stroke-width="' + fmt(ls.weight) + '"');
                attrs.push('stroke-linecap="' + String(ls.cap).toLowerCase() + '"');
                attrs.push('stroke-linejoin="' + String(ls.join).toLowerCase() + '"');
            } else if (line && line.kind === 'gradient') {
                attrs.push('stroke="' + paintFor(line, registry) + '"');
                attrs.push('stroke-width="' + fmt(ls.weight) + '"');
                attrs.push('stroke-linecap="' + String(ls.cap).toLowerCase() + '"');
                attrs.push('stroke-linejoin="' + String(ls.join).toLowerCase() + '"');
            }
        }

        body.push('  <path ' + attrs.join(' ') + '/>');
    }

    const out = [];
    out.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + doc.widthPixels +
             '" height="' + doc.heightPixels + '" viewBox="0 0 ' +
             doc.widthPixels + ' ' + doc.heightPixels + '">');

    if (registry.defs.length) {
        out.push('  <defs>');
        out.push(...registry.defs);
        out.push('  </defs>');
    }

    out.push(...body);
    out.push('</svg>');
    return out.join('\n');
}

module.exports = {
    fmt,
    hexOf,
    xmlEscape,
    pathData,
    closedSubpathCount,
    gradientStops,
    gradientMarkup,
    glyphAttrs,
    textNodeMarkup,
    svgFromDocument,
};
