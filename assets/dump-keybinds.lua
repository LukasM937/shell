-- Prints the Hyprland keybinds as JSON for the launcher's keybind list.
-- It runs the Lua config against a stand-in for the hl API, so nothing is applied, run or written.
-- Usage: lua dump-keybinds.lua [hypr config dir]

local home = os.getenv("HOME")
local dir = arg[1] or ((os.getenv("XDG_CONFIG_HOME") or home .. "/.config") .. "/hypr")
local popen, open = io.popen, io.open
package.path = dir .. "/?.lua;" .. dir .. "/?/init.lua;" .. package.path

-- Descriptions of global shortcuts, e.g. caelestia:launcher -> Toggle launcher
local globals = {}
do
    local p = popen("hyprctl globalshortcuts 2>/dev/null")
    if p then
        for line in p:lines() do
            local name, desc = line:match("^%s*(%S+)%s+%->%s+(.-)%s*$")
            if name then globals[name] = desc end
        end
        p:close()
    end
end

-- The config must not change anything from here
io.open = function(path, mode)
    if mode and mode:find("[wa+]") then return nil, "read-only" end
    return open(path, mode)
end
io.popen = function() return nil, "disabled" end
os.execute = function() return nil end
os.remove = function() return nil, "disabled" end
os.rename = function() return nil, "disabled" end

