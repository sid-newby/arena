export const shaderPresets = ['noise', 'aurora', 'scanlines', 'plasma'] as const;
export type ShaderPreset = (typeof shaderPresets)[number];

export const VERTEX = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

/** One fragment program; PRESET is defined per preset at compile time. */
export const FRAGMENT = `
precision mediump float;
uniform vec2 u_res;
uniform float u_time;
uniform vec3 u_a;
uniform vec3 u_b;
uniform vec3 u_c;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p *= 2.0;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec3 col;
#if PRESET == 0
  float n = fbm(uv * 3.0 + vec2(u_time * 0.05, -u_time * 0.08));
  col = mix(mix(u_a, u_b, n), u_c, smoothstep(0.6, 0.9, n));
#elif PRESET == 1
  float y = uv.y + 0.15 * sin(uv.x * 4.0 + u_time * 0.4) + 0.08 * sin(uv.x * 9.0 - u_time * 0.7);
  float band = smoothstep(0.35, 0.55, y) * smoothstep(0.85, 0.6, y);
  col = mix(u_a, u_b, band) + u_c * band * 0.6 * (0.5 + 0.5 * sin(uv.x * 20.0 + u_time));
#elif PRESET == 2
  float line = 0.85 + 0.15 * sin(gl_FragCoord.y * 3.14159);
  float flicker = 0.97 + 0.03 * sin(u_time * 30.0);
  float v = 1.0 - 0.5 * length(uv - 0.5);
  col = mix(u_a, u_b, v) * line * flicker;
#else
  float v = sin(uv.x * 6.0 + u_time) + sin(uv.y * 5.0 - u_time * 0.7)
    + sin((uv.x + uv.y) * 4.0 + u_time * 0.5) + sin(length(uv - 0.5) * 8.0 - u_time);
  v = v * 0.125 + 0.5;
  col = mix(mix(u_a, u_b, v), u_c, smoothstep(0.5, 0.9, v));
#endif
  gl_FragColor = vec4(col, 1.0);
}
`;

/** Parse #rgb or #rrggbb into 0..1 components. Anything else is a flat mid grey. */
export function rgb(hex: string | null | undefined): [number, number, number] {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex ?? '');
  if (!match) return [0.5, 0.5, 0.5];
  const digits = match[1].length === 3 ? [...match[1]].map((d) => d + d).join('') : match[1];
  return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
}
