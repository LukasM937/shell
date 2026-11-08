import QtQuick
import QtQuick.Layouts
import Caelestia.Config
import Caelestia.I18n
import qs.components.controls
import qs.modules.lock
import qs.modules.nexus.common
import "../../../daemons/idlechain.js" as IdleChain

PageBase {
    id: root

    // Lock screen backgrounds, ordered to match lock.useWallpaper (false, true)
    readonly property list<MenuItem> backgroundItems: [
        MenuItem {
            text: Tr.trCtx("Blurred screen", "lock screen background")
            icon: "blur_on"
        },
        MenuItem {
            text: Tr.trCtx("Blurred wallpaper", "lock screen background")
            icon: "wallpaper"
        }
    ]

    // The chain as the daemon will run it. The timeline reads the config object itself, which keeps the binding live
    readonly property var timeline: IdleChain.timeline(GlobalConfig.general.idle)
    // One literal string per length of the chain, so a translator can order the parts. A stage that is off drops itself
    // and everything after it
    readonly property string timelineText: {
        const t = timeline;
        if (t.displayOffAt !== null)
            // TRANSLATORS: min is the minute unit; %1 to %3 = minutes since the last input
            return Tr.tr("Locks at %1 min, screensaver at %2 min, display off at %3 min").arg(t.lockAt).arg(t.screensaverAt).arg(t.displayOffAt);
        if (t.screensaverAt !== null)
            // TRANSLATORS: min is the minute unit; %1 and %2 = minutes since the last input
            return Tr.tr("Locks at %1 min, screensaver at %2 min").arg(t.lockAt).arg(t.screensaverAt);
        if (t.lockAt !== null)
            // TRANSLATORS: min is the minute unit; %1 = minutes since the last input
            return Tr.tr("Locks at %1 min").arg(t.lockAt);
        return Tr.tr("Nothing happens automatically");
    }

    title: Tr.tr("Lock screen & screensaver")

    ColumnLayout {
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.top: parent.top
        width: root.cappedWidth
        spacing: Tokens.spacing.extraSmall / 2

        // Idle chain
        SectionHeader {
            first: true
            text: Tr.tr("Idle chain")
        }

        StepperRow {
            first: true
            label: Tr.tr("Lock after")
            subtext: Tr.tr("Minutes without input before the session locks, 0 for never")
            value: GlobalConfig.general.idle.lockAfter
            from: 0
            to: 1440
            stepSize: 1
            onMoved: v => GlobalConfig.general.idle.lockAfter = Math.round(v)
        }

        StepperRow {
            label: Tr.tr("Screensaver after")
            subtext: Tr.tr("Minutes after locking before the screensaver starts, 0 for never")
            value: GlobalConfig.general.idle.screensaverAfter
            from: 0
            to: 1440
            stepSize: 1
            onMoved: v => GlobalConfig.general.idle.screensaverAfter = Math.round(v)
        }

        StepperRow {
            label: Tr.tr("Display off after")
            subtext: Tr.tr("Minutes after the screensaver starts before the display turns off, 0 for never")
            value: GlobalConfig.general.idle.displayOffAfter
            from: 0
            to: 1440
            stepSize: 1
            onMoved: v => GlobalConfig.general.idle.displayOffAfter = Math.round(v)
        }

        InfoRow {
            icon: "timeline"
            label: root.timelineText
            subtext: Tr.tr("Counted from the last input")
        }

        ToggleRow {
            text: Tr.tr("Sleep when the display is off")
            subtext: Tr.tr("Suspend the computer once the display has turned off")
            checked: GlobalConfig.general.idle.sleepWhenDisplayOff
            onToggled: GlobalConfig.general.idle.sleepWhenDisplayOff = checked
        }

        ToggleRow {
            text: Tr.tr("Lock before sleep")
            subtext: Tr.tr("Lock the session before the computer suspends")
            checked: GlobalConfig.general.idle.lockBeforeSleep
            onToggled: GlobalConfig.general.idle.lockBeforeSleep = checked
        }

        StepperRow {
            label: Tr.tr("Busy CPU threshold")
            // TRANSLATORS: CPU is a hardware abbreviation, leave it untranslated
            subtext: Tr.tr("Average CPU use over five minutes that holds the chain back (%)")
            value: GlobalConfig.general.idle.busyCpuPercent
            from: 1
            to: 100
            stepSize: 5
            onMoved: v => GlobalConfig.general.idle.busyCpuPercent = Math.round(v)
        }

        StepperRow {
            label: Tr.tr("Busy network threshold")
            // TRANSLATORS: KB/s is the kilobytes per second unit, leave it untranslated
            subtext: Tr.tr("Average traffic over five minutes that holds the chain back (KB/s)")
            value: GlobalConfig.general.idle.busyNetworkKBs
            from: 1
            to: 100000
            stepSize: 50
            onMoved: v => GlobalConfig.general.idle.busyNetworkKBs = Math.round(v)
        }

        ToggleRow {
            text: Tr.tr("Pause while audio plays")
            subtext: Tr.tr("Do not run the chain while a media player is playing")
            checked: GlobalConfig.general.idle.inhibitWhenAudio
            onToggled: GlobalConfig.general.idle.inhibitWhenAudio = checked
        }

        ToggleRow {
            last: true
            text: Tr.tr("Pause while charging")
            subtext: Tr.tr("Do not run the chain while the battery is charging")
            checked: GlobalConfig.general.idle.inhibitWhenCharging
            onToggled: GlobalConfig.general.idle.inhibitWhenCharging = checked
        }

        // Lock screen
        SectionHeader {
            text: Tr.tr("Lock screen")
        }

        ToggleRow {
            first: true
            text: Tr.tr("Enable lock screen")
            checked: GlobalConfig.lock.enabled
            onToggled: GlobalConfig.lock.enabled = checked
        }

        SelectRow {
            label: Tr.tr("Background")
            subtext: Tr.tr("What is blurred behind the lock screen")
            menuItems: root.backgroundItems
            active: root.backgroundItems[GlobalConfig.lock.useWallpaper ? 1 : 0]
            onSelected: item => GlobalConfig.lock.useWallpaper = root.backgroundItems.indexOf(item) === 1
        }

        NavRow {
            icon: "wallpaper"
            text: Tr.tr("Wallpaper & style")
            subtext: Tr.tr("Choose the wallpaper and colours")
            onClicked: root.nState.currentPageIdx = 0 // Wallpaper & style page
        }

        ToggleRow {
            text: Tr.tr("Recolour logo")
            subtext: Tr.tr("Tint the logo with the theme colours")
            checked: GlobalConfig.lock.recolourLogo
            onToggled: GlobalConfig.lock.recolourLogo = checked
        }

        ToggleRow {
            text: Tr.tr("Hide notifications")
            subtext: Tr.tr("Keep notification contents off the lock screen")
            checked: GlobalConfig.lock.hideNotifs
            onToggled: GlobalConfig.lock.hideNotifs = checked
        }

        ToggleRow {
            text: Tr.tr("Session controls")
            subtext: Tr.tr("Show shutdown, reboot and logout on the lock screen")
            checked: GlobalConfig.lock.enableSessionControls
            onToggled: GlobalConfig.lock.enableSessionControls = checked
        }

        ToggleRow {
            text: Tr.tr("Fingerprint")
            subtext: Tr.tr("Unlock with a fingerprint reader")
            checked: GlobalConfig.lock.enableFprint
            onToggled: GlobalConfig.lock.enableFprint = checked
        }

        StepperRow {
            label: Tr.tr("Fingerprint tries")
            subtext: Tr.tr("Attempts before the password is required")
            value: GlobalConfig.lock.maxFprintTries
            from: 1
            to: 10
            stepSize: 1
            onMoved: v => GlobalConfig.lock.maxFprintTries = Math.round(v)
        }

        ToggleRow {
            // TRANSLATORS: Howdy is the name of a face recognition tool, leave it untranslated
            text: Tr.tr("Face unlock (Howdy)")
            subtext: Tr.tr("Unlock with face recognition")
            checked: GlobalConfig.lock.enableHowdy
            onToggled: GlobalConfig.lock.enableHowdy = checked
        }

        StepperRow {
            label: Tr.tr("Face unlock tries")
            subtext: Tr.tr("Attempts before the password is required")
            value: GlobalConfig.lock.maxHowdyTries
            from: 1
            to: 10
            stepSize: 1
            onMoved: v => GlobalConfig.lock.maxHowdyTries = Math.round(v)
        }

        ToggleRow {
            last: true
            text: Tr.tr("Scan on wake")
            subtext: Tr.tr("Start face recognition when the display wakes")
            checked: GlobalConfig.lock.triggerHowdyOnWake
            onToggled: GlobalConfig.lock.triggerHowdyOnWake = checked
        }

        // Screensaver
        SectionHeader {
            text: Tr.tr("Screensaver")
        }

        ToggleRow {
            first: true
            text: Tr.tr("Enable screensaver")
            subtext: Tr.tr("Show a living world over the lock screen")
            checked: GlobalConfig.lock.screensaver.enabled
            onToggled: GlobalConfig.lock.screensaver.enabled = checked
        }

        StepperRow {
            label: Tr.tr("Speed")
            subtext: Tr.tr("World steps per tick, 1 to 4")
            value: GlobalConfig.lock.screensaver.speed
            from: 1
            to: 4
            stepSize: 1
            onMoved: v => GlobalConfig.lock.screensaver.speed = Math.round(v)
        }

        ToggleRow {
            text: Tr.tr("Event log")
            subtext: Tr.tr("Show the latest event along the bottom")
            checked: GlobalConfig.lock.screensaver.eventLog
            onToggled: GlobalConfig.lock.screensaver.eventLog = checked
        }

        ToggleRow {
            text: Tr.tr("Wi-Fi networks")
            subtext: Tr.tr("Nearby networks shape the islands")
            checked: GlobalConfig.lock.screensaver.wifi
            onToggled: GlobalConfig.lock.screensaver.wifi = checked
        }

        ToggleRow {
            text: Tr.tr("Bluetooth devices")
            subtext: Tr.tr("Connected devices feed the springs")
            checked: GlobalConfig.lock.screensaver.bluetooth
            onToggled: GlobalConfig.lock.screensaver.bluetooth = checked
        }

        ToggleRow {
            text: Tr.tr("Ping")
            subtext: Tr.tr("Network latency drives the lightning, only while the screensaver runs")
            checked: GlobalConfig.lock.screensaver.ping
            onToggled: GlobalConfig.lock.screensaver.ping = checked
        }

        TextFieldRow {
            enabled: GlobalConfig.lock.screensaver.ping
            opacity: enabled ? 1 : 0.5
            label: Tr.tr("Ping host")
            subtext: Tr.tr("Address that is pinged")
            value: GlobalConfig.lock.screensaver.pingHost
            placeholderText: "1.1.1.1"
            onEditingFinished: value => {
                const host = value.trim();
                if (host)
                    GlobalConfig.lock.screensaver.pingHost = host;
            }
        }

        ToggleRow {
            text: Tr.tr("Neighbouring devices")
            subtext: Tr.tr("Reads the neighbour table of this machine, nothing is scanned")
            checked: GlobalConfig.lock.screensaver.neighbours
            onToggled: GlobalConfig.lock.screensaver.neighbours = checked
        }

        ToggleRow {
            last: true
            text: Tr.tr("Heat")
            // TRANSLATORS: CPU is a hardware abbreviation, leave it untranslated
            subtext: Tr.tr("The CPU temperature shapes the rain")
            checked: GlobalConfig.lock.screensaver.heat
            onToggled: GlobalConfig.lock.screensaver.heat = checked
        }

        RowButton {
            Layout.topMargin: Tokens.spacing.largeIncreased - parent.spacing

            first: true
            icon: "restart_alt"
            text: Tr.tr("Reset world")
            subtext: Tr.tr("Forget the saved world of this network and start over")
            onClicked: EcoWorld.reset()
        }

        RowButton {
            last: true
            icon: "preview"
            text: Tr.tr("Lock and preview")
            subtext: Tr.tr("Locks the session and shows the screensaver, the password is needed to return")
            onClicked: EcoWorld.preview()
        }
    }
}
