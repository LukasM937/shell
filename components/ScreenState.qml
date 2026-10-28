import Quickshell

PersistentProperties {
    required property ShellScreen modelData

    // Drawer visibilities
    property bool bar
    property bool osd
    property bool session
    property bool launcher
    property bool dashboard
    property bool utilities
    property bool sidebar

    // Launcher search text, kept in sync with the search bar so it can be opened in a mode
    property string launcherText

    // Dashboard state
    property int dashboardTab
    property date dashboardDate: new Date()
}
