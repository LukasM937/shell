#version 440
// Depth parallax: shift each pixel by (depth - focus) * offset. Inverse warp, refined a few
// times so near objects slide over far ones instead of smearing. depthMap is in screen space.

layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;

layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    vec2 offset; // cursor offset * strength, in texture units
    float focusDepth; // depth that stays still (the clock's plane)
    float zoom;  // overscan so shifted edges never show
};

layout(binding = 1) uniform sampler2D source;
layout(binding = 2) uniform sampler2D depthMap;

void main() {
    vec2 uv = 0.5 + (qt_TexCoord0 - 0.5) / zoom;
    vec2 p = uv;
    for (int i = 0; i < 5; i++)
        p = uv - offset * (texture(depthMap, p).r - focusDepth);
    fragColor = texture(source, clamp(p, 0.0, 1.0)) * qt_Opacity;
}
