/* Luftrom · contour lines behind the page below the chart: a slow height field drawn as isolines, with a low hill
   that rises under the pointer. Decoration only: paused while the chart covers the screen or the tab is hidden,
   and drawn once, still, under reduced motion. */
(function () {
  var canvas = document.querySelector(".isolines");
  if (!canvas) return;
  var gl = canvas.getContext("webgl2", { antialias: false, alpha: true, premultipliedAlpha: true });
  if (!gl) return;
  var root = document.documentElement, flight = document.querySelector(".flight");
  // Still under reduced motion and on touch screens, where there is no pointer to raise a hill and the battery matters.
  var still = matchMedia("(prefers-reduced-motion: reduce)").matches || matchMedia("(pointer: coarse)").matches;

  var VS = "#version 300 es\nvoid main() { vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0); gl_Position = vec4(p, 0.0, 1.0); }";
  var FS = "#version 300 es\nprecision highp float;\n" +
    "uniform vec2 uRes; uniform float uT, uDpr; uniform vec3 uLine, uBump; out vec4 o;\n" +
    "vec2 h2(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return -1.0 + 2.0 * fract(sin(p) * 43758.5453); }\n" +
    "float gn(vec2 p) { vec2 i = floor(p), f = fract(p), u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);\n" +
    "  return mix(mix(dot(h2(i), f), dot(h2(i + vec2(1, 0)), f - vec2(1, 0)), u.x), mix(dot(h2(i + vec2(0, 1)), f - vec2(0, 1)), dot(h2(i + vec2(1, 1)), f - vec2(1, 1)), u.x), u.y); }\n" +
    "float grid(float v, float w) { float f = max(fwidth(v), 1e-5); return 1.0 - smoothstep(w - 0.5, w + 0.5, abs(fract(v - 0.5) - 0.5) / f); }\n" +
    "void main() {\n" +
    "  vec2 px = gl_FragCoord.xy / uDpr; px.y = uRes.y / uDpr - px.y;\n" +
    "  vec2 p = px / 520.0;\n" +
    "  float f = gn(p + vec2(uT * 0.011, -uT * 0.007)) + 0.5 * gn(p * 2.1 - uT * 0.013) + 0.25 * gn(p * 4.3 + 3.7);\n" +
    "  vec2 d = px - uBump.xy; f += uBump.z * exp(-dot(d, d) / (2.0 * 150.0 * 150.0));\n" +
    "  float v = f * 9.0;\n" +
    "  float a = max(grid(v, 0.55) * 0.42, grid(v / 5.0, 0.9) * 0.7);\n" +
    "  o = vec4(uLine * a, a);\n" +
    "}";
  function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
  var prog = gl.createProgram();
  try {
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (err) { console.warn("Luftrom isolines:", err); return; }
  var u = {};
  ["uRes", "uT", "uDpr", "uLine", "uBump"].forEach(function (n) { u[n] = gl.getUniformLocation(prog, n); });
  gl.bindVertexArray(gl.createVertexArray());
  root.classList.add("iso");

  var line = [0.5, 0.5, 0.5], dpr = 1, w = 1, h = 1;
  function colour() {
    var m = /^#([0-9a-f]{6})$/i.exec(getComputedStyle(root).getPropertyValue("--sky-line").trim()), n = m ? parseInt(m[1], 16) : 0x999999;
    line = [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; need = true;
  }
  var bump = { x: -999, y: -999, z: 0, tz: 0 }, need = true, running = false, t = 0, last = 0, chartTop = 0, chartBottom = 0;
  function resize() {
    dpr = Math.min(devicePixelRatio || 1, still ? 1.25 : 1.5); w = innerWidth; h = innerHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); need = true;
    if (flight) { var r = flight.getBoundingClientRect(); chartTop = r.top + scrollY; chartBottom = r.bottom + scrollY; }
    start();
  }
  addEventListener("pointermove", function (e) { if (e.pointerType !== "mouse" || still) return; bump.x = e.clientX; bump.y = e.clientY; bump.tz = 0.55; }, { passive: true });
  document.addEventListener("pointerleave", function () { bump.tz = 0; });
  // Nothing to animate while the chart fills the screen (positions cached on resize, so no layout reads per frame).
  function covered() { return flight && scrollY >= chartTop && scrollY + innerHeight <= chartBottom; }

  function frame(ts) {
    var dt = Math.min(0.05, (ts - last) / 1000);
    // Still: one draw per resize or theme change. Moving: the lines drift slowly, so 30 fps is plenty.
    if (need || (!still && !covered() && dt >= 1 / 34)) {
      last = ts;
      if (!still) { t += dt; bump.z += (bump.tz - bump.z) * (1 - Math.exp(-dt * 2)); bump.tz *= Math.exp(-dt * 0.6); }
      gl.viewport(0, 0, canvas.width, canvas.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(prog);
      gl.uniform2f(u.uRes, canvas.width, canvas.height); gl.uniform1f(u.uT, t); gl.uniform1f(u.uDpr, dpr);
      gl.uniform3fv(u.uLine, line); gl.uniform3f(u.uBump, bump.x, bump.y, bump.z);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      need = false;
    }
    if (!still && !document.hidden) requestAnimationFrame(frame); else running = false;
  }
  function start() { if (running) return; running = true; last = performance.now(); requestAnimationFrame(frame); }
  colour(); resize();
  addEventListener("resize", resize);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () { colour(); start(); });
  document.addEventListener("visibilitychange", function () { if (!document.hidden) start(); });
})();
