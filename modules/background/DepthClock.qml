pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Effects
import Quickshell
import Caelestia.Config
import Caelestia.I18n
import qs.components
import qs.services
import qs.utils

// Depth-effect clock: the time sits behind a foreground cutout of the wallpaper, the date and a
// binary clock float in front. Everything is laid out by an external generator that writes
// $XDG_STATE_HOME/caelestia/depth-clock/layout.json (positions as screen fractions). Without that
// file, or while it still describes another wallpaper, nothing is shown.
Item {
    id: root

    readonly property var layout: ClockStyle.layout
    readonly property var timeConf: layout.time ?? {}
    readonly property var dayConf: layout.day ?? {}
    readonly property var dateConf: layout.date ?? {}
    readonly property var binaryConf: layout.binary ?? {}
    readonly property var backdropConf: layout.backdrop ?? {}
    readonly property bool ready: layout.enabled === true && layout.wallpaper === Wallpapers.actualCurrent

    // Parallax: offset is the smoothed cursor position (-1..1), set by the background window
    property vector2d offset
    readonly property var parallaxConf: layout.parallax ?? {}
    readonly property bool parallaxActive: ready && parallaxConf.enabled === true && depthImage.status === Image.Ready
    readonly property vector2d shaderOffset: offset.times(-(parallaxConf.strength ?? 0))
    readonly property real shaderZoom: 1 + 2 * (parallaxConf.strength ?? 0)
    readonly property Image depthTexture: depthImage

    anchors.fill: parent
    opacity: ready ? 1 : 0
    visible: opacity > 0

    Behavior on opacity {
        Anim {
            type: Anim.SlowEffects
        }
    }

    SystemClock {
        id: clock

        precision: root.binaryConf.enabled && root.binaryConf.seconds ? SystemClock.Seconds : SystemClock.Minutes
    }

    // Behind the scenery: day name and time
    Item {
        anchors.fill: parent

        layer.enabled: true
        layer.effect: MultiEffect {
            shadowEnabled: true
            shadowColor: Colours.palette.m3shadow
            shadowOpacity: 0.4
            shadowBlur: 0.8
        }

        Text {
            readonly property real px: Math.max(1, (root.dayConf.size ?? 0.05) * root.height)

            text: Tr.formatDateTime(clock.date, "dddd").toUpperCase()
            color: `#${root.dayConf.colour ?? "ffffff"}`
            font.family: root.dayConf.font ?? ""
            font.pixelSize: px
            font.letterSpacing: (root.dayConf.spacing ?? 0) * px
            // Letter spacing is also added after the last letter, so leave it out when centring
            x: (root.dayConf.cx ?? 0.5) * root.width - (implicitWidth - font.letterSpacing) / 2
            y: (root.dayConf.baseline ?? 0.3) * root.height - baselineOffset
        }

        OutlineText {
            text: Tr.formatDateTime(clock.date, Units.twelveHourClock ? "h:mm" : "hh:mm")
            colour: `#${root.timeConf.colour ?? "ffffff"}`
            outline: root.timeConf.style === "outline"
            strokeWidth: Math.max(1, (root.timeConf.stroke ?? 0.004) * root.height)
            font.family: root.timeConf.font ?? ""
            font.pixelSize: Math.max(1, (root.timeConf.size ?? 0.3) * root.height)
            font.weight: root.timeConf.weight ?? Font.Bold
            font.variableAxes: root.timeConf.axes ?? {}
            x: (root.timeConf.cx ?? 0.5) * root.width - implicitWidth / 2
            y: (root.timeConf.baseline ?? 0.6) * root.height - baselineOffset
        }
    }

    Image {
        id: depthImage

        visible: false
        source: root.parallaxConf.depthMap ? `file://${root.parallaxConf.depthMap}` : ""
        asynchronous: true
        cache: false
    }

    // The scenery in front of the time: wallpaper cutout from the depth map, aligned like the wallpaper
    Image {
        anchors.fill: parent

        layer.enabled: root.parallaxActive
        layer.effect: ParallaxEffect {
            depthMap: root.depthTexture
            offset: root.shaderOffset
            focusDepth: root.parallaxConf.focus ?? 0
            zoom: root.shaderZoom
        }

        visible: !!root.layout.foreground
        source: root.layout.foreground ? `file://${root.layout.foreground}` : ""
        fillMode: Image.PreserveAspectCrop
        asynchronous: true
        cache: false
        sourceSize: {
            const dpr = (QsWindow.window as QsWindow)?.devicePixelRatio ?? 1;
            return Qt.size(width * dpr, height * dpr);
        }
    }

    // Soft blurred plate behind date and binary clock, set by the generator when the scenery there is busy
    Item {
        readonly property real pad: dateText.font.pixelSize * 1.2

        visible: (root.backdropConf.opacity ?? 0) > 0
        x: Math.min(dateText.x, binary.x) - pad * 2
        y: dateText.y - pad
        width: Math.max(dateText.x + dateText.width, binary.x + binary.width) - x + pad * 2
        height: binary.y + (binary.visible ? binary.height : 0) - y + pad
        opacity: root.backdropConf.opacity ?? 0

        layer.enabled: visible
        layer.effect: MultiEffect {
            blurEnabled: true
            blur: 1
            blurMax: 64
        }

        Rectangle {
            anchors.fill: parent
            radius: height / 2
            color: `#${root.backdropConf.colour ?? "000000"}`
        }
    }

    // In front of everything: date and binary clock
    Item {
        anchors.fill: parent

        layer.enabled: true
        layer.effect: MultiEffect {
            shadowEnabled: true
            shadowColor: Colours.palette.m3shadow
            shadowOpacity: 0.5
            shadowBlur: 0.5
        }

        Text {
            id: dateText

            readonly property int year: clock.date.getFullYear() + (root.dateConf.humanEra ? 10000 : 0)
            readonly property real px: Math.max(1, (root.dateConf.size ?? 0.025) * root.height)

            text: `- ${Tr.formatDateTime(clock.date, "MMMM d")}, ${year} -`.toUpperCase()
            color: `#${root.dateConf.colour ?? "ffffff"}`
            font.family: root.dateConf.font ?? ""
            font.pixelSize: px
            font.weight: root.dateConf.weight ?? Font.Medium
            font.letterSpacing: px * 0.08
            x: (root.dateConf.cx ?? 0.5) * root.width - implicitWidth / 2
            y: (root.dateConf.baseline ?? 0.8) * root.height - baselineOffset
        }

        // Binary-coded decimal: one column per digit (HH MM SS), least significant bit at the bottom
        Row {
            id: binary

            readonly property real dot: (root.binaryConf.dot ?? 0.016) * root.height
            // Not locale formatted: the digits are parsed, so they must stay ASCII
            readonly property string digits: Qt.formatDateTime(clock.date, root.binaryConf.seconds ? "hhmmss" : "hhmm")
            readonly property color colour: `#${root.binaryConf.colour ?? "ffffff"}`

            visible: root.binaryConf.enabled === true
            spacing: dot * 0.55
            x: (root.binaryConf.cx ?? 0.5) * root.width - width / 2
            y: (root.binaryConf.top ?? 0.85) * root.height

            Repeater {
                model: binary.digits.length

                Column {
                    id: digitColumn

                    required property int index
                    readonly property int value: parseInt(binary.digits[index])

                    spacing: binary.dot * 0.55
                    // Extra gap between hours, minutes and seconds
                    rightPadding: index % 2 === 1 && index < binary.digits.length - 1 ? binary.dot * 1.1 : 0

                    Repeater {
                        model: 4

                        Rectangle {
                            required property int index
                            readonly property bool on: (digitColumn.value >> (3 - index)) & 1

                            width: binary.dot
                            height: binary.dot
                            radius: width / 2
                            color: binary.colour
                            opacity: on ? 1 : 0.18

                            Behavior on opacity {
                                Anim {
                                    type: Anim.StandardSmall
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
