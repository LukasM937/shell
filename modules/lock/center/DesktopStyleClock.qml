import QtQuick
import QtQuick.Layouts
import Caelestia.Config
import Caelestia.I18n
import qs.components
import qs.services

// Day name, time and date in the desktop (depth) clock's fonts, outline and colours. The time is
// fitted to the centre column; the day and date keep the desktop's proportions to it.
ColumnLayout {
    id: root

    required property real centerWidth

    readonly property var timeConf: ClockStyle.time
    readonly property var dayConf: ClockStyle.day
    readonly property var dateConf: ClockStyle.date
    readonly property real timePx: Math.max(1, centerWidth * 0.9 / Math.max(1, fitMetrics.width) * fitMetrics.font.pixelSize)
    // Pixels per screen-height fraction of the desktop layout
    readonly property real unit: timePx / Math.max(0.01, timeConf.size ?? 0.3)

    spacing: Tokens.spacing.small

    TextMetrics {
        id: fitMetrics

        text: "88:88"
        font.family: root.timeConf.font ?? ""
        font.pixelSize: 100
        font.weight: root.timeConf.weight ?? Font.Bold
        font.variableAxes: root.timeConf.axes ?? {}
    }

    Text {
        readonly property real px: Math.max(18, (root.dayConf.size ?? 0.05) * root.unit)

        // Letter spacing is also added after the last letter, so balance it for centring
        Layout.leftMargin: font.letterSpacing
        Layout.alignment: Qt.AlignHCenter

        text: Time.format("dddd").toUpperCase()
        color: `#${root.dayConf.colour ?? "ffffff"}`
        font.family: root.dayConf.font ?? ""
        font.pixelSize: px
        font.letterSpacing: (root.dayConf.spacing ?? 0) * px
    }

    OutlineText {
        Layout.alignment: Qt.AlignHCenter

        text: Time.format(Units.twelveHourClock ? "h:mm" : "hh:mm")
        colour: `#${root.timeConf.colour ?? "ffffff"}`
        outline: root.timeConf.style === "outline"
        strokeWidth: Math.max(1, (root.timeConf.stroke ?? 0.004) * root.unit)
        font.family: root.timeConf.font ?? ""
        font.pixelSize: root.timePx
        font.weight: root.timeConf.weight ?? Font.Bold
        font.variableAxes: root.timeConf.axes ?? {}
    }

    Text {
        readonly property int year: Time.date.getFullYear() + (root.dateConf.humanEra ? 10000 : 0)
        readonly property real px: Math.max(15, (root.dateConf.size ?? 0.025) * root.unit)

        Layout.alignment: Qt.AlignHCenter

        text: `- ${Time.format("MMMM d")}, ${year} -`.toUpperCase()
        color: `#${root.dateConf.colour ?? "ffffff"}`
        font.family: root.dateConf.font ?? ""
        font.pixelSize: px
        font.weight: root.dateConf.weight ?? Font.Medium
        font.letterSpacing: px * 0.08
    }
}
