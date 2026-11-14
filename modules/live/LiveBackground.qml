import QtQuick
import qs.services
import qs.modules.lock

// The live wallpaper on one screen. Each kind sits in its own loader, so a world that is not the wallpaper costs nothing.
Item {
    id: root

    Loader {
        anchors.fill: parent
        active: LiveWallpaper.kind === "village"

        sourceComponent: VillageView {
            fps: LiveWallpaper.fps
            village: Village
        }
    }

    Loader {
        anchors.fill: parent
        active: LiveWallpaper.kind === "ecosystem"

        sourceComponent: EcoView {
            eco: EcoWorld
        }
    }
}
