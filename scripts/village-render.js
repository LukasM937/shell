#!/usr/bin/env node
// Draws the village without a shell: the pixel art sheet, or a world at a chosen age and time, to a PNG.
//
//   node scripts/village-render.js sheet out.png [--season summer] [--zoom 4]
//   node scripts/village-render.js scene out.png [--seed 7] [--days 3] [--hour 15] [--season summer] [--zoom 3]
//
// It runs the same modules as the shell (modules/live/*.js) on a small software canvas that has only fillRect, which is
// all the shell's canvas is asked to do.

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

const root = path.join(__dirname, "..", "modules", "live");

// A library is a .pragma library script: its top level functions and vars become properties of the sandbox
function load(name, shared = {}) {
    const source = fs.readFileSync(path.join(root, name), "utf8").replace(/^\.pragma library$/m, "").replace(/^\.import .*$/gm, "");
    const sandbox = Object.assign({ Math, Date, console }, shared);
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
    const art = load("vart.js");
    const season = args.season ?? "summer";
    const lib = art.library(season, season === "winter");
    const zoom = +(args.zoom ?? 4);
    const canvas = new Raster(420, 330);
    canvas.fillStyle = "#78b65a";
    canvas.fillRect(0, 0, canvas.width, canvas.height);
    let x = 4, y = 4, rowH = 0;
    const place = (spr, label) => {
        if (x + spr.w + 4 > canvas.width) {
            x = 4;
            y += rowH + 4;
            rowH = 0;
        }
        art.blit(canvas, spr, x, y);
        x += spr.w + 4;
        rowH = Math.max(rowH, spr.h);
    };
    for (const id of Object.keys(lib.building))
        for (const spr of lib.building[id])
            place(spr, id);
    x = 4;
    y += rowH + 8;
    rowH = 0;
    for (const kind of Object.keys(lib.tree))
        for (const spr of lib.tree[kind])
            place(spr, kind);
    for (const kind of Object.keys(lib.rock))
        for (const spr of lib.rock[kind])
            place(spr, kind);
    for (const id of Object.keys(lib.prop))
        place(lib.prop[id], id);
    fs.writeFileSync(out, png(canvas.zoomed(zoom)));
    console.log(`sheet ${canvas.width}x${canvas.height} at x${zoom}, used height ${y + rowH + 4}`);
}

// One sprite, big, next to the others of its kind
function one(out) {
    const art = load("vart.js");
    const season = args.season ?? "summer";
    const lib = art.library(season, season === "winter");
    const ids = (args.id ?? "house").split(",");
    const zoom = +(args.zoom ?? 12);
    const canvas = new Raster(200, 60);
    canvas.fillStyle = args.bg ?? "#78b65a";
    canvas.fillRect(0, 0, canvas.width, canvas.height);
    let x = 4;
    for (const id of ids) {
        const group = lib.building[id] ?? lib.tree[id] ?? lib.prop[id] ? [lib.prop[id]] : lib.rock[id];
        const list = lib.building[id] ?? lib.tree[id] ?? (lib.prop[id] ? [lib.prop[id]] : lib.rock[id]);
        const spr = list[+(args.variant ?? 0) % list.length];
        art.blit(canvas, spr, x, 4);
        x += spr.w + 4;
    }
    const cropped = new Raster(x, 60);
    cropped.data.set(canvas.data.subarray(0, x * 60 * 4).filter(() => true));
    const crop = new Raster(x, 50);
    for (let j = 0; j < 50; j++)
        crop.data.set(canvas.data.subarray((j * canvas.width) * 4, (j * canvas.width + x) * 4), j * x * 4);
    fs.writeFileSync(out, png(crop.zoomed(zoom)));
}

// A world with some buildings put down by hand, to look at the art in place. The shell's world builds its own
function demoWorld(V, seed) {
    const w = V.create({ seed, now: 0 });
    const c = w.centre;
    const put = (type, dx, dy, done = true) => {
        const d = V.BUILD[type];
        if (V.footprintFree(w, c.x + dx, c.y + dy, d.fw, d.fh, 0))
            return V.newBuilding(w, type, c.x + dx, c.y + dy, done);
        return null;
    };
    put("house", -9, -3); put("house", -6, -3); put("hut", -3, -3); put("longhouse", 0, -3); put("house", 4, -3);
    put("tavern", 7, -4); put("market", -4, 1); put("well", 1, 1); put("church", 4, 0); put("townhall", 9, 1);
    put("windmill", -12, 2); put("bakery", -8, 1); put("smithy", 11, -3); put("storehouse", -13, -3);
    put("field", -14, 5); put("field", -9, 5); put("woodhut", 13, 4); put("hut", 8, 5, false);
    for (const b of w.buildings.filter(b => b.type === "field"))
        for (let j = 0; j < b.fh; j++)
            for (let i = 0; i < b.fw; i++)
                V.setGround(w, b.x + i, b.y + j, V.T.FIELD);
    return w;
}

