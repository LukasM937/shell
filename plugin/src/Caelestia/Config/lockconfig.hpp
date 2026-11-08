#pragma once

#include <qstring.h>

#include "settings/objectnode.hpp"
#include "common.hpp"

namespace caelestia::shell::config {

using Qt::StringLiterals::operator""_s;

class LockScreensaver : public settings::ObjectNode {
    CONFIG_NODE(LockScreensaver, settings::ObjectNode)

    CONFIG_GLOBAL_PROPERTY(bool, enabled, true)
    CONFIG_GLOBAL_PROPERTY(int, speed, 1)
    CONFIG_GLOBAL_PROPERTY(bool, eventLog, true)
    CONFIG_GLOBAL_PROPERTY(bool, wifi, true)
    CONFIG_GLOBAL_PROPERTY(bool, bluetooth, true)
    CONFIG_GLOBAL_PROPERTY(bool, ping, true)
    CONFIG_GLOBAL_PROPERTY(QString, pingHost, u"1.1.1.1"_s)
    CONFIG_GLOBAL_PROPERTY(bool, neighbours, false)
    CONFIG_GLOBAL_PROPERTY(bool, heat, true)
};

class LockConfig : public settings::ObjectNode {
    CONFIG_NODE(LockConfig, settings::ObjectNode)

    CONFIG_PROPERTY(bool, enabled, true)
    CONFIG_PROPERTY(bool, useWallpaper, false)
    CONFIG_PROPERTY(bool, recolourLogo, true)
    CONFIG_GLOBAL_PROPERTY(bool, enableFprint, true)
    CONFIG_GLOBAL_PROPERTY(int, maxFprintTries, 3)
    CONFIG_GLOBAL_PROPERTY(bool, enableHowdy, true)
    CONFIG_GLOBAL_PROPERTY(int, maxHowdyTries, 3)
    CONFIG_GLOBAL_PROPERTY(bool, triggerHowdyOnWake, true)
    CONFIG_PROPERTY(bool, hideNotifs, false)
    CONFIG_GLOBAL_PROPERTY(bool, enableSessionControls, false)
    CONFIG_GLOBAL_SUBOBJECT(LockScreensaver, screensaver)
};

} // namespace caelestia::shell::config
