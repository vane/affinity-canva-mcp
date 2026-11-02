#!/usr/bin/env node
'use strict';

// Renders the drawing scripts in this repo to SVG without Affinity.
//
//   node render.js <drawing.js> [out.svg]      one script
//   node render.js --all [inDir] [outDir]      every .js in a folder
//
// With no out path, output goes to /tmp/svg-renderer.

const fs = require('node:fs');
const path = require('node:path');
const { renderFileToSvg } = require('./shim/index.js');

// Default destination, so a run never leaves SVG files in the repository.
function defaultOutDir() {
    return path.join('/tmp', 'svg-renderer');
}

function renderOne(inPath, outPath) {
    const { svg, doc, logs, warnings } = renderFileToSvg(inPath);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, svg, 'utf8');
    console.log(
        path.basename(inPath).padEnd(24),
        doc.widthPixels + 'x' + doc.heightPixels,
        String(doc.nodes.length).padStart(3) + ' nodes',
        String(svg.length).padStart(6) + ' bytes',
        '-> ' + outPath
    );
    for (const w of warnings) console.log('    WARN: ' + w);
    for (const line of logs) console.log('    ' + line);
}

function renderAll(inDir, outDir) {
    const files = fs.readdirSync(inDir)
        .filter((f) => f.endsWith('.js'))
        .sort();

    if (!files.length) {
        console.error('No .js files in ' + inDir);
        process.exitCode = 1;
        return;
    }

    fs.mkdirSync(outDir, { recursive: true });

    let failed = 0;
    for (const f of files) {
        try {
            renderOne(path.join(inDir, f), path.join(outDir, f.replace(/\.js$/, '.svg')));
        } catch (err) {
            failed++;
            console.error(path.basename(f).padEnd(24), 'FAILED:', err.message);
        }
    }

    console.log('\n' + (files.length - failed) + '/' + files.length + ' rendered into ' + outDir);
    if (failed) process.exitCode = 1;
}

const args = process.argv.slice(2);

if (!args.length || args[0] === '-h' || args[0] === '--help') {
    console.log('Usage:');
    console.log('  node render.js <drawing.js> [out.svg]');
    console.log('  node render.js --all [inDir] [outDir]');
    console.log('  (default output: ' + defaultOutDir() + ')');
    process.exit(0);
}

if (args[0] === '--all') {
    const inDir = args[1] || path.join(__dirname, '..', 'examples', 'scripts');
    const outDir = args[2] || defaultOutDir();
    renderAll(path.resolve(inDir), path.resolve(outDir));
} else {
    const inPath = path.resolve(args[0]);
    const outPath = args[1]
        ? path.resolve(args[1])
        : path.join(defaultOutDir(), path.basename(inPath).replace(/\.js$/, '.svg'));
    renderOne(inPath, outPath);
}
