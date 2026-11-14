.pragma library

// Stills of the live wallpapers, drawn without a window. The wallpaper picker, the lock screen, the greeter and the colour
// scheme all want an image of the wallpaper, and a live wallpaper has none. The drawing routines only need fillRect, so they
// can draw onto this raster as well as onto a canvas; services/LiveWallpaper.qml hands the pixels to Pillow for the PNG.
// It has no QML dependencies so scripts/village-render.js can run it too.

function Raster(w, h) {
    this.width = w;
    this.height = h;
    this.data = new Uint8ClampedArray(w * h * 4);
    this.globalAlpha = 1;
    this.rgba = [0, 0, 0, 1];
    this.cache = {};
}

function parseColour(c) {
    if (c.charAt(0) === "#")
        return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), 1];
    var m = c.match(/rgba?\(([^)]+)\)/);
    if (!m)
        return [0, 0, 0, 1];
    var p = m[1].split(",");
    return [parseFloat(p[0]), parseFloat(p[1]), parseFloat(p[2]), p.length > 3 ? parseFloat(p[3]) : 1];
}

Object.defineProperty(Raster.prototype, "fillStyle", {
    set: function (c) {
        this.rgba = this.cache[c] || (this.cache[c] = parseColour(c));
    }
});

Raster.prototype.fillRect = function (x, y, w, h) {
    var c = this.rgba;
    var a = c[3] * this.globalAlpha;
    var x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y));
    var x1 = Math.min(this.width, Math.round(x + w)), y1 = Math.min(this.height, Math.round(y + h));
    var d = this.data;
    var opaque = a >= 0.999;
    for (var j = y0; j < y1; j++) {
        var k = (j * this.width + x0) * 4;
        for (var i = x0; i < x1; i++, k += 4) {
            if (opaque) {
                d[k] = c[0];
                d[k + 1] = c[1];
                d[k + 2] = c[2];
                d[k + 3] = 255;
            } else {
                var da = d[k + 3] / 255;
                var oa = a + da * (1 - a);
                if (oa <= 0)
                    continue;
                d[k] = (c[0] * a + d[k] * da * (1 - a)) / oa;
                d[k + 1] = (c[1] * a + d[k + 1] * da * (1 - a)) / oa;
                d[k + 2] = (c[2] * a + d[k + 2] * da * (1 - a)) / oa;
                d[k + 3] = oa * 255;
            }
        }
    }
};

var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// The pixels as base64, for a pipe. A script cannot write binary to a process, only text
function base64(bytes) {
    var parts = [];
    var chunk = "";
    var n = bytes.length;
    for (var i = 0; i < n; i += 3) {
        var a = bytes[i], b = i + 1 < n ? bytes[i + 1] : 0, c = i + 2 < n ? bytes[i + 2] : 0;
        chunk += B64.charAt(a >> 2) + B64.charAt(((a & 3) << 4) | (b >> 4)) + (i + 1 < n ? B64.charAt(((b & 15) << 2) | (c >> 6)) : "=") + (i + 2 < n ? B64.charAt(c & 63) : "=");
        if (chunk.length > 30000) {
            parts.push(chunk);
            chunk = "";
        }
    }
    parts.push(chunk);
    return parts.join("");
}

// The village at its own scale (8 virtual pixels to a tile), by the clock it is given
//   art, draw: modules/live/vart.js and vdraw.js, which a pragma library cannot import in node
function village(art, draw, world, t) {
    draw.init(art);
    var env = world.env;
    var lib = art.library(env.season || "summer", (env.snowCover || 0) > 0.4);
    var r = new Raster(world.cols * 8, world.rows * 8);
    draw.paintGround(r, world, {
        season: env.season,
        snow: env.snowCover || 0,
        ice: env.ice,
        crop: env.crop
    });
    var covers = draw.paintObjects(r, world, lib, env);
    draw.drawDynamic(r, world, lib, env, t, covers);
    draw.drawWeather(r, world, env, t);
    var amb = draw.ambient(env);
    if (amb[3] > 0.004) {
        r.fillStyle = "rgba(" + amb[0] + "," + amb[1] + "," + amb[2] + "," + amb[3] + ")";
        r.fillRect(0, 0, r.width, r.height);
    }
    draw.drawLights(r, world, lib, env, t);
    return r;
}

function ecosystem(ecoDraw, world) {
    var r = new Raster(world.cols * ecoDraw.CELL, world.rows * ecoDraw.CELL);
    ecoDraw.paint(r, world);
    return r;
}
