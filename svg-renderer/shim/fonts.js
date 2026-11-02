'use strict';

// Fonts. The shim has no font database, so it models just the handful of properties
// that matter to SVG: family, weight, italic and width. `Font.all`/`FontFamily.all`
// return empty lists because there is nothing to enumerate outside Affinity.

const { FontWeight, FontWidth, FontField } = require('./enums.js');

class Font {
    constructor(family, weight, isItalic, width) {
        this.familyName = family || 'Helvetica';
        this.weight = weight || FontWeight.Normal;
        this.isItalic = !!isItalic;
        this.width = width || FontWidth.Normal;
    }

    static create(family, weight, isItalic, width) {
        return new Font(family, weight, isItalic, width);
    }

    static createDefault() {
        return new Font('Helvetica', FontWeight.Normal, false, FontWidth.Normal);
    }

    static createEmpty() {
        return new Font('', FontWeight.Normal, false, FontWidth.Normal);
    }

    static createDefaultMonospaced() {
        return new Font('Courier', FontWeight.Normal, false, FontWidth.Normal);
    }

    static createDefaultSymbol() {
        return Font.createDefault();
    }

    static get all() {
        return [];
    }

    clone() {
        return new Font(this.familyName, this.weight, this.isItalic, this.width);
    }

    get isValid() {
        return this.familyName !== '';
    }

    get isNormal() {
        return this.weight === FontWeight.Normal && !this.isItalic && this.width === FontWidth.Normal;
    }

    get isBold() {
        return this.weight === FontWeight.Bold;
    }

    get isCondensed() {
        return this.width === FontWidth.Condensed || this.width === FontWidth.SemiCondensed;
    }

    get isExpanded() {
        return this.width === FontWidth.Expanded || this.width === FontWidth.SemiExpanded;
    }

    get postscriptName() {
        return this.familyName;
    }

    toString() {
        return this.familyName;
    }
}

class FontFamily {
    constructor(name) {
        this.name = name || '';
    }

    static get all() {
        return [];
    }

    get fontCount() {
        return 0;
    }

    get length() {
        return 0;
    }

    get fonts() {
        return [];
    }
}

class FontCollection {
    constructor(displayName) {
        this.displayName = displayName || '';
    }

    static get all() {
        return [];
    }
}

module.exports = { Font, FontFamily, FontCollection, FontField, FontWeight, FontWidth };
