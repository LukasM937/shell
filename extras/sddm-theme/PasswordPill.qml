import QtQuick

// The password field of the lock screen: a pill with a lock icon, one blob per typed character and an enter button
Rectangle {
    id: root

    required property string text
    required property bool busy
    required property real ui
    required property int centerWidth
    property bool showPassword
    property string placeholder: "Enter your password"

    readonly property real fullWidth: centerWidth * 0.8
    readonly property real cell: 18 * ui
    readonly property real iconSize: 24 * ui
    readonly property int inner: Math.round(44 * ui)

    signal submit

    function sync(): void {
        while (chars.count < text.length)
            chars.append({
                "ch": text[chars.count]
            });
        while (chars.count > text.length)
            chars.remove(chars.count - 1);
        for (let i = 0; i < chars.count; i++)
            chars.setProperty(i, "ch", text[i]);
        if (!text)
            showPassword = false;
        list.positionViewAtEnd();
    }

    onTextChanged: sync()

    implicitWidth: text ? fullWidth : Math.min(fullWidth, placeholderMetrics.width + inner * 2 + Theme.spacingMedium * 2 + Theme.paddingMedium * 2)
    implicitHeight: inner + Theme.paddingSmall * 2
    radius: Theme.roundingFull
    color: Theme.m3surfaceContainer

    Behavior on implicitWidth {
        NumberAnimation {
            duration: 350
            easing.type: Easing.BezierSpline
            easing.bezierCurve: Theme.fastSpatial
        }
    }

    ListModel {
        id: chars
    }

    TextMetrics {
        id: placeholderMetrics

        text: root.placeholder
        font: placeholder.font
    }

    Text {
        id: placeholder

        anchors.centerIn: parent
        anchors.verticalCenterOffset: 1
        text: root.busy ? "Loading..." : root.placeholder
        color: root.busy ? Theme.m3secondary : Theme.m3outline
        opacity: root.text ? 0 : 1
        renderType: Text.NativeRendering
        font.family: Theme.sans
        font.pointSize: 14 * root.ui
        font.variableAxes: ({
                "wght": 400,
                "wdth": 110,
                "ROND": 25,
                "opsz": 14 * root.ui
            })

        Behavior on opacity {
            NumberAnimation {
                duration: 200
                easing.type: Easing.BezierSpline
                easing.bezierCurve: Theme.defaultEffects
            }
        }
    }

    ListView {
        id: list

        anchors.centerIn: parent
        width: Math.min(contentWidth, root.width - root.inner * 2 - Theme.spacingMedium * 2 - Theme.paddingMedium)
        height: root.cell * 1.5
        orientation: Qt.Horizontal
        interactive: false
        clip: true
        spacing: Theme.paddingExtraSmall
        model: chars

        delegate: Item {
            id: char

            required property int index
            required property string ch
            readonly property int variant: Math.floor(Math.random() * 4)

            width: root.cell * 1.3
            height: list.height

            Rectangle {
                id: blob

                anchors.centerIn: parent
                width: root.cell * 1.5
                height: width
                color: Theme.m3onSurface
                radius: char.variant === 0 ? width / 2 : width * 0.28
                rotation: char.variant === 2 ? 45 : 0
                scale: 0
                opacity: root.showPassword ? 0 : 1

                Behavior on opacity {
                    NumberAnimation {
                        duration: 200
                    }
                }

                // Pops in as a random shape, then settles into a dot
                SequentialAnimation {
                    running: true

                    NumberAnimation {
                        target: blob
                        property: "scale"
                        from: 0
                        to: 1
                        duration: 350
                        easing.type: Easing.BezierSpline
                        easing.bezierCurve: Theme.fastSpatial
                    }
                    PauseAnimation {
                        duration: 180
                    }
                    ParallelAnimation {
                        NumberAnimation {
                            target: blob
                            property: "scale"
                            to: 2 / 3
                            duration: 350
                            easing.type: Easing.BezierSpline
                            easing.bezierCurve: Theme.fastSpatial
                        }
                        NumberAnimation {
                            target: blob
                            property: "radius"
                            to: blob.width / 2
                            duration: 350
                        }
                        NumberAnimation {
                            target: blob
                            property: "rotation"
                            to: 0
                            duration: 350
                        }
                    }
                }
            }

            Text {
                anchors.centerIn: parent
                text: char.ch
                color: Theme.m3onSurface
                opacity: root.showPassword ? 1 : 0
                renderType: Text.NativeRendering
                font.family: Theme.sans
                font.pointSize: 14 * root.ui

                Behavior on opacity {
                    NumberAnimation {
                        duration: 200
                    }
                }
            }
        }
    }

    Item {
        id: lockWrapper

        anchors.left: parent.left
        anchors.leftMargin: Theme.paddingSmall
        anchors.verticalCenter: parent.verticalCenter
        width: root.inner
        height: root.inner

        Rectangle {
            anchors.fill: parent
            radius: width / 2
            color: Theme.m3onSurfaceVariant
            opacity: lockMouse.containsMouse ? 0.08 : 0
        }

        Icon {
            id: lockIcon

            anchors.centerIn: parent
            name: root.busy ? "progress_activity" : root.showPassword ? "visibility" : "lock"
            fallback: root.busy ? "…" : root.showPassword ? "◉" : "•"
            size: root.iconSize
            color: Theme.m3onSurfaceVariant
            filled: root.showPassword

            RotationAnimator on rotation {
                running: root.busy
                from: 0
                to: 360
                duration: 1000
                loops: Animation.Infinite
            }
        }

        MouseArea {
            id: lockMouse

            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onClicked: root.showPassword = root.text ? !root.showPassword : false
        }
    }

    Item {
        id: enter

        anchors.right: parent.right
        anchors.rightMargin: Theme.paddingSmall
        anchors.verticalCenter: parent.verticalCenter
        width: root.inner
        height: root.inner

        Rectangle {
            anchors.centerIn: parent
            width: parent.width
            height: width
            radius: root.text ? width * 0.3 : width / 2
            color: root.text ? Theme.m3primary : Theme.m3surfaceContainerHigh
            scale: !root.text ? 1 : enterMouse.pressed ? 0.8 : enterMouse.containsMouse ? 0.95 : 0.9

            Behavior on color {
                ColorAnimation {
                    duration: 200
                }
            }
            Behavior on radius {
                NumberAnimation {
                    duration: 350
                    easing.type: Easing.BezierSpline
                    easing.bezierCurve: Theme.fastSpatial
                }
            }
            Behavior on scale {
                NumberAnimation {
                    duration: 350
                    easing.type: Easing.BezierSpline
                    easing.bezierCurve: Theme.fastSpatial
                }
            }
        }

        Icon {
            anchors.centerIn: parent
            name: "arrow_forward"
            fallback: "→"
            size: root.iconSize * 1.2
            color: root.text ? Theme.m3onPrimary : Theme.m3onSurfaceVariant
        }

        MouseArea {
            id: enterMouse

            anchors.fill: parent
            hoverEnabled: true
            cursorShape: root.text ? Qt.PointingHandCursor : Qt.ArrowCursor
            onClicked: root.submit()
        }
    }
}
