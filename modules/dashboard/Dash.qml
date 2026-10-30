import "dash"
import QtQuick.Layouts
import Caelestia.Config
import qs.components
import qs.components.filedialog
import qs.services

GridLayout {
    id: root

    required property ScreenState screenState
    required property FileDialog facePicker

    rowSpacing: Tokens.spacing.medium
    columnSpacing: Tokens.spacing.medium

    Rect {
        Layout.column: 2
        Layout.columnSpan: 3
        Layout.preferredWidth: Tokens.sizes.dashboard.userWidth
        Layout.fillHeight: true

        radius: Tokens.rounding.medium

        User {
            id: user

            screenState: root.screenState
            facePicker: root.facePicker
        }
    }

    Rect {
        Layout.row: 0
        Layout.columnSpan: 2
        Layout.preferredWidth: Tokens.sizes.dashboard.weatherWidth
        Layout.preferredHeight: weather.implicitHeight

        radius: Tokens.rounding.medium

        SmallWeather {
            id: weather
        }
    }

    Rect {
        Layout.row: 1
        Layout.preferredWidth: dateTime.implicitWidth
        Layout.fillHeight: true

        radius: Tokens.rounding.medium

        DateTime {
            id: dateTime
        }
    }

    Rect {
        Layout.row: 1
        Layout.column: 1
        Layout.columnSpan: 3
        Layout.fillWidth: true
        Layout.preferredHeight: calendar.implicitHeight

        radius: Tokens.rounding.medium

        Calendar {
            id: calendar

            screenState: root.screenState
        }
    }

    Rect {
        Layout.row: 1
        Layout.column: 4
        Layout.preferredWidth: resources.implicitWidth
        Layout.fillHeight: true

        radius: Tokens.rounding.medium

        Resources {
            id: resources
        }
    }

    Rect {
        Layout.row: 0
        Layout.column: 5
        Layout.rowSpan: 2
        Layout.preferredWidth: media.implicitWidth
        Layout.fillHeight: true

        radius: Tokens.rounding.medium

        Media {
            id: media
        }
    }

    component Rect: StyledRect {
        color: Colours.tPalette.m3surfaceContainer
    }
}
