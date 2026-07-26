// AXIOM ambient background — Bayer ordered-dithering over animated fbm noise,
// rendered in a single GPU pass (raw WebGL, no library). Clicking anywhere sends
// a ripple through the pattern.
//
// The canvas is fixed behind the app with pointer-events:none, so it never
// intercepts UI clicks — ripple coordinates come from a window-level listener.
// Honors prefers-reduced-motion by rendering one static frame.
import { useEffect, useRef } from 'react'

const MAX_CLICKS = 8

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`

const FRAG = `
precision highp float;

uniform vec2  uResolution;
uniform float uTime;
uniform float uPixel;                       // dither cell size in device px
uniform vec2  uClickPos[${MAX_CLICKS}];     // device px, (-1,-1) = empty slot
uniform float uClickTimes[${MAX_CLICKS}];

// ── Bayer ordered dithering (recursive, cheap) ──
float Bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
#define Bayer4(a) (Bayer2(0.5 * (a)) * 0.25 + Bayer2(a))
#define Bayer8(a) (Bayer4(0.5 * (a)) * 0.25 + Bayer2(a))

// ── value noise + fbm ──
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, amp = 0.5;
  for (int i = 0; i < 5; i++) { v += amp * noise(p); p *= 2.02; amp *= 0.5; }
  return v;
}

void main() {
  float aspect = uResolution.x / max(uResolution.y, 1.0);

  // quantize to dither cells so the pattern reads as discrete pixels
  vec2 pixelId = floor(gl_FragCoord.xy / uPixel);
  vec2 cell    = pixelId * uPixel;
  vec2 uv      = (cell / uResolution) * vec2(aspect, 1.0);

  // slow drifting cloud field
  float t = uTime * 0.035;
  float n = fbm(uv * 2.6 + vec2(t, t * 0.7));
  n = mix(n, fbm(uv * 5.0 - vec2(t * 0.5, t)), 0.35);

  // gentle radial lift so the field is denser toward the edges but still reads
  // across the whole viewport
  vec2 c = (cell / uResolution) - 0.5;
  float vig = mix(0.72, 1.25, smoothstep(0.05, 0.78, length(c * vec2(aspect, 1.0))));

  float mask = n * 1.02 * vig;

  // ── click ripples ──
  float feed = 0.0;
  for (int i = 0; i < ${MAX_CLICKS}; i++) {
    vec2 pos = uClickPos[i];
    if (pos.x < 0.0) continue;
    vec2 cuv = (pos / uResolution) * vec2(aspect, 1.0);
    float age = max(uTime - uClickTimes[i], 0.0);
    float r = distance(uv, cuv);
    float waveR = 0.42 * age;
    float ring = exp(-pow((r - waveR) / 0.055, 2.0));
    float atten = exp(-1.4 * age) * exp(-1.6 * r);
    feed = max(feed, ring * atten);
  }
  mask += feed * 1.35;

  // ── ordered-dither threshold ──
  float d = Bayer8(pixelId);
  float on = step(0.52, mask + d - 0.5);

  // charcoal base, cool dust + a warm amber lift where ripples pass
  vec3 base = vec3(0.049, 0.053, 0.066);
  vec3 dust = mix(vec3(0.70, 0.745, 0.85), vec3(1.0, 0.72, 0.26), clamp(feed * 2.2, 0.0, 1.0));
  float intensity = 0.30 + feed * 0.62;

  gl_FragColor = vec4(base + dust * on * intensity, 1.0);
}
`

function compile(gl, type, src) {
  const sh = gl.createShader(type)
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn('dither shader:', gl.getShaderInfoLog(sh))
    gl.deleteShader(sh)
    return null
  }
  return sh
}

export default function DitherBackground() {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false })
    if (!gl) return // no WebGL → the CSS background shows through

    const vs = compile(gl, gl.VERTEX_SHADER, VERT)
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    if (!vs || !fs) return
    const prog = gl.createProgram()
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('dither link:', gl.getProgramInfoLog(prog))
      return
    }
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'aPos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    const uRes = gl.getUniformLocation(prog, 'uResolution')
    const uTime = gl.getUniformLocation(prog, 'uTime')
    const uPixel = gl.getUniformLocation(prog, 'uPixel')
    const uPos = gl.getUniformLocation(prog, 'uClickPos')
    const uTimes = gl.getUniformLocation(prog, 'uClickTimes')

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const clickPos = new Float32Array(MAX_CLICKS * 2).fill(-1)
    const clickTimes = new Float32Array(MAX_CLICKS)
    let slot = 0
    let dpr = 1

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 1.75)
      const w = Math.floor(window.innerWidth * dpr)
      const h = Math.floor(window.innerHeight * dpr)
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h
        gl.viewport(0, 0, w, h)
      }
    }

    function onClick(e) {
      if (reduced) return
      clickPos[slot * 2] = e.clientX * dpr
      // GL origin is bottom-left; the DOM's is top-left
      clickPos[slot * 2 + 1] = (window.innerHeight - e.clientY) * dpr
      clickTimes[slot] = (performance.now() - start) / 1000
      slot = (slot + 1) % MAX_CLICKS
    }

    const start = performance.now()
    let raf = 0

    function frame() {
      resize()
      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform1f(uPixel, Math.max(2.0, 3.0 * dpr))
      gl.uniform1f(uTime, reduced ? 8.0 : (performance.now() - start) / 1000)
      gl.uniform2fv(uPos, clickPos)
      gl.uniform1fv(uTimes, clickTimes)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      if (!reduced) raf = requestAnimationFrame(frame)
    }
    frame()

    window.addEventListener('resize', resize)
    window.addEventListener('pointerdown', onClick)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointerdown', onClick)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }, [])

  return (
    <canvas ref={ref} aria-hidden="true"
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%',
        display: 'block', pointerEvents: 'none', zIndex: 0 }} />
  )
}
