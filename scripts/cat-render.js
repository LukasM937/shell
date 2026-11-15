#!/usr/bin/env node
// Draws the dashboard cat without a shell: a sheet of its poses to a PNG.
//
//   node scripts/cat-render.js sheet out.png [--zoom 3] [--width 140]
//
// It runs the same module as the shell (modules/dashboard/dash/cat.js) on a small software canvas that has only fillRect.

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const zlib = require("zlib");

const args = {};
const positional = [];
process.argv.slice(2).forEach((a, i, all) => {
    if (a.startsWith("--"))
        args[a.slice(2)] = all[i + 1];
    else if (!all[i - 1]?.startsWith("--"))
        positional.push(a);
});

function load() {
    const source = fs.readFileSync(path.join(__dirname, "..", "modules", "dashboard", "dash", "cat.js"), "utf8").replace(/^\.pragma library$/m, "");
    const sandbox = { Math, console };
    vm.runInNewContext(source, sandbox);
    return sandbox;
}

// ---- software canvas --------------------------------------------------------------------------------------------

function parseColour(c) {
    if (c[0] === "#") {
        const v = c.length === 4 ? c.slice(1).split("").map(h => parseInt(h + h, 16)) : [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
        return [v[0], v[1], v[2], 1];
    }
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m)
        throw new Error(`colour ${c}`);
    const p = m[1].split(",").map(s => parseFloat(s));
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
}

class Raster {
    constructor(w, h) {
        this.width = w;
        this.height = h;
        this.data = new Uint8Array(w * h * 4);
        this.globalAlpha = 1;
        this._fill = [0, 0, 0, 1];
        this._cache = {};
    }

    set fillStyle(c) {
        this._fill = this._cache[c] ??= parseColour(c);
    }

    fillRect(x, y, w, h) {
        const [r, g, b, a0] = this._fill;
        const a = a0 * this.globalAlpha;
        const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y));
        const x1 = Math.min(this.width, Math.round(x + w)), y1 = Math.min(this.height, Math.round(y + h));
        for (let j = y0; j < y1; j++)
            for (let i = x0; i < x1; i++) {
                const k = (j * this.width + i) * 4;
                const da = this.data[k + 3] / 255;
                const oa = a + da * (1 - a);
                if (oa <= 0)
                    continue;
                this.data[k] = (r * a + this.data[k] * da * (1 - a)) / oa;
                this.data[k + 1] = (g * a + this.data[k + 1] * da * (1 - a)) / oa;
                this.data[k + 2] = (b * a + this.data[k + 2] * da * (1 - a)) / oa;
                this.data[k + 3] = oa * 255;
            }
    }

    clearRect(x, y, w, h) {
        for (let j = Math.max(0, y); j < Math.min(this.height, y + h); j++)
            for (let i = Math.max(0, x); i < Math.min(this.width, x + w); i++)
                this.data.fill(0, (j * this.width + i) * 4, (j * this.width + i) * 4 + 4);
    }

    // The same pixels as another raster drawn over this one
    drawRaster(other, dx = 0, dy = 0) {
        for (let j = 0; j < other.height; j++)
            for (let i = 0; i < other.width; i++) {
                const k = (j * other.width + i) * 4;
                if (!other.data[k + 3])
                    continue;
                this._fill = [other.data[k], other.data[k + 1], other.data[k + 2], other.data[k + 3] / 255];
                const saved = this.globalAlpha;
                this.globalAlpha = 1;
                this.fillRect(dx + i, dy + j, 1, 1);
                this.globalAlpha = saved;
            }
    }

    zoomed(z) {
        const out = new Raster(this.width * z, this.height * z);
        for (let j = 0; j < out.height; j++)
            for (let i = 0; i < out.width; i++) {
                const s = ((Math.floor(j / z)) * this.width + Math.floor(i / z)) * 4;
                out.data.set(this.data.subarray(s, s + 4), (j * out.width + i) * 4);
            }
        return out;
    }
}

function crc32(buf) {
    let c, crc = 0xffffffff;
    for (let n = 0; n < buf.length; n++) {
        c = (crc ^ buf[n]) & 0xff;
        for (let k = 0; k < 8; k++)
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        crc = (crc >>> 8) ^ c;
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function png(raster) {
    const chunk = (type, data) => {
        const out = Buffer.alloc(12 + data.length);
        out.writeUInt32BE(data.length, 0);
        out.write(type, 4, "latin1");
        data.copy(out, 8);
        out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
        return out;
    };
    const head = Buffer.alloc(13);
    head.writeUInt32BE(raster.width, 0);
    head.writeUInt32BE(raster.height, 4);
    head[8] = 8;
    head[9] = 6;
    const rows = Buffer.alloc((raster.width * 4 + 1) * raster.height);
    for (let j = 0; j < raster.height; j++) {
        rows[j * (raster.width * 4 + 1)] = 0;
        Buffer.from(raster.data.buffer, raster.data.byteOffset + j * raster.width * 4, raster.width * 4).copy(rows, j * (raster.width * 4 + 1) + 1);
    }
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", head), chunk("IDAT", zlib.deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}

// ---- modes ------------------------------------------------------------------------------------------------------

function sheet(out) {
    const cat = load();
    const zoom = parseInt(args.zoom ?? "3");
    const w = parseInt(args.width ?? "140");
    const day = { night: false, hover: false, pointer: -1, busy: 0 };
    const night = { night: true, hover: false, pointer: -1, busy: 0 };
    const to = (c, x, act) => {
        c.tx = x;
        cat.enter(c, act, 99);
    };
    const poses = [
        [c => cat.enter(c, "sleep", 99), night, 5],
        [c => cat.enter(c, "wake", 1.5), day, 0.3],
        [c => cat.enter(c, "wake", 1.5), day, 1.3],
        [c => cat.enter(c, "sit", 99), day, 1],
        [c => cat.enter(c, "wash", 99), day, 1.1],
        [c => cat.pet(c), day, 1.3],
        [c => to(c, 70, "walk"), day, 0],
        [c => to(c, 100, "walk"), day, 0.3],
        [c => to(c, 100, "walk"), day, 0.5],
        [c => {
            c.x = 90;
            to(c, 4, "walk");
        }, day, 0.4],
        [c => {
            cat.enter(c, "play", 99);
            c.batT = 0.4;
            c.ball.x = 100;
        }, day, 0.1],
        [c => {
            c.laps = 3;
            to(c, 120, "zoom");
        }, day, 0.4],
        [c => cat.enter(c, "follow", 99), { night: false, hover: true, pointer: 110, busy: 0 }, 2]
    ];
    const cols = 2;
    const rows = Math.ceil(poses.length / cols);
    const img = new Raster((w + 2) * cols * zoom, (cat.H + 2) * rows * zoom);
    poses.forEach(([setup, env, secs], n) => {
        const c = cat.create(7, w);
        setup(c);
        for (let t = 0; t < secs; t += 0.05)
            cat.step(c, 0.05, env);
        const tile = new Raster(w, cat.H);
        cat.draw(tile, c, env);
        img.drawRaster(tile.zoomed(zoom), (n % cols) * (w + 2) * zoom, Math.floor(n / cols) * (cat.H + 2) * zoom);
    });
    fs.writeFileSync(out, png(img));
}

if (positional[0] === "sheet")
    sheet(positional[1] ?? "cat.png");
else {
    console.error("usage: cat-render.js sheet out.png [--zoom 4] [--width 140]");
    process.exit(1);
}
