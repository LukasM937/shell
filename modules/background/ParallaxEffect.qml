import QtQuick
import qs.utils

// Depth parallax used as a layer.effect: shifts pixels by (depth - focus) * offset.
// The compiled shader and the depth map come from the depth clock generator.
ShaderEffect {
    required property Item depthMap
    property vector2d offset
    property real focusDepth
    property real zoom: 1

    fragmentShader: `file://${Paths.data}/depth-clock/parallax.frag.qsb`
}
