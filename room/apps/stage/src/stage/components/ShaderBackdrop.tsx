import { useEffect, useRef } from 'react';
import { FRAGMENT, VERTEX, rgb, shaderPresets, type ShaderPreset } from '../shaders';

const WIDTH = 960;
const HEIGHT = 540;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Shader allocation failed.');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(shader) ?? 'Shader compile failed.');
  return shader;
}

export function ShaderBackdrop({
  preset,
  palette,
}: {
  preset: ShaderPreset;
  palette: [string, string, string];
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const key = palette.join('|');
  useEffect(() => {
    const element = canvas.current;
    const gl = element?.getContext('webgl');
    if (!element || !gl) return;
    const program = gl.createProgram();
    if (!program) return;
    const index = shaderPresets.indexOf(preset);
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(
      program,
      compile(gl, gl.FRAGMENT_SHADER, `#define PRESET ${index}\n${FRAGMENT}`),
    );
    gl.linkProgram(program);
    // Bound alias: the react hooks lint reads a direct gl.useProgram call as a hook.
    const activate = gl.useProgram.bind(gl);
    activate(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'a_pos');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.viewport(0, 0, WIDTH, HEIGHT);
    gl.uniform2f(gl.getUniformLocation(program, 'u_res'), WIDTH, HEIGHT);
    const [a, b, c] = key.split('|');
    gl.uniform3fv(gl.getUniformLocation(program, 'u_a'), rgb(a));
    gl.uniform3fv(gl.getUniformLocation(program, 'u_b'), rgb(b));
    gl.uniform3fv(gl.getUniformLocation(program, 'u_c'), rgb(c));
    const time = gl.getUniformLocation(program, 'u_time');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const start = performance.now();
    let frame = 0;
    const draw = () => {
      gl.uniform1f(time, reduced ? 0 : (performance.now() - start) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!reduced) frame = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(frame);
      gl.deleteProgram(program);
      gl.deleteBuffer(buffer);
    };
  }, [preset, key]);
  return <canvas ref={canvas} className="stage-shader" width={WIDTH} height={HEIGHT} />;
}
