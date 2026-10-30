import QtQuick
import QtQuick.Effects
import QtQuick.Layouts
import QtQml

// The login screen of SDDM, in the look of the lock screen of the Caelestia shell
Item {
    id: root

    readonly property real ui: Math.max(0.55, Math.min(1, height / 1440))
    readonly property real controlScale: Math.max(0.75, ui)
    readonly property int centerWidth: Math.round(600 * ui)
    readonly property var user: users[userIndex] ?? null
    // Only the picture sync.py copied: the default picture SDDM falls back to would hide the mascot
    readonly property var faces: user ? [Qt.resolvedUrl(`faces/${user.name}`)] : []
    readonly property string hint: {
        const lines = [];
        if (keyboard.capsLock)
            lines.push("Caps lock is ON.");
        if (keyboard.layouts.length > 1)
            lines.push(`Keyboard layout: ${keyboard.layouts[keyboard.currentLayout]?.longName ?? ""}`);
        return lines.join(" ");
    }

    property date now: new Date()
    property var users: []
    property var sessions: []
    property int userIndex: Math.max(0, userModel.lastIndex)
    property int sessionIndex: Math.max(0, sessionModel.lastIndex)
    property bool busy
    property bool leaving
    property bool sessionMenuOpen
    property string error
    property real shake

    function login(): void {
        if (busy || leaving || !user || !input.text)
            return;
        busy = true;
        error = "";
        sddm.login(user.name, input.text, sessionIndex);
    }

    function switchUser(step: int): void {
        userIndex = (userIndex + step + users.length) % users.length;
        input.text = "";
        error = "";
    }

    focus: true
    onActiveFocusChanged: {
        if (!activeFocus)
            forceActiveFocus();
    }

    Component.onCompleted: {
        input.forceActiveFocus();
        enter.start();
    }

    Timer {
        interval: 1000
        running: true
        repeat: true
        onTriggered: root.now = new Date()
    }

    Instantiator {
        function collect(): void {
            const out = [];
            for (let i = 0; i < count; i++) {
                const o = objectAt(i);
                if (o)
                    out.push(o);
            }
            root.users = out;
        }

        model: userModel
        delegate: QtObject {
            readonly property string name: model.name ?? ""
            readonly property string realName: model.realName || model.name || ""
            readonly property string icon: model.icon ?? ""
        }
        onObjectAdded: collect()
        onObjectRemoved: collect()
    }

    Instantiator {
        function collect(): void {
            const out = [];
            for (let i = 0; i < count; i++)
                out.push(objectAt(i)?.name ?? "");
            root.sessions = out;
        }

        model: sessionModel
        delegate: QtObject {
            readonly property string name: model.name ?? ""
        }
        onObjectAdded: collect()
        onObjectRemoved: collect()
    }

    Connections {
        function onLoginFailed(): void {
            root.busy = false;
            root.error = "Incorrect password. Please try again.";
            input.text = "";
            shakeAnim.restart();
        }

        function onLoginSucceeded(): void {
            root.leaving = true;
            leave.start();
        }

        function onInformationMessage(message: string): void {
            root.error = message;
        }

        target: sddm
    }

    TextInput {
        id: input

        width: 1
        height: 1
        opacity: 0
        focus: true
        echoMode: TextInput.Password
        inputMethodHints: Qt.ImhSensitiveData | Qt.ImhNoPredictiveText
        readOnly: root.busy || root.leaving
        Keys.onReturnPressed: root.login()
        Keys.onEnterPressed: root.login()
        Keys.onEscapePressed: text = ""
        onTextChanged: {
            if (text)
                root.error = "";
        }
    }

    Rectangle {
        id: backdrop

        anchors.fill: parent
        color: Theme.m3surface
    }

    Item {
        id: background

        anchors.fill: parent
        opacity: 0
        layer.enabled: true
        layer.effect: MultiEffect {
            autoPaddingEnabled: false
            blurEnabled: true
            blur: 1
            blurMax: 64
            blurMultiplier: 1
        }

        Image {
            anchors.fill: parent
            source: Theme.background ? Qt.resolvedUrl(Theme.background) : ""
            fillMode: Image.PreserveAspectCrop
            asynchronous: true
            cache: false
        }
    }

    Rectangle {
        id: panel

        anchors.centerIn: parent
        width: content.implicitWidth + Theme.paddingExtraLarge * 2
        height: content.implicitHeight + Theme.paddingExtraLarge * 2
        radius: Theme.roundingExtraLarge * 1.5
        color: Theme.m3surface
        opacity: 0
        scale: 0.85
        layer.enabled: true
        layer.effect: MultiEffect {
            shadowEnabled: true
            blurMax: 15
            shadowColor: Qt.alpha(Theme.m3shadow, 0.7)
        }
    }

    ColumnLayout {
        id: content

        anchors.centerIn: panel
        spacing: Theme.spacingLarge
        opacity: panel.opacity
        scale: panel.scale

        Loader {
            Layout.alignment: Qt.AlignHCenter
            sourceComponent: Theme.desktopClock ? desktopClock : stockClock
        }

        Item {
            Layout.alignment: Qt.AlignHCenter
            Layout.topMargin: 48 * root.ui
            Layout.preferredWidth: root.centerWidth
            Layout.preferredHeight: avatar.height

            Avatar {
                id: avatar

                anchors.horizontalCenter: parent.horizontalCenter
                width: Math.round(root.centerWidth * 0.45)
                height: width
                sources: root.faces
                mascot: Theme.mascot
                mascotSpeed: Theme.mascotSpeed
            }

            IconButton {
                anchors.left: parent.left
                anchors.verticalCenter: avatar.verticalCenter
                icon: "chevron_left"
                fallback: "‹"
                size: 48 * root.controlScale
                visible: root.users.length > 1
                onClicked: root.switchUser(-1)
            }

            IconButton {
                anchors.right: parent.right
                anchors.verticalCenter: avatar.verticalCenter
                icon: "chevron_right"
                fallback: "›"
                size: 48 * root.controlScale
                visible: root.users.length > 1
                onClicked: root.switchUser(1)
            }
        }

        Text {
            Layout.alignment: Qt.AlignHCenter
            Layout.topMargin: -Theme.spacingSmall
            text: root.user?.realName ?? ""
            color: Theme.m3onSurfaceVariant
            renderType: Text.NativeRendering
            font.family: Theme.sans
            font.pointSize: 14
            font.variableAxes: ({
                    "wght": 500,
                    "ROND": 25,
                    "opsz": 14
                })
        }

        PasswordPill {
            id: pill

            Layout.alignment: Qt.AlignHCenter
            text: input.text
            busy: root.busy
            ui: Math.max(0.8, root.ui)
            centerWidth: root.centerWidth
            onSubmit: root.login()

            transform: Translate {
                x: root.shake
            }
        }

        Messages {
            Layout.fillWidth: true
            Layout.preferredWidth: root.centerWidth
            error: root.error
            hint: root.hint
        }

        Rectangle {
            Layout.fillWidth: true
            implicitWidth: footer.implicitWidth + Theme.paddingLarge * 2
            implicitHeight: footer.implicitHeight + Theme.paddingLarge * 2
            radius: Theme.roundingExtraLarge
            color: Theme.m3surfaceContainer

            RowLayout {
                id: footer

                anchors.fill: parent
                anchors.margins: Theme.paddingLarge
                spacing: Theme.spacingSmall

                SessionPicker {
                    id: sessionPicker

                    Layout.preferredHeight: 56 * root.controlScale
                    names: root.sessions
                    current: root.sessionIndex
                    open: root.sessionMenuOpen
                    onToggled: root.sessionMenuOpen = !root.sessionMenuOpen
                }

                Item {
                    Layout.fillWidth: true
                }

                IconButton {
                    icon: "bedtime"
                    fallback: "☾"
                    size: 56 * root.controlScale
                    visible: sddm.canSuspend !== false
                    onClicked: sddm.suspend()
                }

                IconButton {
                    icon: "downloading"
                    fallback: "↓"
                    size: 56 * root.controlScale
                    visible: sddm.canHibernate === true
                    onClicked: sddm.hibernate()
                }

                IconButton {
                    icon: "cached"
                    fallback: "↻"
                    size: 56 * root.controlScale
                    visible: sddm.canReboot !== false
                    onClicked: sddm.reboot()
                }

                IconButton {
                    icon: "power_settings_new"
                    fallback: "⏻"
                    size: 56 * root.controlScale
                    visible: sddm.canPowerOff !== false
                    onClicked: sddm.powerOff()
                }
            }
        }
    }

    SessionMenu {
        anchors.fill: parent
        names: root.sessions
        current: root.sessionIndex
        anchorItem: sessionPicker
        open: root.sessionMenuOpen
        onPicked: index => {
            root.sessionIndex = index;
            root.sessionMenuOpen = false;
        }
        onDismissed: root.sessionMenuOpen = false
    }

    ParallelAnimation {
        id: enter

        NumberAnimation {
            target: background
            property: "opacity"
            to: 1
            duration: 600
            easing.type: Easing.BezierSpline
            easing.bezierCurve: Theme.standard
        }
        NumberAnimation {
            target: panel
            property: "scale"
            to: 1
            duration: 350
            easing.type: Easing.BezierSpline
            easing.bezierCurve: Theme.fastSpatial
        }
        NumberAnimation {
            target: panel
            property: "opacity"
            to: Theme.panelOpacity
            duration: 200
        }
    }

    ParallelAnimation {
        id: leave

        NumberAnimation {
            target: panel
            property: "scale"
            to: 0.85
            duration: 350
            easing.type: Easing.BezierSpline
            easing.bezierCurve: Theme.fastSpatial
        }
        NumberAnimation {
            target: panel
            property: "opacity"
            to: 0
            duration: 200
        }
        NumberAnimation {
            target: background
            property: "opacity"
            to: 0
            duration: 600
        }
    }

    SequentialAnimation {
        id: shakeAnim

        NumberAnimation {
            target: root
            property: "shake"
            to: -14
            duration: 60
        }
        NumberAnimation {
            target: root
            property: "shake"
            to: 14
            duration: 90
        }
        NumberAnimation {
            target: root
            property: "shake"
            to: -8
            duration: 80
        }
        NumberAnimation {
            target: root
            property: "shake"
            to: 0
            duration: 60
        }
    }

    Component {
        id: stockClock

        ColumnLayout {
            spacing: Theme.spacingLarge

            Clock {
                Layout.alignment: Qt.AlignHCenter
                now: root.now
                ui: root.ui
            }

            Text {
                Layout.alignment: Qt.AlignHCenter
                text: Qt.locale().toString(root.now, "dddd • d MMM").toUpperCase()
                color: Theme.m3onSurface
                renderType: Text.NativeRendering
                font.family: Theme.sans
                font.pointSize: 16
                font.variableAxes: ({
                        "wght": 600,
                        "ROND": 25,
                        "opsz": 16
                    })
            }
        }
    }

    Component {
        id: desktopClock

        DesktopClock {
            now: root.now
            centerWidth: root.centerWidth
        }
    }
}
