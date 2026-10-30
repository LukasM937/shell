import QtQuick
import QtQuick.Effects

// The profile picture in a rounded shape. Without one, the mascot (the gif of the shell's session menu), or else a
// person icon. `sources` are the pictures to try in order
Item {
    id: root

    required property var sources
    required property var mascot
    required property real mascotSpeed
    property int tried

    readonly property bool hasPicture: picture.status === Image.Ready
    readonly property bool hasMascot: !hasPicture && mascotImage.status === Image.Ready

    // The M3 clam shell of the lock screen is not available here, so the corners are just rounded
    readonly property real corner: width * 0.36

    onSourcesChanged: tried = 0

    Rectangle {
        id: shape

        anchors.fill: parent
        radius: root.corner
        color: Theme.m3surfaceContainerHighest
        visible: !root.hasMascot
        layer.enabled: true
    }

    Icon {
        anchors.centerIn: parent
        name: "person"
        fallback: "☺"
        size: root.width / 2.6
        color: Theme.m3onSurfaceVariant
        visible: !root.hasPicture && !root.hasMascot
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
        visible: root.hasPicture
    }

    // Crisp when it is blown up, as pixel art wants, smooth when it is shrunk
    AnimatedImage {
        id: mascotImage

        anchors.fill: parent
        source: root.hasPicture ? "" : root.mascot
        speed: root.mascotSpeed
        playing: visible
        fillMode: Image.PreserveAspectFit
        smooth: implicitWidth >= width
        asynchronous: true
        visible: root.hasMascot
    }
}
