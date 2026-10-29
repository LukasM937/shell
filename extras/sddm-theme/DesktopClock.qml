import QtQuick
import QtQuick.Layouts

// Day name, time and date in the fonts, outline and colours of the desktop's depth clock. The time is fitted to the
// column, and the day and date keep the desktop's proportions to it
ColumnLayout {
    id: root

    required property date now
    required property int centerWidth

    readonly property string hourStr: String(Theme.twelveHour ? now.getHours() % 12 || 12 : now.getHours()).padStart(2, "0")
    readonly property real timePx: Math.max(1, centerWidth * 0.9 / Math.max(1, fit.width) * fit.font.pixelSize)
    // Pixels per screen-height fraction of the desktop layout
    readonly property real unit: timePx / Math.max(0.01, Theme.timeSize)

    spacing: Theme.spacingSmall

    TextMetrics {
        id: fit

        text: "88:88"
        font.family: Theme.timeFamily
        font.pixelSize: 100
        font.weight: Theme.timeWeight
        font.variableAxes: Theme.timeAxes
    }

    Text {
        readonly property real px: Math.max(18, Theme.daySize * root.unit)

        // Letter spacing is also added after the last letter, so balance it for centring
        Layout.leftMargin: font.letterSpacing
        Layout.alignment: Qt.AlignHCenter
        text: Qt.locale().toString(root.now, "dddd").toUpperCase()
        color: Theme.dayColour
        renderType: Text.NativeRendering
        font.family: Theme.dayFamily
        font.pixelSize: px
        font.letterSpacing: Theme.daySpacing * px
    }

    OutlineText {
        Layout.alignment: Qt.AlignHCenter
        text: `${root.hourStr}:${Qt.formatTime(root.now, "mm")}`
        colour: Theme.timeColour
        outline: Theme.timeOutline
        strokeWidth: Math.max(1, Theme.timeStroke * root.unit)
        font.family: Theme.timeFamily
        font.pixelSize: root.timePx
        font.weight: Theme.timeWeight
        font.variableAxes: Theme.timeAxes
    }

    Text {
        readonly property int year: root.now.getFullYear() + (Theme.dateHumanEra ? 10000 : 0)
        readonly property real px: Math.max(15, Theme.dateSize * root.unit)

        Layout.alignment: Qt.AlignHCenter
        text: `- ${Qt.locale().toString(root.now, "MMMM d")}, ${year} -`.toUpperCase()
        color: Theme.dateColour
        renderType: Text.NativeRendering
        font.family: Theme.dateFamily
        font.pixelSize: px
        font.weight: Theme.dateWeight
        font.letterSpacing: px * 0.08
    }
}