-- Source lines, cached per file
local sources = {}
local function lines_of(file)
    if not sources[file] then
        local t, f = {}, open(file)
        if f then
            for line in f:lines() do t[#t + 1] = line end
            f:close()
        end
        sources[file] = t
    end
    return sources[file]
end

-- Short whole-line comments like "-- Window actions" head a section
local function heading(line)
    local text = line and line:match("^%s*%-%-%s*(.-)%s*$")
    if not text or text == "" or text:find("^%-") or text:find("[.,:;]") then return nil end
    local _, words = text:gsub("%S+", "")
    return words <= 5 and text or nil
end

-- The heading above a line, or the next one below if a banner or the file start comes first
local function section_of(file, lnum)
    local lines = lines_of(file)
    for i = lnum - 1, math.max(1, lnum - 60), -1 do
        local h = heading(lines[i])
        if h then return h end
        if lines[i] and lines[i]:find("^%s*%-%-%-%-") then break end
    end
    for i = lnum + 1, math.min(#lines, lnum + 15) do
        local h = heading(lines[i])
        if h then return h end
    end
    return nil
end

-- Track which keybind variable was read last, so each bind knows the variable it came from
local var_file = dir .. "/variables.lua"
local var_lines = {}
for i, line in ipairs(lines_of(var_file)) do
    local name = line:match("^%s*([%w_]+)%s*=")
    if name and not var_lines[name] then var_lines[name] = i end
end

local last_var
local real_require = require
function require(name)
    local m = real_require(name)
    if name == "variables" and type(m) == "table" and not getmetatable(m) then
        local wrapped = setmetatable({}, {
            __index = function(_, k)
                if type(k) == "string" and k:find("^kb") then last_var = k end
                return m[k]
            end,
            __newindex = function(_, k, v) m[k] = v end,
            __pairs = function() return next, m, nil end,
        })
        package.loaded[name] = wrapped
        return wrapped
    end
    return m
end

-- Stand-in for hl: any field is another stand-in, calls return a record of what was asked for
local function stub(path)
    return setmetatable({}, {
        __index = function(_, k)
            if type(k) == "string" then return stub(path .. "." .. k) end
        end,
        __call = function(_, ...)
            return setmetatable({ __dsp = path, __args = { ... } }, {
                __index = function(_, k)
                    if type(k) == "string" then return stub(path .. "()." .. k) end
                end,
                __concat = function(a, b) return tostring(a) .. tostring(b) end,
            })
        end,
        __concat = function(a, b) return tostring(a) .. tostring(b) end,
        __tostring = function() return path end,
    })
end

local function var_value(name)
    local vars = package.loaded.variables
    return vars and vars[name]
end

local function var_keys(name)
    local v, keys = var_value(name), {}
    if type(v) == "string" then
        keys[v] = true
    elseif type(v) == "table" then
        for _, k in pairs(v) do keys[k] = true end
    end
    return keys
end

local function caller()
    for level = 3, 8 do
        local info = debug.getinfo(level, "Sl")
        if not info then break end
        if info.what == "main" and info.source:sub(1, 1) == "@" then return info.source:sub(2), info.currentline end
    end
    local info = debug.getinfo(3, "Sl")
    return info.source:sub(2), info.currentline
end

local function describe(action)
    if type(action) == "table" and rawget(action, "__dsp") then
        local path, args = rawget(action, "__dsp"), rawget(action, "__args")
        if path == "hl.dsp.global" then return { kind = "global", detail = tostring(args[1]) } end
        if path == "hl.dsp.exec_cmd" then return { kind = "exec", detail = tostring(args[1]) } end
        local opts = type(args[1]) == "table" and args[1] or {}
        return { kind = "dispatch", detail = path:gsub("^hl%.dsp%.", ""), direction = opts.direction }
    end
    return { kind = "lua", detail = "" }
end

local binds = {}
local DIRECTIONS = { left = true, right = true, up = true, down = true }

hl = stub("hl")
rawset(hl, "bind", function(key, action, flags)
    if type(key) ~= "string" then return end
    local file, lnum = caller()
    local act = describe(action)
    local var = last_var
    local b = { key = key, kind = act.kind, detail = act.detail, file = file, line = lnum, flags = {} }

    for _, f in ipairs({ "locked", "release", "repeating", "mouse" }) do
        if type(flags) == "table" and flags[f] then b.flags[f] = true end
    end

    -- Keep the variable only if this key really comes from it (directly, or as "<mods> + <digit>")
    local value = var and var_value(var)
    if var and var_keys(var)[key] then
        b.var = var
    elseif var and type(value) == "string" and key:sub(1, #value + 3) == value .. " + " and key:sub(#value + 4):match("^%d$") then
        b.var = var
        b.key = value .. " + 0-9"
        b.numbered = true
    end

    -- "<mods> + left/right/up/down" loops become one "<mods> + arrows" entry
    local last = key:match("(%a+)%s*$")
    if not b.var and act.direction and last and DIRECTIONS[last:lower()] then
        b.key = key:gsub("%s*%+%s*[%a]+$", "") .. " + arrows"
    end

    binds[#binds + 1] = b
end)

local ok, err = pcall(dofile, dir .. "/hyprland.lua")

-- Labels
local NAMES = {
    kbWindowPip = "Picture-in-picture",
    kbShowPanels = "Show all panels",
    kbRestoreLock = "Restore the lock screen",
    kbClipboardDel = "Delete clipboard entries",
    kbClipboardPasteLatest = "Type the last clipboard entry",
    kbSpecialWs = "Toggle special workspace",
    kbSystemMonitorWs = "Toggle system monitor",
    kbMusicWs = "Toggle music workspace",
    kbCommunicationWs = "Toggle communication workspace",
    kbTodoWs = "Toggle todo workspace",
    kbNormalizeWindow = "Reset window size",
    kbWindowBorderedFullscreen = "Maximise window",
    kbToggleWindowFloating = "Toggle floating",
    kbMoveWinToWsSpecial = "Move window to special workspace",
    kbMoveWinFromWsSpecial = "Move window out of special workspace",
    kbRecordSound = "Record screen with sound",
    kbRecordRegion = "Record region",
    kbRecord = "Record screen",
    kbSleep = "Sleep",
    kbWindowCycleNext = "Next window",
    kbWindowCyclePrev = "Previous window",
    kbWindowGroupCycleNext = "Next window in group",
    kbWindowGroupCyclePrev = "Previous window in group",
    kbGroupLockActive = "Lock group",
    kbWindowDecreaseWidth = "Decrease window width",
    kbWindowIncreaseWidth = "Increase window width",
    kbWindowDecreaseHeight = "Decrease window height",
    kbWindowIncreaseHeight = "Increase window height",
    kbWindowFullscreen = "Fullscreen",
    kbMoveWinToWsNext = "Move window to next workspace",
    kbMoveWinToWsPrev = "Move window to previous workspace",
    kbVolumeMute = "Mute",
    kbColorPicker = "Colour picker",
    kbEmoji = "Emoji picker",
    kbClipboard = "Clipboard history",
    kbMoveWindow = "Drag to move window",
    kbResizeWindow = "Drag to resize window",
}
-- Commands bound without a variable
local COMMANDS = {
    { "kill;.*caelestia shell", "Restart the shell" },
    { "^qs %-c caelestia kill$", "Quit the shell" },
    { "^notify%-send", "Send a test notification" },
}
-- Key names that read better
local KEY_NAMES = {
    ["mouse:272"] = "Left click",
    ["mouse:273"] = "Right click",
    ["mouse:274"] = "Middle click",
    mouse_up = "Scroll up",
    mouse_down = "Scroll down",
    Page_Up = "Page Up",
    Page_Down = "Page Down",
}
local WORDS = { ws = "workspace", win = "window", prev = "previous", del = "delete" }
local KEYS = {
    XF86AudioRaiseVolume = "Volume up",
    XF86AudioLowerVolume = "Volume down",
    XF86AudioMute = "Mute",
    XF86AudioMicMute = "Mute microphone",
}

local function humanise(var)
    local words = {}
    for w in var:gsub("^kb", ""):gmatch("%u[%l%d]*") do
        local word = w:lower()
        words[#words + 1] = WORDS[word] or word
    end
    local s = table.concat(words, " ")
    return (s:gsub("^%l", string.upper))
end

local function label(b)
    if b.kind == "global" and globals[b.detail] then return globals[b.detail] end
    if b.var then
        local name = NAMES[b.var] or humanise(b.var)
        return b.numbered and name .. " 1-10" or name
    end
    if KEYS[b.key] then return KEYS[b.key] end
    if b.kind == "exec" then
        for _, c in ipairs(COMMANDS) do
            if b.detail:find(c[1]) then return c[2] end
        end
    end
    if b.kind == "dispatch" and b.key:find(" %+ arrows$") then
        if b.detail == "focus" then return "Focus window" end
        if b.detail == "window.move" then return "Move window" end
    end
    return section_of(b.file, b.line) or b.detail
end

-- "Window Actions" and "Window actions" are the same section
local function tidy(section)
    return (section:sub(1, 1):upper() .. section:sub(2):lower())
end

-- Merge binds that do the same thing (same shortcut or command, same variable, or same call), keeping their order
local rows, by_id, by_call = {}, {}, {}
for _, b in ipairs(binds) do
    local section = tidy(b.var and section_of(var_file, var_lines[b.var] or 1) or section_of(b.file, b.line) or "Other")
    local text = label(b)
    local call = b.file .. ":" .. b.line .. "\0" .. b.kind .. "\0" .. b.detail
    local id = (b.kind == "global" or b.kind == "exec") and b.kind .. "\0" .. b.detail or (b.var or text) .. "\0" .. b.kind .. "\0" .. b.detail
    local row = by_id[id] or by_call[call]
    if not row then
        row = { label = text, section = section, kind = b.kind, detail = b.detail, keys = {}, flags = b.flags }
        rows[#rows + 1] = row
    end
    by_id[id] = row
    by_call[call] = row
    local seen = false
    for _, k in ipairs(row.keys) do seen = seen or k == b.key end
    if not seen then row.keys[#row.keys + 1] = b.key end
end
for _, row in ipairs(rows) do
    for i, k in ipairs(row.keys) do
        -- "SUPER + SUPER_L" is just the modifier tapped on its own
        local mod = k:match("^(%u+) %+ %1_[LR]$")
        row.keys[i] = mod or k:gsub("[^%s+]+", KEY_NAMES)
    end
end

-- Minimal JSON encoding
local function encode(v)
    local t = type(v)
    if t == "table" then
        if #v > 0 then
            local out = {}
            for _, x in ipairs(v) do out[#out + 1] = encode(x) end
            return "[" .. table.concat(out, ",") .. "]"
        end
        local out = {}
        for k, x in pairs(v) do out[#out + 1] = encode(tostring(k)) .. ":" .. encode(x) end
        return "{" .. table.concat(out, ",") .. "}"
    elseif t == "string" then
        return '"' .. v:gsub('[%c"\\]', function(c)
            return ({ ['"'] = '\\"', ["\\"] = "\\\\", ["\n"] = "\\n", ["\t"] = "\\t" })[c] or string.format("\\u%04x", c:byte())
        end) .. '"'
    elseif t == "number" or t == "boolean" then
        return tostring(v)
    end
    return "null"
end

print(encode({ ok = ok, error = not ok and tostring(err) or nil, binds = rows }))
