import QtQuick
import QtQuick.Effects

// The profile picture in a rounded shape, or a person icon. `sources` are tried in order
Item {
    id: root

    required property var sources
    property int tried

    // The M3 clam shell of the lock screen is not available here, so the corners are just rounded
    readonly property real corner: width * 0.36

    onSourcesChanged: tried = 0

    Rectangle {
        id: shape

        anchors.fill: parent
        radius: root.corner
        color: Theme.m3surfaceContainerHighest
        layer.enabled: true
    }

    Icon {
        anchors.centerIn: parent
        name: "person"
        fallback: "☺"
        size: root.width / 2.6
        color: Theme.m3onSurfaceVariant
        visible: picture.status !== Image.Ready
    }

    Image {
        id: picture

        anchors.fill: parent
        source: root.sources[root.tried] ?? ""
        sourceSize: Qt.size(width * 2, height * 2)
        fillMode: Image.PreserveAspectCrop
        asynchronous: true
        visible: false
        onStatusChanged: {
            if (status === Image.Error && root.tried < root.sources.length - 1)
                root.tried++;
        }
    }

    MultiEffect {
        anchors.fill: parent
        source: picture
        maskEnabled: true
        maskSource: shape
        visible: picture.status === Image.Ready
    }
}
