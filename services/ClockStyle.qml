pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io
import qs.utils

// The depth clock's generated layout ($XDG_STATE_HOME/caelestia/depth-clock/layout.json):
// fonts, colours and positions picked for the current wallpaper. Shared so other clocks,
// like the lock screen's, can match the desktop. Empty without the generator.
Singleton {
    id: root

    property var layout: ({})
    readonly property bool available: layout.enabled === true && !!layout.time?.font
    readonly property var time: layout.time ?? {}
    readonly property var day: layout.day ?? {}
    readonly property var date: layout.date ?? {}

    FileView {
        path: `${Paths.state}/depth-clock/layout.json`
        watchChanges: true
        printErrors: false
        onFileChanged: reload()
        onLoaded: {
            try {
                root.layout = JSON.parse(text());
            } catch (e) {
                root.layout = {};
            }
        }
        onLoadFailed: root.layout = {}
    }
}
