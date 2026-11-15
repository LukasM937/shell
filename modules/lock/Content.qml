import QtQuick
import QtQuick.Layouts
import Caelestia.Config
import qs.components
import qs.services

RowLayout {
    id: root

    required property var lock
    // The cards sit padding.extraLargeIncreased / 2 inside the lock's outer corners (radius extraLarge * 1.5), so their outer
    // corners need that radius minus the gap to keep the gap even all the way round the corner
    readonly property real cornerRadius: Math.max(Tokens.rounding.medium, Tokens.rounding.extraLarge * 1.5 - Tokens.padding.extraLargeIncreased / 2)

    spacing: Tokens.spacing.largeIncreased * 2

    ColumnLayout {
        Layout.fillWidth: true
        spacing: Tokens.spacing.medium

        WeatherInfo {
            Layout.fillWidth: true
            topLeftRadius: root.cornerRadius
            rootHeight: root.height
        }

        Fetch {
            Layout.fillWidth: true
            rootHeight: root.height
        }

        Media {
            Layout.fillWidth: true
            Layout.fillHeight: true
            bottomLeftRadius: root.cornerRadius
            lock: root.lock
        }
    }

    Center {
        lock: root.lock
    }

    ColumnLayout {
        Layout.fillWidth: true
        spacing: Tokens.spacing.medium

        Resources {
            Layout.fillWidth: true
            topRightRadius: root.cornerRadius
        }

        StyledRect {
            Layout.fillWidth: true
            Layout.fillHeight: true

            radius: Tokens.rounding.medium
            color: Colours.tPalette.m3surfaceContainer

            bottomRightRadius: root.cornerRadius

            NotifDock {
                lock: root.lock
            }
        }
    }
}
