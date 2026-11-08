.pragma library

// Turns system readings (traffic, temperature, pings, access points, devices) into the inputs of an ecosystem world. It
// has no QML dependencies so scripts/ecosystem-check.js can run it headless, like modules/lock/runner.js.
// A reading can be missing (undefined, null, NaN or the wrong type), and then the function gives the baseline.

var RAIN_BASE = 0.8;
var RAIN_MIN = 0.1;
var RAIN_MAX = 1.5;
var QUIET_BYTES = 50000; // below this the network is idle and gives no extra rain
var BUSY_BYTES = 10000000;
var HOT_FROM = 70;
var HOT_TO = 85;
var HOT_DROP = 0.6;

var LIGHTNING_BASE = 0.05;
var LIGHTNING_SPAN = 0.5;
var PING_WINDOW = 10;

var MAX_SPRINGS = 8;
var MAX_ISLANDS = 12;
var MAX_GROVES = 24;
var ISLAND_BASE = 0.12;
var ISLAND_SPAN = 0.18;
var ISLAND_RADIUS = 0.08;

function num(v) {
    return typeof v === "number" && isFinite(v);
}

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

// Rain follows download traffic on a log scale, because a few KB/s and a few MB/s should both show. A hot CPU dries it.
function rain(downloadBytesPerSec, cpuTempC) {
    var r = RAIN_BASE;
    if (typeof downloadBytesPerSec === "number" && downloadBytesPerSec > QUIET_BYTES)
        r += (RAIN_MAX - RAIN_BASE) * Math.min(1, Math.log(downloadBytesPerSec / QUIET_BYTES) / Math.log(BUSY_BYTES / QUIET_BYTES));
    if (num(cpuTempC) && cpuTempC > HOT_FROM)
        r -= HOT_DROP * Math.min(1, (cpuTempC - HOT_FROM) / (HOT_TO - HOT_FROM));
    return clamp(r, RAIN_MIN, RAIN_MAX);
}

// pings is oldest first, true for a reply. Entries that are not booleans are no reading and do not count.
function lightning(pings) {
    var seen = 0, failed = 0;
    if (Array.isArray(pings))
        for (var i = Math.max(0, pings.length - PING_WINDOW); i < pings.length; i++) {
            if (typeof pings[i] !== "boolean")
                continue;
            seen++;
            if (!pings[i])
                failed++;
        }
    return LIGHTNING_BASE + (seen ? LIGHTNING_SPAN * failed / seen : 0);
}

function springCount(connectedDevices) {
    if (typeof connectedDevices !== "number" || isNaN(connectedDevices))
        return 0;
    return Math.floor(clamp(connectedDevices, 0, MAX_SPRINGS));
}

// 32 bit FNV-1a, then a murmur3 finaliser: FNV alone leaves the strings "a" and "b" almost the same in the high bits
function hashString(s) {
    var h = 0x811c9dc5;
    if (typeof s === "string")
        for (var i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 0x01000193);
        }
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
}

// x and y are separate draws, so a position does not sit on a diagonal
function place(key) {
    return {
        x: hashString(key) / 4294967296,
        y: hashString(key + "#y") / 4294967296
    };
}

// Stronger access points first. Equal strengths keep their order, so the same scan gives the same islands.
function islands(aps) {
    var list = [];
    for (var i = 0; Array.isArray(aps) && i < aps.length; i++) {
        var ap = aps[i];
        if (!ap || typeof ap.bssid !== "string" || ap.bssid === "")
            continue;
        list.push({
            bssid: ap.bssid,
            strength: num(ap.strength) ? clamp(ap.strength, 0, 100) : 0,
            order: i
        });
    }
    list.sort(function (a, b) {
        return b.strength - a.strength || a.order - b.order;
    });

    return list.slice(0, MAX_ISLANDS).map(function (ap) {
        var p = place(ap.bssid);
        return {
            x: p.x,
            y: p.y,
            height: ISLAND_BASE + ISLAND_SPAN * ap.strength / 100,
            radius: ISLAND_RADIUS
        };
    });
}

// Addresses come in either case depending on the tool that listed them
function groves(macs) {
    var seen = {}, out = [];
    for (var i = 0; Array.isArray(macs) && i < macs.length && out.length < MAX_GROVES; i++) {
        if (typeof macs[i] !== "string" || macs[i] === "")
            continue;
        var mac = macs[i].toLowerCase();
        if (seen[mac])
            continue;
        seen[mac] = true;
        out.push(place(mac));
    }
    return out;
}

function seedFor(ssid) {
    return hashString(typeof ssid === "string" && ssid !== "" ? ssid : "none");
}

// Names the saved world of a network without writing the network name to disk
function worldKey(ssid) {
    return ("00000000" + seedFor(ssid).toString(16)).slice(-8);
}

// A missing next reading keeps the old value, and a missing old value takes the new one
function smooth(prev, next, alpha) {
    var a = num(alpha) ? alpha : 0.2;
    if (!num(prev))
        return next;
    if (!num(next))
        return prev;
    return prev + (next - prev) * a;
}

// Keeps the worlds seen most recently, as a new object. A world without a usable time is the first to go.
function pruneWorlds(worlds, max) {
    var limit = num(max) ? max : 5;
    var out = {};
    if (!worlds || typeof worlds !== "object")
        return out;
    var keys = Object.keys(worlds);
    var last = function (k) {
        return worlds[k] && num(worlds[k].last) ? worlds[k].last : -Infinity;
    };
    keys.sort(function (a, b) {
        return last(b) < last(a) ? -1 : last(b) > last(a) ? 1 : 0;
    });
    keys.slice(0, Math.max(0, limit)).forEach(function (k) {
        out[k] = worlds[k];
    });
    return out;
}
