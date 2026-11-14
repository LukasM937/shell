pragma ComponentBehavior: Bound

import "vart.js" as Art
import "vdraw.js" as Draw
import QtQuick

// The village of services/Village.qml as pixel art, cover-fitted on the item. The map is cols x rows tiles of 8 virtual pixels;
// the canvases hold exactly that many pixels and are scaled up without smoothing, so a 1080p screen costs no more than a small
// one. Layers, from the bottom: the ground with everything that stands still (painted when the world changes), people and
// weather (every frame), the dark of the hour, and the lights, which sit above the dark so they glow.
Item {
    id: root

    required property var village
    property bool animated: true
    property int fps: 10

    readonly property var world: village.world
    readonly property int cols: world?.cols ?? 0
    readonly property int rows: world?.rows ?? 0
    // Screen pixels per tile, and per virtual pixel
    readonly property real size: cols > 0 ? Math.max(width / cols, height / rows) : 0
    readonly property real zoom: size / Draw.TILE
    readonly property var env: world?.env ?? ({})
    property var lib: null
    property string libKey
    // The rectangles of the things people can walk behind, from the last paint of the ground
    property var covers: []
    // Animation time in seconds; the smoke, the fire and the rain are all functions of it
    property real clock: Date.now() / 1000 % 100000
    property string groundKey
    property var tint: [255, 255, 255, 0]

    // Everything on the ground layer that depends on more than the world's own changes
    function stageKey(): string {
        const e = env;
        return `${e.season}|${Math.round((e.snowCover ?? 0) * 8)}|${e.ice ? 1 : 0}|${e.crop ?? 0}`;
    }

    function ensureLib(): void {
        const key = `${env.season}:${(env.snowCover ?? 0) > 0.4}`;
        if (key === libKey)
            return;
        lib = Art.library(env.season ?? "summer", (env.snowCover ?? 0) > 0.4);
        libKey = key;
        ground.requestPaint();
    }

    function paintGround(ctx: var): void {
        if (!world)
            return;
        ensureLib();
        const e = env;
        Draw.paintGround(ctx, world, {
            season: e.season,
            snow: e.snowCover ?? 0,
            ice: e.ice,
            crop: e.crop
        });
        covers = Draw.paintObjects(ctx, world, lib, e);
        world.dirty = false;
    }

    function frame(): void {
        if (!world)
            return;
        clock = Date.now() / 1000 % 100000;
        const key = stageKey();
        if (world.dirty || key !== groundKey) {
            groundKey = key;
            ground.requestPaint();
        }
        live.requestPaint();
    }

    clip: true

    Component.onCompleted: Draw.init(Art)
    onWorldChanged: {
        libKey = "";
        groundKey = "";
        ground.requestPaint();
    }
    onVisibleChanged: {
        if (visible)
            frame();
    }

    Canvas {
        id: ground

        x: (root.width - root.cols * root.size) / 2
        y: (root.height - root.rows * root.size) / 2
        width: root.cols * Draw.TILE
        height: root.rows * Draw.TILE
        scale: root.zoom
        transformOrigin: Item.TopLeft
        smooth: false

        onPaint: root.paintGround(getContext("2d"))
    }

    Canvas {
        id: live

        x: ground.x
        y: ground.y
        width: ground.width
        height: ground.height
        scale: ground.scale
        transformOrigin: Item.TopLeft
        smooth: false

        onPaint: {
            const ctx = getContext("2d");
            ctx.clearRect(0, 0, width, height);
            if (!root.world || !root.lib)
                return;
            Draw.drawDynamic(ctx, root.world, root.lib, root.env, root.clock, root.covers);
            Draw.drawWeather(ctx, root.world, root.env, root.clock);
        }
    }

    // The dark of the hour: warm at the edges of the day, blue at night
    Rectangle {
        anchors.fill: parent
        color: Qt.rgba(root.tint[0] / 255, root.tint[1] / 255, root.tint[2] / 255, root.tint[3])
        visible: root.tint[3] > 0.004
    }

    Canvas {
        id: lights

        x: ground.x
        y: ground.y
        width: ground.width
        height: ground.height
        scale: ground.scale
        transformOrigin: Item.TopLeft
        smooth: false
        visible: (root.env.daylight ?? 1) < 0.9

        onPaint: {
            const ctx = getContext("2d");
            ctx.clearRect(0, 0, width, height);
            if (!root.world || !root.lib)
                return;
            Draw.drawLights(ctx, root.world, root.lib, root.env, root.clock);
        }
    }

    Timer {
        interval: 1000 / Math.max(1, root.fps)
        running: root.visible && root.animated && root.village.running && !!root.world
        repeat: true
        onTriggered: root.frame()
    }

    // The hour changes slowly, so the tint and the lights are renewed a few times a minute
    Timer {
        interval: 4000
        running: root.visible && !!root.world
        repeat: true
        triggeredOnStart: true
        onTriggered: {
            root.tint = Draw.ambient(root.env);
            lights.requestPaint();
        }
    }
}
