@vertex fn vertex(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f
{
    return vec4f(GetQuadCoord(index), 0, 1);
}

@fragment fn fragment(@builtin(position) position: vec4f) -> @location(0) vec4f
{
    return vec4f((vec2f(0, 1) - vec2f(position.xy) / resolution.xy) * vec2f(-1, 1), 0, 1);
}
