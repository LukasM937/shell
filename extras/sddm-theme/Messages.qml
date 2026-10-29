import QtQuick

// An error in the error colour, or else a hint such as Caps Lock, that scale and fade in and out like on the lock screen
Item {
    id: root

    required property string error
    required property string hint

    implicitHeight: Math.max(errorText.implicitHeight, hintText.implicitHeight)

    Behavior on implicitHeight {
        NumberAnimation {
            duration: 400
            easing.type: Easing.BezierSpline
            easing.bezierCurve: Theme.standard
        }
    }

    Text {
        id: hintText

        anchors.left: parent.left
        anchors.right: parent.right
        text: root.hint || text
        color: Theme.m3onSurfaceVariant
        opacity: root.hint && !root.error ? 1 : 0
        scale: root.hint && !root.error ? 1 : 0.7
        horizontalAlignment: Text.AlignHCenter
        wrapMode: Text.WrapAtWordBoundaryOrAnywhere
        lineHeight: 1.2
        renderType: Text.NativeRendering
        font.family: Theme.sans
        font.pointSize: 12
        font.variableAxes: ({
                "wght": 400,
                "ROND": 25,
                "opsz": 12
            })

        Behavior on opacity {
            NumberAnimation {
                duration: 200
                easing.type: Easing.BezierSpline
                easing.bezierCurve: Theme.defaultEffects
            }
        }
        Behavior on scale {
            NumberAnimation {
                duration: 400
                easing.type: Easing.BezierSpline
                easing.bezierCurve: Theme.standard
            }
        }
    }

    Text {
        id: errorText

        anchors.left: parent.left
        anchors.right: parent.right
        text: root.error || text
        color: Theme.m3error
        opacity: root.error ? 1 : 0
        scale: root.error ? 1 : 0.7
        horizontalAlignment: Text.AlignHCenter
        wrapMode: Text.WrapAtWordBoundaryOrAnywhere
        renderType: Text.NativeRendering
        font.family: Theme.sans
        font.pointSize: 12
        font.variableAxes: ({
                "wght": 400,
                "ROND": 25,
                "opsz": 12
            })

        Behavior on opacity {
            NumberAnimation {
                duration: 200
                easing.type: Easing.BezierSpline
                easing.bezierCurve: Theme.defaultEffects
            }
        }
        Behavior on scale {
            NumberAnimation {
                duration: 400
                easing.type: Easing.BezierSpline
                easing.bezierCurve: Theme.standard
            }
        }
    }
}