function scene(out) {
    const art = load("vart.js");
    const V = load("village.js");
    const draw = load("vdraw.js");
    draw.init(art);
    const seed = +(args.seed ?? 7);
    // a date and hour in the world's own clock, local time
    const [y, mo, d] = (args.date ?? "2026-06-15").split("-").map(Number);
    const hour = +(args.hour ?? 14);
    const start = new Date(y, mo - 1, d, 6, 0, 0).getTime();
    const target = new Date(y, mo - 1, d, 0, 0, 0).getTime() + hour * 3600000;
    const w = V.create({ seed, now: start });
    const hours = +(args.age ?? 0);
    const profile = { quiet: [0.03, 0, 0], typical: [0.2, 200000, 0.05], heavy: [0.7, 5e6, 0.6] }[args.profile ?? "typical"];
    // the settlement is grown at the speed of one second per step, then the clock is moved to the wanted hour
    let t = 0;
    const weather = args.weather ? { code: +args.weather, tempC: +(args.temp ?? 12), wind: +(args.wind ?? 12) } : null;
    while (t < hours * 3600) {
        V.setSignals(w, { now: start + t * 1000, cpu: profile[0], netDown: profile[1], gpu: profile[2], mem: 0.4, disk: 0.5, weather });
        V.step(w, 1);
        t += 1;
    }
    // a few quiet seconds at the wanted time so people are where the hour puts them
    const settle = +(args.settle ?? 90);
    const clock0 = target - settle * 1000;
    for (let i = 0; i < settle * 2; i++) {
        V.setSignals(w, { now: clock0 + i * 500, cpu: profile[0], netDown: profile[1], gpu: profile[2], weather, audio: args.audio === "1" });
        V.step(w, 0.5);
    }
    const env = w.env;
    const lib = art.library(env.season, env.snowCover > 0.4);
    const stage = { season: env.season, snow: env.snowCover, ice: env.ice, crop: env.crop };
    const canvas = new Raster(w.cols * 8, w.rows * 8);
    draw.paintGround(canvas, w, stage);
    const covers = draw.paintObjects(canvas, w, lib, env);
    draw.drawDynamic(canvas, w, lib, env, +(args.t ?? 3.3), covers);
    draw.drawWeather(canvas, w, env, +(args.t ?? 3.3));
    const amb = draw.ambient(env);
    if (amb[3] > 0) {
        canvas.fillStyle = `rgba(${amb[0]},${amb[1]},${amb[2]},${amb[3]})`;
        canvas.fillRect(0, 0, canvas.width, canvas.height);
    }
    draw.drawLights(canvas, w, lib, env, +(args.t ?? 3.3));
    fs.writeFileSync(out, png(canvas.zoomed(+(args.zoom ?? 2))));
    const c = V.census(w);
    console.log(`scene seed ${seed} age ${hours}h ${env.season} ${env.hour.toFixed(1)}h daylight ${env.daylight.toFixed(2)} ${env.kind}: pop ${c.people}, buildings ${JSON.stringify(c.buildings)}, sites ${c.sites}, renown ${c.renown.toFixed(0)}`);
}

// What services/LiveWallpaper.qml does for a poster: the pixels as base64 into Pillow
function poster(out) {
    const art = load("vart.js");
    const V = load("village.js");
    const draw = load("vdraw.js");
    const P = load("vposter.js");
    const start = new Date(2026, 5, 15, 6, 0, 0).getTime();
    const w = V.create({ seed: 7, now: start });
    const hours = +(args.age ?? 6);
    for (let t = 0; t < hours * 3600; t++) {
        V.setSignals(w, { now: start + t * 1000, cpu: 0.2, netDown: 200000, gpu: 0.05 });
        V.step(w, 1);
    }
    for (let i = 0; i < 60; i++) {
        V.setSignals(w, { now: new Date(2026, 5, 15, 17, 0, 0).getTime() + i * 500, cpu: 0.2 });
        V.step(w, 0.5);
    }
    const t0 = Date.now();
    const raster = P.village(art, draw, w, 3.3);
    const t1 = Date.now();
    const b64 = P.base64(raster.data);
    const t2 = Date.now();
    const py = `import sys,base64;from PIL import Image;w,h,z=int(sys.argv[1]),int(sys.argv[2]),int(sys.argv[3]);im=Image.frombytes("RGBA",(w,h),base64.b64decode(sys.stdin.read()));im=im.resize((w*z,h*z),Image.NEAREST).convert("RGB");im.save(sys.argv[4])`;
    require("child_process").execFileSync("python3", ["-c", py, String(raster.width), String(raster.height), String(args.zoom ?? 2), out], { input: b64 });
    console.log(`poster ${raster.width}x${raster.height}: render ${t1 - t0} ms, base64 ${t2 - t1} ms (${(b64.length / 1e6).toFixed(2)} MB)`);
}

const [mode, out] = positional;
if (mode === "sheet" && out)
    sheet(out);
else if (mode === "one" && out)
    one(out);
else if (mode === "scene" && out)
    scene(out);
else if (mode === "poster" && out)
    poster(out);
else {
    console.error("usage: village-render.js sheet|scene out.png [options]");
    process.exit(2);
}

module.exports = { load, Raster, png };
