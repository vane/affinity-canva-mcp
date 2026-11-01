'use strict';

// Turns a shim document's node definitions into an SVG string. Every node is emitted
// as one <path>, in insertion order (back to front).

const fmt = (v) => String(Math.round(v * 100) / 100);

function hexOf(rgba8) {
    const h = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    return '#' + h(rgba8.r) + h(rgba8.g) + h(rgba8.b);
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

function svgFromDocument(doc) {
    const out = [];
    out.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + doc.widthPixels +
             '" height="' + doc.heightPixels + '" viewBox="0 0 ' +
             doc.widthPixels + ' ' + doc.heightPixels + '">');

    for (const def of doc.nodes) {
        const pc = def.polyCurve;
        if (!pc || !pc.curveCount) continue;

        const d = pathData(pc);
        if (!d) continue;

        const brush = def.brushFill;
        const line = def.lineFill;
        const ls = def.lineStyleDescriptor && def.lineStyleDescriptor.lineStyle;

        const attrs = ['d="' + d + '"'];

        if (brush && brush.kind === 'solid') {
            const c = brush.colour.rgba8;
            attrs.push('fill="' + hexOf(c) + '"');
            if (c.alpha < 255) attrs.push('fill-opacity="' + fmt(c.alpha / 255) + '"');
            // Multiple closed subpaths (e.g. a cog's hole) only punch holes under
            // even-odd, regardless of winding direction.
            if (closedSubpathCount(pc) > 1) attrs.push('fill-rule="evenodd"');
        } else {
            attrs.push('fill="none"');
        }

        if (line && line.kind === 'solid' && ls && ls.weight > 0) {
            attrs.push('stroke="' + hexOf(line.colour.rgba8) + '"');
            attrs.push('stroke-width="' + fmt(ls.weight) + '"');
            attrs.push('stroke-linecap="' + String(ls.cap).toLowerCase() + '"');
            attrs.push('stroke-linejoin="' + String(ls.join).toLowerCase() + '"');
        }

        out.push('  <path ' + attrs.join(' ') + '/>');
    }

    out.push('</svg>');
    return out.join('\n');
}

module.exports = { fmt, hexOf, pathData, closedSubpathCount, svgFromDocument };
