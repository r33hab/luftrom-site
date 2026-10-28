/* Luftrom · the chart world at the top of the landing page.
   A made-up stretch of Norwegian coast drawn as a topographic chart in plain WebGL2: hillshade, 20 m contours,
   the drone zones as hatched areas and as walls of airspace, and the 120 m ceiling that follows the ground.
   Scrolling opens the chart sheet and flies in, the pointer reveals the airspace under it, and a click checks
   the spot the way the app does. Terrain and zones are invented, and every readout says so.
   Without WebGL2 the screenshot of the app stays; with reduced motion the chart is drawn once, fully revealed. */
(function () {
  var root = document.documentElement;
  var flight = document.querySelector(".flight"), canvas = document.getElementById("world");
  if (!flight || !canvas) return;
  // Phones are most of the audience: no MSAA there (the shaders anti-alias their own lines), a coarser mesh,
  // a lower pixel ratio, 30 fps while nothing moves, and an adaptive drop in resolution if frames still run long.
  var coarse = matchMedia("(pointer: coarse)").matches;
  var gl = canvas.getContext("webgl2", { antialias: !coarse, alpha: false, powerPreference: coarse ? "low-power" : "default" });
  if (!gl) return;
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var flying = !reduce;

  function smooth(a, b, x) { var t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
  function mix(a, b, t) { return a + (b - a) * t; }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

  // ---- Terrain: seeded simplex noise, ridged mountains, a fjord, an airport plain and a town ----
  function makeNoise(seed) {
    var perm = new Uint8Array(512), p = new Uint8Array(256), s = seed >>> 0, i;
    for (i = 0; i < 256; i++) p[i] = i;
    for (i = 255; i > 0; i--) { s = (s * 1664525 + 1013904223) >>> 0; var j = s % (i + 1), t = p[i]; p[i] = p[j]; p[j] = t; }
    for (i = 0; i < 512; i++) perm[i] = p[i & 255];
    var G = [1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 0, 1, 0, -1], F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
    function corner(gi, x, y) { var t = 0.5 - x * x - y * y; if (t < 0) return 0; t *= t; gi = (gi & 7) * 2; return t * t * (G[gi] * x + G[gi + 1] * y); }
    return function (x, y) {
      var k = (x + y) * F2, i = Math.floor(x + k), j = Math.floor(y + k), t = (i + j) * G2;
      var x0 = x - (i - t), y0 = y - (j - t), i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;
      var ii = i & 255, jj = j & 255;
      return 70 * (corner(perm[ii + perm[jj]], x0, y0) +
        corner(perm[ii + i1 + perm[jj + j1]], x0 - i1 + G2, y0 - j1 + G2) +
        corner(perm[ii + 1 + perm[jj + 1]], x0 - 1 + 2 * G2, y0 - 1 + 2 * G2));
    };
  }
  var noise = makeNoise(20260928);
  function fbm(x, y) { var a = 0, amp = 0.5; for (var o = 0; o < 4; o++) { a += amp * noise(x, y); x *= 2.03; y *= 2.03; amp *= 0.5; } return a; }
  function ridged(x, y) { var a = 0, amp = 0.55, prev = 1; for (var o = 0; o < 3; o++) { var n = 1 - Math.abs(noise(x, y)); n *= n; a += n * amp * prev; prev = n; x *= 2.1; y *= 2.1; amp *= 0.5; } return a; }

  var HALF = 4000, EX = 1.35, BASE = -260;          // half the chart's width and the block's base (m); vertical exaggeration
  var N = coarse || innerWidth < 700 ? 128 : 220, STEP = 2 * HALF / N, W1 = N + 1;
  // The fjord's centre line, from the mouth in the south-east to its head in the north-west (u = x / HALF, v = z / HALF).
  var FJORD = [[1.3, 0.72], [0.8, 0.5], [0.42, 0.44], [0.14, 0.3], [-0.06, 0.06], [-0.16, -0.22], [-0.36, -0.48]];
  function fjord(u, v) {
    var best = 1e9, s = 0, last = FJORD.length - 1;
    for (var i = 0; i < last; i++) {
      var ax = FJORD[i][0], ay = FJORD[i][1], dx = FJORD[i + 1][0] - ax, dy = FJORD[i + 1][1] - ay;
      var t = clamp01(((u - ax) * dx + (v - ay) * dy) / (dx * dx + dy * dy)), ex = u - ax - dx * t, ey = v - ay - dy * t, d = ex * ex + ey * ey;
      if (d < best) { best = d; s = (i + t) / last; }
    }
    return { d: Math.sqrt(best), s: s, w: mix(0.15, 0.045, s) };
  }
  var AIR = { u: 0.55, v: 0.03, a: 32 * Math.PI / 180 };
  function rawHeight(u, v) {
    var lift = smooth(-0.3, 1.1, 0.5 - u * 0.55 - v * 0.75);  // the land rises inland, toward the north-west
    var m = ridged(u * 1.05 + 4.3, v * 1.05 - 2.1) * 1.1 + fbm(u * 2.2 - 7.7, v * 2.2 + 1.3) * 0.25;
    var h = 30 + (0.2 + 0.85 * lift) * Math.max(0, m) * 640;
    var f = fjord(u, v);
    h *= 0.1 + 0.9 * smooth(f.w * 0.9, f.w * 3.4, f.d);
    h = mix(-40 - 170 * (1 - f.s), h, smooth(f.w * 0.5, f.w * 1.1, f.d));
    h = mix(h, -110, smooth(1.02, 1.36, u * 0.62 + v * 0.78)); // open sea in the south-east corner
    var du = u - AIR.u, dv = v - AIR.v, ca = Math.cos(AIR.a), sa = Math.sin(AIR.a);
    var ru = (ca * du + sa * dv) / 0.44, rv = (-sa * du + ca * dv) / 0.17;
    h = mix(16 + 10 * du, h, smooth(0.8, 1.6, Math.sqrt(ru * ru + rv * rv)));
    var tu = (u - 0.3) / 0.24, tv = (v - 0.7) / 0.14;
    return mix(26 + 20 * tv, h, smooth(0.7, 1.5, Math.sqrt(tu * tu + tv * tv)));
  }
  var heights = new Float32Array(W1 * W1);
  for (var gj = 0; gj < W1; gj++) for (var gi = 0; gi < W1; gi++) heights[gj * W1 + gi] = rawHeight(gi / N * 2 - 1, gj / N * 2 - 1);
  function heightAt(x, z) {
    var fi = Math.min(N - 1e-4, Math.max(0, (x + HALF) / STEP)), fj = Math.min(N - 1e-4, Math.max(0, (z + HALF) / STEP));
    var i = Math.floor(fi), j = Math.floor(fj), tx = fi - i, k = j * W1 + i;
    return mix(mix(heights[k], heights[k + 1], tx), mix(heights[k + W1], heights[k + W1 + 1], tx), fj - j);
  }
  function groundY(x, z) { return Math.max(0, heightAt(x, z)) * EX; }
  function drawnAt(i, j) { i = Math.min(N, Math.max(0, i)); j = Math.min(N, Math.max(0, j)); return Math.max(0, heights[j * W1 + i]) * EX; }

  var ground = new Float32Array(W1 * W1 * 6), index = new Uint16Array(N * N * 6), k6 = 0, ki = 0;
  for (var j = 0; j < W1; j++) for (var i = 0; i < W1; i++) {
    var nx = drawnAt(i - 1, j) - drawnAt(i + 1, j), ny = 2 * STEP, nz = drawnAt(i, j - 1) - drawnAt(i, j + 1), nl = Math.hypot(nx, ny, nz);
    ground.set([-HALF + i * STEP, heights[j * W1 + i], -HALF + j * STEP, nx / nl, ny / nl, nz / nl], k6); k6 += 6;
    if (i < N && j < N) { var a = j * W1 + i; index.set([a, a + W1, a + 1, a + 1, a + W1, a + W1 + 1], ki); ki += 6; }
  }
  // The block's four cut faces, so the chart reads as a relief model once the camera tilts.
  var skirt = [];
  [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(function (e) {
    for (var s = 0; s < N; s++) {
      var pts = [s, s + 1].map(function (t) {
        var i = e[0] === 0 ? t : (e[0] < 0 ? 0 : N), j = e[1] === 0 ? t : (e[1] < 0 ? 0 : N);
        return [-HALF + i * STEP, drawnAt(i, j), -HALF + j * STEP];
      });
      var a0 = pts[0], a1 = pts[1], b = BASE * EX;
      [[a0[0], a0[1], a0[2]], [a0[0], b, a0[2]], [a1[0], b, a1[2]], [a0[0], a0[1], a0[2]], [a1[0], b, a1[2]], [a1[0], a1[1], a1[2]]]
        .forEach(function (q) { skirt.push(q[0], q[1], q[2], e[0], 0, e[1]); });
    }
  });

  // ---- Zones: the same eight colours as the app; six of them on this chart ----
  // Primitives in chart units: [0, cu, cv, r] is a circle, [1, cu, cv, half u, half v, angle°, corner radius] a rounded box.
  var ZONES = [
    { key: "airport-info", permit: 0, tall: 230, prims: [[0, 0.55, 0.03, 0.66]], tag: [0.55, 0.62] },
    { key: "airport", permit: 1, tall: 380, prims: [[0, 0.55, 0.03, 0.29], [1, 0.55, 0.03, 0.44, 0.1, 32, 0.02]] },
    { key: "restricted", permit: 1, tall: 260, prims: [[1, 0.3, 0.71, 0.17, 0.085, -12, 0.03]] },
    { key: "nature-ban", permit: 1, tall: 200, prims: [[0, -0.6, -0.3, 0.2], [0, -0.4, -0.08, 0.16], [0, -0.72, 0, 0.14]] },
    { key: "danger", permit: 0, tall: 300, prims: [[0, -0.48, 0.66, 0.18]] },
    { key: "nature", permit: 0, tall: 160, prims: [[0, 0.36, -0.62, 0.15], [0, 0.58, -0.7, 0.12]] }
  ];
  ZONES.forEach(function (z) {
    z.p = z.prims.map(function (q) {
      var pr = { box: q[0] === 1, cx: q[1] * HALF, cz: q[2] * HALF };
      if (pr.box) { var a = q[5] * Math.PI / 180; pr.hx = q[3] * HALF; pr.hz = q[4] * HALF; pr.c = Math.cos(a); pr.s = Math.sin(a); pr.rr = q[6] * HALF; }
      else pr.r = q[3] * HALF;
      return pr;
    });
  });
  function primSd(pr, x, z) {
    var dx = x - pr.cx, dz = z - pr.cz;
    if (!pr.box) return Math.sqrt(dx * dx + dz * dz) - pr.r;
    var ex = Math.abs(pr.c * dx + pr.s * dz) - pr.hx + pr.rr, ez = Math.abs(-pr.s * dx + pr.c * dz) - pr.hz + pr.rr;
    return Math.hypot(Math.max(ex, 0), Math.max(ez, 0)) + Math.min(Math.max(ex, ez), 0) - pr.rr;
  }
  function zoneSd(zone, x, z) { var d = 1e9; zone.p.forEach(function (pr) { d = Math.min(d, primSd(pr, x, z)); }); return d; }
  function zonesAt(x, z) { return ZONES.filter(function (zone) { return zoneSd(zone, x, z) < 0; }); }

  function outline(pr) {
    var pts = [], k;
    if (!pr.box) { for (k = 0; k < 160; k++) { var a = k / 160 * Math.PI * 2; pts.push([pr.cx + Math.cos(a) * pr.r, pr.cz + Math.sin(a) * pr.r]); } return pts; }
    var hx = pr.hx - pr.rr, hz = pr.hz - pr.rr, cs = [[hx, hz], [-hx, hz], [-hx, -hz], [hx, -hz]], local = [];
    cs.forEach(function (c, ci) {
      for (k = 0; k <= 6; k++) { var a2 = (ci * 90 + k * 15) * Math.PI / 180; local.push([c[0] + Math.cos(a2) * pr.rr, c[1] + Math.sin(a2) * pr.rr]); }
      var end = local[local.length - 1], nc = cs[(ci + 1) % 4], na = ((ci + 1) % 4) * Math.PI / 2, nxt = [nc[0] + Math.cos(na) * pr.rr, nc[1] + Math.sin(na) * pr.rr];
      for (k = 1; k < 24; k++) local.push([mix(end[0], nxt[0], k / 24), mix(end[1], nxt[1], k / 24)]);
    });
    return local.map(function (q) { return [pr.cx + pr.c * q[0] - pr.s * q[1], pr.cz + pr.s * q[0] + pr.c * q[1]]; });
  }
  var walls = [];
  ZONES.forEach(function (zone, zi) {
    zone.p.forEach(function (pr) {
      var pts = outline(pr), n = pts.length;
      var keep = pts.map(function (q) { return Math.abs(zoneSd(zone, q[0], q[1])) < 3 && Math.abs(q[0]) < HALF && Math.abs(q[1]) < HALF; });
      for (var k = 0; k < n; k++) {
        var k2 = (k + 1) % n; if (!keep[k] || !keep[k2]) continue;
        var a = pts[k], b = pts[k2], ya = Math.max(0, heightAt(a[0], a[1])), yb = Math.max(0, heightAt(b[0], b[1]));
        [[a, ya, 0], [b, yb, 0], [b, yb, 1], [a, ya, 0], [b, yb, 1], [a, ya, 1]]
          .forEach(function (q) { walls.push(q[0][0], q[0][1], q[1], zone.tall, q[2], zi); });
      }
    });
  });

  // Spot heights: the highest summits, at least 1.4 km apart.
  var spots = [], cand = [];
  for (var sj = 8; sj < N - 8; sj += 2) for (var si = 8; si < N - 8; si += 2) {
    var sh = heights[sj * W1 + si], top = true;
    for (var dj = -8; dj <= 8 && top; dj += 2) for (var di = -8; di <= 8; di += 2) if (heights[(sj + dj) * W1 + si + di] > sh) { top = false; break; }
    if (top && sh > 200) cand.push({ h: sh, x: -HALF + si * STEP, z: -HALF + sj * STEP });
  }
  cand.sort(function (a, b) { return b.h - a.h; }).forEach(function (c) {
    if (spots.length < 6 && spots.every(function (s) { return Math.hypot(s.x - c.x, s.z - c.z) > 1400; })) spots.push(c);
  });

  // ---- The drone: a Mavic-class quadcopter modelled in metres (x right, y up, z forward) ----
  // Rounded shapes are superellipsoids; arms, legs and blades are boxes between two points. Vertex: position, normal,
  // colour with alpha, emissive (0 none, 1 steady, 2 pulsing) and the propeller (1 to 4) it spins with.
  var droneData = [], PROPS = [[-0.165, 0.052, 0.13], [0.165, 0.052, 0.13], [-0.15, 0.025, -0.135], [0.15, 0.025, -0.135]];
  function rgb(h) { return [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255]; }
  function vert(p, n, c, a, em, spin) { droneData.push(p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], c[2], a, em || 0, spin || 0); }
  function spow(x, e) { return (x < 0 ? -1 : 1) * Math.pow(Math.abs(x), e); }
  function ellip(c, r, e1, e2, col, o) {
    o = o || {}; var nu = 14, nv = 24, pts = [];
    for (var i = 0; i <= nu; i++) {
      var u = -Math.PI / 2 + Math.PI * i / nu, row = [];
      for (var j = 0; j <= nv; j++) {
        var v = -Math.PI + 2 * Math.PI * j / nv, cu = Math.cos(u), su = Math.sin(u), cv = Math.cos(v), sv = Math.sin(v);
        var p = [r[0] * spow(cu, e1) * spow(cv, e2), r[1] * spow(su, e1), r[2] * spow(cu, e1) * spow(sv, e2)];
        var n = [spow(cu, 2 - e1) * spow(cv, 2 - e2) / r[0], spow(su, 2 - e1) / r[1], spow(cu, 2 - e1) * spow(sv, 2 - e2) / r[2]];
        if (o.forward) { p = [p[0], p[2], p[1]]; n = [n[0], n[2], n[1]]; }     // the pole along z, for a lens
        var l = Math.hypot(n[0], n[1], n[2]) || 1;
        row.push([[c[0] + p[0], c[1] + p[1], c[2] + p[2]], [n[0] / l, n[1] / l, n[2] / l]]);
      }
      pts.push(row);
    }
    for (i = 0; i < nu; i++) for (j = 0; j < nv; j++) {
      var q = [pts[i][j], pts[i + 1][j], pts[i + 1][j + 1], pts[i][j + 1]];
      [0, 1, 2, 0, 2, 3].forEach(function (k) { vert(q[k][0], q[k][1], col, 1, o.em, o.spin); });
    }
  }
  function beam(a, b, w, h, col, o) {
    o = o || {}; var d = norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]), up = Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    var sx = norm(cross(d, up)), sy = cross(sx, d), tw = o.taper || 1;
    function c(end, x, y) { var e = end ? b : a, k = end ? tw : 1; return [e[0] + sx[0] * x * w * k + sy[0] * y * h, e[1] + sx[1] * x * w * k + sy[1] * y * h, e[2] + sx[2] * x * w * k + sy[2] * y * h]; }
    var faces = [[sy, [[0, -1, 1], [0, 1, 1], [1, 1, 1], [1, -1, 1]]], [[-sy[0], -sy[1], -sy[2]], [[0, -1, -1], [1, -1, -1], [1, 1, -1], [0, 1, -1]]],
      [sx, [[0, 1, -1], [1, 1, -1], [1, 1, 1], [0, 1, 1]]], [[-sx[0], -sx[1], -sx[2]], [[0, -1, -1], [0, -1, 1], [1, -1, 1], [1, -1, -1]]],
      [d, [[1, -1, -1], [1, -1, 1], [1, 1, 1], [1, 1, -1]]], [[-d[0], -d[1], -d[2]], [[0, -1, -1], [0, 1, -1], [0, 1, 1], [0, -1, 1]]]];
    faces.forEach(function (f) {
      var q = f[1].map(function (k) { return c(k[0], k[1], k[2]); });
      [0, 1, 2, 0, 2, 3].forEach(function (k) { vert(q[k], f[0], col, 1, o.em, o.spin); });
    });
  }
  function disc(c, r, col, alpha) {
    for (var k = 0; k < 32; k++) {
      var a0 = k / 32 * Math.PI * 2, a1 = (k + 1) / 32 * Math.PI * 2;
      [c, [c[0] + Math.cos(a0) * r, c[1], c[2] + Math.sin(a0) * r], [c[0] + Math.cos(a1) * r, c[1], c[2] + Math.sin(a1) * r]]
        .forEach(function (q) { vert(q, [0, 1, 0], col, alpha); });
    }
  }
  (function buildDrone() {
    var shell = rgb(0x4b525a), cover = rgb(0x5d656e), dark = rgb(0x24292f), glass = rgb(0x1d3b5a), metal = rgb(0x8f979f), blade = rgb(0x707982);
    ellip([0, 0, 0], [0.05, 0.04, 0.11], 0.35, 0.45, shell);                        // body
    ellip([0, 0.022, -0.012], [0.044, 0.026, 0.092], 0.4, 0.5, cover);              // top cover over the battery
    [-1, 1].forEach(function (sd) {
      ellip([sd * 0.022, 0.012, 0.106], [0.008, 0.008, 0.004], 1, 1, dark);         // forward vision sensors
      beam([sd * 0.04, 0.014, 0.06], [sd * 0.165, 0.02, 0.13], 0.009, 0.006, shell);   // front arms, folded out
      beam([sd * 0.04, -0.012, -0.05], [sd * 0.15, -0.006, -0.135], 0.009, 0.006, shell); // rear arms, lower
      beam([sd * 0.165, 0.004, 0.13], [sd * 0.165, -0.05, 0.128], 0.004, 0.004, dark);  // front landing legs
      beam([sd * 0.03, -0.034, -0.07], [sd * 0.038, -0.066, -0.086], 0.005, 0.004, dark); // rear legs
      beam([sd * 0.165, -0.004, 0.142], [sd * 0.165, -0.004, 0.146], 0.006, 0.004, rgb(0xff3b30), { em: 1 }); // front arm lights
    });
    PROPS.forEach(function (m, i) {
      ellip([m[0], m[1] - 0.03, m[2]], [0.017, 0.016, 0.017], 0.15, 1, dark);        // motor bell
      ellip([m[0], m[1] - 0.012, m[2]], [0.009, 0.004, 0.009], 0.3, 1, metal);       // hub
      for (var b = 0; b < 2; b++) {                                                  // two blades, swept a little
        var a = b * Math.PI + i * 0.6, tip = [m[0] + Math.cos(a) * 0.118, m[1], m[2] + Math.sin(a) * 0.118];
        beam([m[0], m[1], m[2]], tip, 0.011, 0.0018, blade, { spin: i + 1, taper: 0.55 });
      }
    });
    ellip([0, -0.036, 0.098], [0.026, 0.024, 0.02], 0.5, 0.6, dark);               // gimbal
    ellip([0, -0.036, 0.119], [0.015, 0.006, 0.015], 0.25, 1, rgb(0x0b0f13), { forward: true }); // lens barrel
    ellip([0, -0.036, 0.126], [0.01, 0.001, 0.01], 1, 1, glass, { forward: true, em: 0.35 });   // glass
    beam([0, 0.004, -0.111], [0, 0.004, -0.114], 0.006, 0.004, rgb(0x34c759), { em: 2 });       // status light
    PROPS.forEach(function (m) { disc(m, 0.122, rgb(0xb4bcc4), 0.14); });           // the blur of the spinning props, drawn last
  })();
  var droneCount = droneData.length / 12;

  // ---- GL ----
  var GRID = "float grid(float v, float w) { float f = max(fwidth(v), 1e-5); return 1.0 - smoothstep(w - 0.5, w + 0.5, abs(fract(v - 0.5) - 0.5) / f); }\n";
  var SWEEP = "float sweep(vec2 p) { vec2 d = p - uSweep.xy; float behind = mod(uSweep.z - atan(d.x, -d.y), 6.2831853);" +
    " return exp(-behind * 1.5) * (1.0 - smoothstep(3300.0, 3700.0, length(d))) * uSweep.w; }\n";
  var GROUND_VS = "#version 300 es\n" +
    "layout(location = 0) in vec3 aPos; layout(location = 1) in vec3 aNor;\n" +
    "uniform mat4 uVP; uniform int uMode; uniform float uEx, uLift;\n" +
    "out vec3 vW; out vec3 vN; out float vH;\n" +
    "void main() { float y = uMode == 2 ? aPos.y : (max(aPos.y, 0.0) + uLift) * uEx;" +
    " vW = vec3(aPos.x, y, aPos.z); vN = aNor; vH = aPos.y; gl_Position = uVP * vec4(vW, 1.0); }";
  var GROUND_FS = "#version 300 es\nprecision highp float; precision highp int;\n" +
    "in vec3 vW; in vec3 vN; in float vH;\n" +
    "uniform int uMode; uniform vec3 uBg, uGround, uHigh, uLine, uIndex, uWater, uShore, uSkirt, uInk, uAccent;\n" +
    "uniform vec2 uRes, uFog; uniform sampler2D uMask; uniform float uRise, uIntro, uCeil, uTime, uHalf, uEx;\n" +
    "uniform vec3 uEye, uShadow; uniform vec4 uCheck, uSweep; uniform vec4 uPa[12]; uniform vec4 uPb[12]; uniform vec3 uZc[6]; uniform vec4 uZi[6];\n" +
    "out vec4 o;\n" + GRID + SWEEP +
    "void main() {\n" +
    "  vec2 p = vW.xz;\n" +
    "  if (uMode == 1) {\n" +   // the 120 m ceiling: a sheet of grid that follows the ground
    "    float g = max(grid(p.x / 400.0, 0.6), grid(p.y / 400.0, 0.6)), near = exp(-dot(p - uCheck.xy, p - uCheck.xy) / 3.2e6);\n" +
    "    float a = (0.05 + 0.34 * g) * (0.3 + 0.7 * near) * uCeil * (1.0 - smoothstep(uHalf - 500.0, uHalf, max(abs(p.x), abs(p.y))));\n" +
    "    o = vec4(uAccent * a, a); return;\n" +
    "  }\n" +
    "  if (uMode == 2) {\n" +   // the cut faces of the block, with strata every 60 m
    "    vec3 c = mix(uSkirt, uIndex, grid(vW.y / (60.0 * uEx), 0.6) * 0.3) * (1.0 - 0.2 * smoothstep(0.0, -260.0 * uEx, vW.y));\n" +
    "    c *= abs(vN.x) > 0.5 ? 0.93 : 1.0;\n" +
    "    o = vec4(mix(uBg, c, smoothstep(0.0, 0.3, uIntro)), 1.0); return;\n" +
    "  }\n" +
    "  float h = vH, r = length(p) / (uHalf * 1.45), drawn = smoothstep(r, r + 0.08, uIntro);\n" +
    "  float shade = clamp(dot(normalize(vN), normalize(vec3(-0.6, 0.75, -0.5))), 0.0, 1.0);\n" +
    "  vec3 col = mix(uGround, uHigh, smoothstep(0.0, 1000.0, h)) * (0.8 + 0.3 * shade);\n" +
    "  if (h < 0.0) {\n" +
    "    col = mix(uWater, uWater * 0.86, smoothstep(0.0, -180.0, h));\n" +
    "    col = mix(col, uShore, grid(p.y / 70.0, 0.55) * 0.16 * drawn);\n" +
    "  } else {\n" +
    "    float minor = grid(h / 20.0, 0.55) * (1.0 - smoothstep(0.3, 0.7, fwidth(h / 20.0)));\n" +
    "    col = mix(col, uLine, minor * 0.75 * drawn);\n" +
    "    col = mix(col, uIndex, grid(h / 100.0, 0.95) * 0.85 * drawn);\n" +
    "  }\n" +
    "  col = mix(col, uShore, (1.0 - smoothstep(0.8, 1.8, abs(h) / max(fwidth(h), 1e-4))) * drawn);\n" +
    "  col = mix(col, uIndex, max(grid(p.x / 1000.0, 0.6), grid(p.y / 1000.0, 0.6)) * 0.2 * drawn);\n" +
    "  float rev = max(uRise, max(smoothstep(0.08, 0.7, texture(uMask, gl_FragCoord.xy / uRes).r), sweep(p)));\n" +
    "  float zd[6];\n" +
    "  for (int i = 0; i < 6; i++) zd[i] = 1e6;\n" +
    "  for (int j = 0; j < 12; j++) {\n" +
    "    vec4 a = uPa[j], b = uPb[j];\n" +
    "    if (b.w < -0.5) continue;\n" +
    "    vec2 q = p - a.xy; float d;\n" +
    "    if (b.z < 0.5) d = length(q) - a.z;\n" +
    "    else { q = vec2(b.x * q.x + b.y * q.y, -b.y * q.x + b.x * q.y); float rr = b.z - 1.0; vec2 e = abs(q) - a.zw + rr;" +
    " d = length(max(e, 0.0)) + min(max(e.x, e.y), 0.0) - rr; }\n" +
    "    int z = int(b.w + 0.5); zd[z] = min(zd[z], d);\n" +
    "  }\n" +
    "  for (int i = 0; i < 6; i++) {\n" +   // hatched where permission is required, dashed where conditions apply
    "    float d = zd[i]; if (d > 1e5) continue;\n" +
    "    float px = max(fwidth(d), 1e-3), permit = uZi[i].x;\n" +
    "    float inside = 1.0 - smoothstep(-px, px, d);\n" +
    "    float hatch = permit * grid((p.x - p.y) / 110.0, 1.1);\n" +
    "    vec2 c = p - uZi[i].zw;\n" +
    "    float dash = permit > 0.5 ? 1.0 : step(0.42, fract(atan(c.y, c.x) * length(c) / 120.0));\n" +
    "    float w = mix(1.0, 2.1, permit), edge = (1.0 - smoothstep(w - 0.5, w + 0.5, abs(d) / px)) * dash;\n" +
    "    col = mix(col, uZc[i], inside * (0.13 + 0.3 * hatch) * rev * drawn);\n" +
    "    col = mix(col, uZc[i], edge * mix(0.14, 1.0, rev) * drawn);\n" +
    "  }\n" +
    "  if (uSweep.w > 0.001) {\n" +   // the airport radar's sweep, which reveals the zones as it passes
    "    vec2 d = p - uSweep.xy; float rr = length(d), behind = mod(uSweep.z - atan(d.x, -d.y), 6.2831853);\n" +
    "    float inr = 1.0 - smoothstep(3300.0, 3700.0, rr);\n" +
    "    col = mix(col, uAccent, ((1.0 - smoothstep(0.0, 0.035, behind)) * 0.7 + grid(rr / 1000.0, 0.6) * 0.14) * inr * uSweep.w * drawn);\n" +
    "  }\n" +
    "  vec2 ds = p - uShadow.xy; col *= 1.0 - uShadow.z * exp(-dot(ds, ds) / (uCheck.z * uCheck.z + 1.0));\n" +   // the drone's shadow
    "  if (uCheck.w > 0.0) {\n" +   // the checked spot: a reticle with a slow pulse
    "    float dc = length(p - uCheck.xy), px = max(fwidth(dc), 1e-3), pr = fract(uTime * 0.6);\n" +
    "    float mark = max(1.0 - smoothstep(0.9, 1.9, abs(dc - 90.0) / px), 1.0 - smoothstep(-px, px, dc - 26.0));\n" +
    "    float pulse = (1.0 - smoothstep(0.9, 1.9, abs(dc - 90.0 - pr * 420.0) / px)) * (1.0 - pr) * (uTime > 0.0 ? 1.0 : 0.0);\n" +
    "    col = mix(col, uInk, max(mark, pulse * 0.6) * uCheck.w);\n" +
    "  }\n" +
    "  col = mix(col, uAccent, exp(-pow((uIntro - r) * 28.0, 2.0)) * (1.0 - smoothstep(0.85, 1.0, uIntro)) * 0.5);\n" +
    "  col = mix(uBg, col, smoothstep(0.0, 0.25, uIntro));\n" +
    "  col = mix(col, uBg, smoothstep(uFog.x, uFog.y, length(vW - uEye)) * 0.85);\n" +
    "  o = vec4(col, 1.0);\n" +
    "}";
  var WALL_VS = "#version 300 es\n" +
    "layout(location = 0) in vec2 aXZ; layout(location = 1) in vec4 aW;\n" +   // aW: base (m), height (m), 0 base or 1 top, zone
    "uniform mat4 uVP; uniform float uEx, uRise; uniform sampler2D uMask; uniform vec4 uSweep;\n" +
    "out float vV; out float vY; out float vR; flat out int vZ;\n" + SWEEP +
    "void main() {\n" +
    "  vec4 base = uVP * vec4(aXZ.x, aW.x * uEx, aXZ.y, 1.0);\n" +
    "  float m = base.w > 0.0 ? smoothstep(0.08, 0.7, textureLod(uMask, base.xy / base.w * 0.5 + 0.5, 0.0).r) : 0.0;\n" +
    "  float r = max(uRise, max(m, sweep(aXZ))), y = aW.x + aW.y * aW.z * r;\n" +
    "  vV = aW.z; vY = y; vR = r; vZ = int(aW.w + 0.5);\n" +
    "  gl_Position = uVP * vec4(aXZ.x, y * uEx, aXZ.y, 1.0);\n" +
    "}";
  var WALL_FS = "#version 300 es\nprecision highp float; precision highp int;\n" +
    "in float vV; in float vY; in float vR; flat in int vZ; uniform vec3 uZc[6]; out vec4 o;\n" + GRID +
    "void main() {\n" +
    "  float top = 1.0 - smoothstep(0.0, 1.6, (1.0 - vV) / max(fwidth(vV), 1e-4));\n" +
    "  float a = 0.2 * pow(1.0 - vV, 1.5) + 0.04 + 0.2 * grid(vY / 40.0, 0.5) * (1.0 - vV * 0.7) + 0.75 * top;\n" +
    "  a = min(a, 0.9) * smoothstep(0.02, 0.18, vR);\n" +
    "  o = vec4(uZc[vZ] * a, a);\n" +
    "}";

  var DRONE_VS = "#version 300 es\n" +
    "layout(location = 0) in vec3 aPos; layout(location = 1) in vec3 aNor; layout(location = 2) in vec4 aCol; layout(location = 3) in vec2 aMat;\n" +
    "uniform mat4 uVP, uM; uniform float uTime; uniform vec3 uProp[4];\n" +
    "out vec3 vN; out vec3 vW; out vec4 vC; out float vE;\n" +
    "void main() {\n" +
    "  vec3 p = aPos, n = aNor; int s = int(aMat.y + 0.5);\n" +
    "  if (s > 0) {\n" +   // diagonal pairs turn the same way, as on a real quadcopter
    "    vec3 c = uProp[s - 1]; float a = uTime * ((s == 1 || s == 4) ? 31.0 : -31.0), cs = cos(a), sn = sin(a);\n" +
    "    vec2 q = p.xz - c.xz; p.xz = c.xz + vec2(cs * q.x - sn * q.y, sn * q.x + cs * q.y); n.xz = vec2(cs * n.x - sn * n.z, sn * n.x + cs * n.z);\n" +
    "  }\n" +
    "  vec4 w = uM * vec4(p, 1.0); vW = w.xyz; vN = mat3(uM) * n; vC = aCol; vE = aMat.x;\n" +
    "  gl_Position = uVP * w;\n" +
    "}";
  var DRONE_FS = "#version 300 es\nprecision highp float; precision highp int;\n" +
    "in vec3 vN; in vec3 vW; in vec4 vC; in float vE; uniform vec3 uEye; uniform float uTime, uFade; out vec4 o;\n" +
    "void main() {\n" +
    "  vec3 n = normalize(vN), l = normalize(vec3(-0.5, 0.8, -0.35)), v = normalize(uEye - vW);\n" +
    "  float dif = max(dot(n, l), 0.0), spec = pow(max(dot(n, normalize(l + v)), 0.0), 48.0), rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);\n" +
    "  vec3 c = vC.rgb * (0.38 * (0.55 + 0.45 * n.y) + 0.8 * dif) + spec * 0.4 + rim * 0.1;\n" +
    "  if (vE > 0.0) c = mix(c, vC.rgb * 1.5, min(vE, 1.0) * (vE > 1.5 ? 0.55 + 0.45 * sin(uTime * 4.0) : 1.0));\n" +
    "  o = vec4(c * vC.a * uFade, vC.a * uFade);\n" +
    "}";

  function shader(type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function program(vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, shader(gl.VERTEX_SHADER, vs)); gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    p.u = {}; return p;
  }
  function U(p, name) { if (!(name in p.u)) p.u[name] = gl.getUniformLocation(p, name); return p.u[name]; }
  function vao(data, layout, idx) {
    var v = gl.createVertexArray(); gl.bindVertexArray(v);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    var stride = layout.reduce(function (s, n) { return s + n; }, 0) * 4, off = 0;
    layout.forEach(function (n, i) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, n, gl.FLOAT, false, stride, off); off += n * 4; });
    if (idx) { gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW); }
    gl.bindVertexArray(null); return v;
  }

  var pg, pw, pd, groundVao, skirtVao, wallVao, droneVao, skirtCount = skirt.length / 6, wallCount = walls.length / 6;
  try {
    pg = program(GROUND_VS, GROUND_FS); pw = program(WALL_VS, WALL_FS);
    groundVao = vao(ground, [3, 3], index);
    skirtVao = vao(new Float32Array(skirt), [3, 3]);
    wallVao = vao(new Float32Array(walls), [2, 4]);
    pd = program(DRONE_VS, DRONE_FS); droneVao = vao(new Float32Array(droneData), [3, 3, 4, 2]);
  } catch (err) { console.warn("Luftrom chart:", err); return; }
  root.classList.add("gl");
  if (flying) root.classList.add("flying");

  // Zone shapes and styles as uniform arrays, shared by both programs.
  var PA = new Float32Array(48), PB = new Float32Array(48).fill(-1), ZI = new Float32Array(24), np = 0;
  ZONES.forEach(function (zone, zi) {
    zone.p.forEach(function (pr) {
      PA.set([pr.cx, pr.cz, pr.box ? pr.hx : pr.r, pr.box ? pr.hz : 0], np * 4);
      PB.set(pr.box ? [pr.c, pr.s, 1 + pr.rr, zi] : [1, 0, 0, zi], np * 4); np++;
    });
    ZI.set([zone.permit, zone.tall, zone.p[0].cx, zone.p[0].cz], zi * 4);
  });

  var C = {}, ZC = new Float32Array(18);
  function hex(name) {
    var m = /^#([0-9a-f]{6})$/i.exec(getComputedStyle(root).getPropertyValue(name).trim()), n = m ? parseInt(m[1], 16) : 0x808080;
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }
  function readColours() {
    ["bg", "ground", "high", "line", "index", "water", "shore", "skirt", "ink"].forEach(function (k) { C[k] = hex("--chart-" + k); });
    C.accent = hex("--accent");
    ZONES.forEach(function (zone, zi) { ZC.set(hex("--z-" + zone.key), zi * 3); });
    need = true;
  }

  // The reveal mask: the pointer paints a soft trail into a small canvas that fades back to black.
  var mask = document.createElement("canvas"), mctx = mask.getContext("2d"), maskTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, maskTex);
  [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]
    .forEach(function (q) { gl.texParameteri(gl.TEXTURE_2D, q[0], q[1]); });

  // ---- Page wiring ----
  var win = flight.querySelector(".window"), box = flight.querySelector(".window-box"), hud = flight.querySelector(".hud");
  var probe = flight.querySelector(".probe"), stem = flight.querySelector(".stem"), verdict = flight.querySelector(".verdict");
  var altMark = flight.querySelector(".alt .mark"), beats = Array.prototype.slice.call(flight.querySelectorAll(".beat"));
  var scaleBar = flight.querySelector(".scale i"), cols = flight.querySelector(".cols"), rows = flight.querySelector(".rows");
  var clock = flight.querySelector(".clock");

  var TEXT = {
    nb: {
      zone: { "airport": "Lufthavn, tillatelse kreves", "airport-info": "Lufthavn, vis hensyn", "restricted": "Restriksjonsområde", "nature-ban": "Verneområde med droneforbud", "danger": "Fareområde", "nature": "Verneområde" },
      tag: { "airport": "Lufthavn", "airport-info": "Lufthavn, vis hensyn", "restricted": "Restriksjonsområde", "nature-ban": "Droneforbud", "danger": "Fareområde", "nature": "Verneområde" },
      permit: "Krever tillatelse", cond: "Vilkår gjelder",
      verdict: [["Tillatelse kreves", "Minst én sone her krever tillatelse fra myndigheten som har ansvaret før du flyr."],
        ["Vilkår gjelder", "Sonene her har vilkår. Les dem før du flyr."],
        ["Ingen soner her", "Ingen dronesoner på dette punktet. De vanlige reglene gjelder fortsatt."]],
      kicker: "Sjekk av punktet · demokart", ground: "Terrenghøyde", max: "Maks flyhøyde", grid: "Rute", sea: "sjø",
      agl: function (m) { return "120 m over bakken (≈ " + m + " m o.h.)"; },
      note: "Oppdiktet terreng og soner. Ikke for planlegging.",
      label: "Demokart over et oppdiktet stykke norskekyst med dronesoner. Klikk eller trykk for å sjekke et punkt; piltastene flytter punktet.",
      locale: "nb-NO"
    },
    en: {
      zone: { "airport": "Airport, permission required", "airport-info": "Airport, take care", "restricted": "Restricted area", "nature-ban": "Protected area, drones banned", "danger": "Danger area", "nature": "Protected area" },
      tag: { "airport": "Airport", "airport-info": "Airport, take care", "restricted": "Restricted area", "nature-ban": "Drones banned", "danger": "Danger area", "nature": "Protected area" },
      permit: "Requires permission", cond: "Conditions apply",
      verdict: [["Permission required", "At least one zone here requires permission from the responsible authority before you fly."],
        ["Conditions apply", "The zones here have conditions. Read them before you fly."],
        ["No zones here", "No drone zones at this spot. The usual rules still apply."]],
      kicker: "Spot check · demo chart", ground: "Terrain height", max: "Max flight altitude", grid: "Grid", sea: "sea",
      agl: function (m) { return "120 m above ground (≈ " + m + " m ASL)"; },
      note: "Made-up terrain and zones. Not for planning.",
      label: "Demo chart of a made-up stretch of Norwegian coast with drone zones. Click or tap to check a spot; the arrow keys move the spot.",
      locale: "en-GB"
    }
  };
  function L() { return TEXT[root.getAttribute("data-lang") === "en" ? "en" : "nb"]; }
  function metres(m) { return Math.round(m).toLocaleString(L().locale) + " m"; }
  function gridRef(x, z) { return "ABCDEFGH".charAt(Math.min(7, Math.max(0, Math.floor((x + HALF) / 1000)))) + (Math.min(7, Math.max(0, Math.floor((z + HALF) / 1000))) + 1); }

  function tag(cls, text) { var e = document.createElement("span"); e.className = cls; if (text) e.textContent = text; hud.appendChild(e); return e; }
  spots.forEach(function (s) { s.el = tag("spot", "▲ " + Math.round(s.h)); });
  ZONES.forEach(function (zone) { zone.el = tag("ztag"); zone.el.style.setProperty("--c", "var(--z-" + zone.key + ")"); });
  var drone = tag("drone");
  var droneAlt = drone.appendChild(document.createElement("b")), groundTag = tag("gtag");
  var colTags = [], rowTags = [];
  for (var g = 0; g < 8; g++) {
    colTags.push(cols.appendChild(document.createElement("span"))); colTags[g].textContent = "ABCDEFGH".charAt(g);
    rowTags.push(rows.appendChild(document.createElement("span"))); rowTags[g].textContent = String(g + 1);
  }

  var check = { x: 0.4 * HALF, z: 0.12 * HALF }, aim = { x: check.x, z: check.z }, userChecked = false, checkVis = flying ? 0 : 1;
  function renderVerdict() {
    var t = L(), here = zonesAt(check.x, check.z), h = heightAt(check.x, check.z), ground = Math.max(0, h);
    var level = here.some(function (z) { return z.permit; }) ? 0 : here.length ? 1 : 2, v = t.verdict[level];
    verdict.setAttribute("data-level", String(level));
    verdict.querySelector(".v-kicker").textContent = t.kicker;
    verdict.querySelector(".v-title").textContent = v[0];
    verdict.querySelector(".v-sub").textContent = v[1];
    var list = verdict.querySelector(".v-zones"); list.textContent = "";
    here.slice().reverse().forEach(function (z) {
      var li = document.createElement("li"); li.style.setProperty("--c", "var(--z-" + z.key + ")");
      li.innerHTML = "<span></span><b></b><small></small>";
      li.querySelector("b").textContent = t.zone[z.key];
      li.querySelector("small").textContent = z.permit ? t.permit : t.cond;
      if (z.permit) li.className = "permit";
      list.appendChild(li);
    });
    var dd = verdict.querySelectorAll("dd"), dt = verdict.querySelectorAll("dt");
    dt[0].textContent = t.ground; dd[0].textContent = h < 0 ? "0 m (" + t.sea + ")" : metres(ground);
    dt[1].textContent = t.max; dd[1].textContent = t.agl(Math.round(ground + 120).toLocaleString(t.locale));
    dt[2].textContent = t.grid; dd[2].textContent = gridRef(check.x, check.z);
    verdict.querySelector(".v-note").textContent = t.note;
  }
  function relabel() {
    var t = L();
    ZONES.forEach(function (zone) { zone.el.textContent = t.tag[zone.key]; });
    canvas.setAttribute("aria-label", t.label);
    renderVerdict(); need = true;
  }
  function checkAt(x, z) {
    check.x = Math.max(-HALF + 20, Math.min(HALF - 20, x)); check.z = Math.max(-HALF + 20, Math.min(HALF - 20, z));
    if (reduce) { aim.x = check.x; aim.z = check.z; }
    userChecked = true; renderVerdict(); need = true;
  }

  // ---- Camera ----
  var FOV = 35 * Math.PI / 180, TAN = Math.tan(FOV / 2), CHART = 2 * HALF * 1.08;
  // p, pitch°, yaw°, distance as a share of the full-view fit (0 = fit the chart sheet in its window), how far to follow the checked spot.
  var KEYS = [[0, 88, 0, 0, 0], [0.28, 54, -24, 0.9, 0.1], [0.52, 38, -42, 0.72, 0.55], [0.76, 32, -56, 0.62, 1], [1, 29, -64, 0.58, 1]];
  var cw = 1, ch = 1, dpr = 1, winRect = null, fitWin = 1, fitFull = 1;
  var cam = { eye: [0, 0, 0], f: [0, 0, -1], r: [1, 0, 0], u: [0, 1, 0], sx: 0, sy: 0, aspect: 1, dist: 1 }, VP = new Float32Array(16);
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { var l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; }
  function setCamera(pitch, yaw, dist, tx, ty, tz, sx, sy) {
    var cp = Math.cos(pitch), e = [tx + dist * cp * Math.sin(yaw), ty + dist * Math.sin(pitch), tz + dist * cp * Math.cos(yaw)];
    var f = norm([tx - e[0], ty - e[1], tz - e[2]]), r = norm(cross(f, [0, 1, 0])), u = cross(r, f);
    var near = 40, far = dist * 4 + 20000, nf = 1 / (near - far), a = cw / ch;
    var P = [1 / TAN / a, 0, 0, 0, 0, 1 / TAN, 0, 0, -sx, -sy, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
    var V = [r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0,
      -(r[0] * e[0] + r[1] * e[1] + r[2] * e[2]), -(u[0] * e[0] + u[1] * e[1] + u[2] * e[2]), f[0] * e[0] + f[1] * e[1] + f[2] * e[2], 1];
    for (var c = 0; c < 4; c++) for (var rr = 0; rr < 4; rr++)
      VP[c * 4 + rr] = P[rr] * V[c * 4] + P[4 + rr] * V[c * 4 + 1] + P[8 + rr] * V[c * 4 + 2] + P[12 + rr] * V[c * 4 + 3];
    cam.eye = e; cam.f = f; cam.r = r; cam.u = u; cam.sx = sx; cam.sy = sy; cam.aspect = a; cam.dist = dist;
  }
  function project(x, y, z) {
    var m = VP, w = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (w < 1) return null;
    return [((m[0] * x + m[4] * y + m[8] * z + m[12]) / w + 1) / 2 * cw, (1 - (m[1] * x + m[5] * y + m[9] * z + m[13]) / w) / 2 * ch];
  }
  function ray(px, py) {
    var nx = px / cw * 2 - 1, ny = 1 - py / ch * 2, a = (nx - cam.sx) * cam.aspect * TAN, b = (ny - cam.sy) * TAN;
    var d = norm([cam.f[0] + cam.r[0] * a + cam.u[0] * b, cam.f[1] + cam.r[1] * a + cam.u[1] * b, cam.f[2] + cam.r[2] * a + cam.u[2] * b]);
    var o = cam.eye, t = 0, prev = 0, maxT = cam.dist * 4;
    function below(s) { var x = o[0] + d[0] * s, z = o[2] + d[2] * s; return Math.abs(x) <= HALF && Math.abs(z) <= HALF && o[1] + d[1] * s <= groundY(x, z); }
    for (var i = 0; i < 700 && t < maxT; i++) {
      if (below(t)) {
        for (var k = 0; k < 12; k++) { var mid = (prev + t) / 2; if (below(mid)) t = mid; else prev = mid; }
        return [o[0] + d[0] * t, o[2] + d[2] * t];
      }
      prev = t; t += 25 * (1 + t / 3000);
    }
    return null;
  }
  function key(p) {
    for (var i = 1; i < KEYS.length; i++) if (p <= KEYS[i][0] || i === KEYS.length - 1) {
      var a = KEYS[i - 1], b = KEYS[i], t = smooth(a[0], b[0], p);
      return [mix(a[1], b[1], t), mix(a[2], b[2], t), mix(a[3] || fitWin / fitFull, b[3], t), mix(a[4], b[4], t)];
    }
  }

  function resize() {
    // On phones the copy sits under the sheet, so the sheet's bottom margin is the copy's height, whatever the fonts did.
    var copy = flight.querySelector(".copy");
    if (flying && innerWidth <= 900 && copy) flight.style.setProperty("--in-b", (copy.offsetHeight + 26) + "px");
    else flight.style.removeProperty("--in-b");
    var r = canvas.getBoundingClientRect(), max = coarse ? 1.35 : 1.75;
    cw = Math.max(1, r.width); ch = Math.max(1, r.height); dpr = Math.min(devicePixelRatio || 1, max) * quality;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    mask.width = 160; mask.height = Math.max(1, Math.round(160 * ch / cw));
    mctx.fillStyle = "#000"; mctx.fillRect(0, 0, mask.width, mask.height);
    winRect = flying && box ? box.getBoundingClientRect() : r;
    var fit = function (w, h) { return CHART * ch / (2 * TAN * Math.min(w, h)); };
    fitWin = fit(winRect.width, winRect.height); fitFull = fit(cw, ch);
    winRect = { x: winRect.left - r.left + winRect.width / 2, y: winRect.top - r.top + winRect.height / 2 };
    // Scroll progress comes from scrollY against these, so a frame never has to read layout.
    flightTop = flight.getBoundingClientRect().top + scrollY; travel = flight.offsetHeight - (flying ? r.height : 0);
    need = true;
  }

  // ---- Pointer and keys ----
  var pointer = { x: 0, y: 0, lx: 0, ly: 0, in: false, touch: false, idle: 0, nx: 0, ny: 0 }, hover = null;
  function local(e) { var r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  canvas.addEventListener("pointermove", function (e) {
    var q = local(e);
    if (!pointer.in) { pointer.lx = q[0]; pointer.ly = q[1]; }
    pointer.x = q[0]; pointer.y = q[1]; pointer.in = true; pointer.touch = e.pointerType !== "mouse"; pointer.idle = 0; need = true; lastInput = now;
  });
  canvas.addEventListener("pointerleave", function () { pointer.in = false; need = true; });
  canvas.addEventListener("click", function (e) {
    var q = local(e), hit = ray(q[0], q[1]);
    if (hit) checkAt(hit[0], hit[1]);
  });
  canvas.addEventListener("keydown", function (e) {
    var d = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
    if (!d) return;
    e.preventDefault(); checkAt(check.x + d[0] * 160, check.z + d[1] * 160);
  });

  function paintMask(dt) {
    if (!pointer.in && now - painted > 2.5) return;   // faded to black already: nothing to upload
    if (pointer.in) painted = now;
    mctx.globalCompositeOperation = "source-over";
    mctx.fillStyle = "rgba(0,0,0," + (1 - Math.exp(-dt * 2.2)).toFixed(3) + ")";
    mctx.fillRect(0, 0, mask.width, mask.height);
    if (pointer.in) {
      var s = mask.width / cw, x0 = pointer.lx * s, y0 = pointer.ly * s, x1 = pointer.x * s, y1 = pointer.y * s;
      var len = Math.hypot(x1 - x0, y1 - y0), rad = mask.width * (coarse ? 0.1 : 0.075), n = Math.max(1, Math.ceil(len / (rad * 0.35)));
      mctx.globalCompositeOperation = "lighter";
      for (var i = 1; i <= n; i++) {
        var x = mix(x0, x1, i / n), y = mix(y0, y1, i / n), gr = mctx.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, "rgba(255,255,255,0.45)"); gr.addColorStop(1, "rgba(255,255,255,0)");
        mctx.fillStyle = gr; mctx.beginPath(); mctx.arc(x, y, rad, 0, 6.2832); mctx.fill();
      }
      pointer.lx = pointer.x; pointer.ly = pointer.y;
    }
    gl.bindTexture(gl.TEXTURE_2D, maskTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mask);
  }

  // ---- Frame ----
  var now = 0, t0 = performance.now(), last = t0, need = true, running = false, onScreen = true;
  var ps = flying ? 0 : 1, open = flying ? 0 : 1, rise = flying ? 0 : 1, ceil = flying ? 0 : 1, altP = flying ? 0 : 1;
  var sweepOn = 0, sweepA = 0, drift = 0, par = [0, 0], quality = 1, slow = 0, frames = 0;
  var droneUp = 0, droneAt = [0, 0, 0], droneM = new Float32Array(16), shadowR = 1, PROPF = new Float32Array([].concat.apply([], PROPS));
  var flightTop = 0, travel = 1, lastInput = 0, lastOpen = "", sig = "", skip = false, painted = 0;
  function progress() { return travel > 0 ? clamp01((scrollY - flightTop) / travel) : 0; }

  function update(dt) {
    var p = flying ? progress() : 1;
    ps += (p - ps) * (1 - Math.exp(-dt * 7)); if (Math.abs(p - ps) < 1e-4) ps = p;
    if (flying) {
      open = smooth(0.02, 0.26, ps); rise = smooth(0.1, 0.32, ps); ceil = smooth(0.4, 0.55, ps); altP = smooth(0.4, 0.62, ps);
      var o = open.toFixed(4);
      if (o !== lastOpen) { flight.style.setProperty("--open", o); lastOpen = o; }
      flight.classList.toggle("is-open", open > 0.5);
      beats.forEach(function (b, i) { var lo = [0.2, 0.44, 0.66][i], hi = [0.44, 0.66, 1.01][i]; b.classList.toggle("on", ps >= lo && ps < hi); });
      flight.classList.toggle("show-alt", ps > 0.3);
      flight.classList.toggle("show-verdict", ps > 0.62 || userChecked);
      // The radar sweeps while the chart is still a sheet and the pointer rests, or always on touch screens.
      pointer.idle += dt;
      var wantSweep = (1 - open) * ((pointer.touch || coarse || !pointer.in || pointer.idle > 2.5) ? 1 : 0);
      sweepOn += (wantSweep - sweepOn) * (1 - Math.exp(-dt * 3));
      sweepA = (sweepA + dt * 1.25) % (Math.PI * 2);
      if (ps > 0.7) drift += dt * 0.9;
      var tx = pointer.in && !pointer.touch ? pointer.x / cw - 0.5 : 0, ty = pointer.in && !pointer.touch ? pointer.y / ch - 0.5 : 0;
      par[0] += (tx - par[0]) * (1 - Math.exp(-dt * 3)); par[1] += (ty - par[1]) * (1 - Math.exp(-dt * 3));
    }
    aim.x += (check.x - aim.x) * (1 - Math.exp(-dt * (reduce ? 60 : 3.5))); aim.z += (check.z - aim.z) * (1 - Math.exp(-dt * (reduce ? 60 : 3.5)));
    checkVis += ((userChecked || ps > 0.38 ? 1 : 0) - checkVis) * (1 - Math.exp(-dt * 6));
    var k = key(ps), follow = k[3], tx2 = aim.x * follow, tz2 = aim.z * follow, ty2 = groundY(aim.x, aim.z) * follow;
    var shift = 1 - open;
    var sx = winRect ? (winRect.x / cw * 2 - 1) * shift : 0, sy = winRect ? -(winRect.y / ch * 2 - 1) * shift : 0;
    var pitch = (k[0] - par[1] * 3 * open) * Math.PI / 180, yaw = (k[1] + drift - par[0] * 4 * open) * Math.PI / 180;
    setCamera(pitch, yaw, k[2] * fitFull, tx2, ty2, tz2, sx, sy);

    // The drone: drawn at a symbol's size (about 84 px across, 60 on phones) rather than its true 0.4 m, hovering
    // with a slow bob, turned three-quarters to the camera and pitched toward wherever it is flying.
    droneUp = 120 * (flying ? Math.max(altP, userChecked ? 1 : 0) : 1);
    var dy = groundY(aim.x, aim.z) + droneUp * EX, ex = cam.eye[0] - aim.x, ey = cam.eye[1] - dy, ez = cam.eye[2] - aim.z;
    var wpp = 2 * Math.hypot(ex, ey, ez) * TAN / ch, sc = (cw < 600 ? 60 : 84) * wpp / 0.4;
    droneAt = [aim.x, dy + 0.07 * sc + (reduce ? 0 : Math.sin(now * 1.7) * wpp * 2.5), aim.z];
    var hd = Math.atan2(ex, ez) + 0.7 + (reduce ? 0 : Math.sin(now * 0.35) * 0.25), ch2 = Math.cos(hd), sh2 = Math.sin(hd);
    var vx = check.x - aim.x, vz = check.z - aim.z, vl = Math.hypot(vx, vz), t = vl > 1 ? Math.min(0.32, vl / 900) : 0;
    var kx = vl > 1 ? vz / vl : 1, kz = vl > 1 ? -vx / vl : 0, c = Math.cos(t), sn = Math.sin(t), ic = 1 - c;
    var R = [c + kx * kx * ic, kz * sn, kx * kz * ic, -kz * sn, c, kx * sn, kx * kz * ic, -kx * sn, c + kz * kz * ic]; // about (kx, 0, kz)
    var Y = [ch2, 0, -sh2, 0, 1, 0, sh2, 0, ch2];
    for (var col = 0; col < 3; col++) for (var row = 0; row < 3; row++)
      droneM[col * 4 + row] = sc * (R[row] * Y[col * 3] + R[3 + row] * Y[col * 3 + 1] + R[6 + row] * Y[col * 3 + 2]);
    droneM[12] = droneAt[0]; droneM[13] = droneAt[1]; droneM[14] = droneAt[2]; droneM[15] = 1;
    shadowR = sc * 0.22;
  }

  function draw(t) {
    var intro = reduce ? 1 : Math.min(1, (performance.now() - t0) / 2200);
    intro = 1 - Math.pow(1 - intro, 3);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(C.bg[0], C.bg[1], C.bg[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE); gl.depthMask(true);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, maskTex);

    gl.useProgram(pg);
    gl.uniformMatrix4fv(U(pg, "uVP"), false, VP);
    ["bg", "ground", "high", "line", "index", "water", "shore", "skirt", "ink"].forEach(function (c) { gl.uniform3fv(U(pg, "u" + c.charAt(0).toUpperCase() + c.slice(1)), C[c]); });
    gl.uniform3fv(U(pg, "uAccent"), C.accent);
    gl.uniform2f(U(pg, "uRes"), canvas.width, canvas.height);
    gl.uniform2f(U(pg, "uFog"), cam.dist * 1.15, cam.dist * 2.6);
    gl.uniform1i(U(pg, "uMask"), 0);
    gl.uniform1f(U(pg, "uRise"), rise); gl.uniform1f(U(pg, "uIntro"), intro); gl.uniform1f(U(pg, "uCeil"), ceil);
    gl.uniform1f(U(pg, "uTime"), reduce ? 0 : t); gl.uniform1f(U(pg, "uHalf"), HALF); gl.uniform1f(U(pg, "uEx"), EX);
    gl.uniform3fv(U(pg, "uEye"), cam.eye);
    gl.uniform4f(U(pg, "uCheck"), aim.x, aim.z, shadowR, checkVis);
    gl.uniform3f(U(pg, "uShadow"), aim.x, aim.z, 0.3 * checkVis * (1 - droneUp / 240));
    gl.uniform4f(U(pg, "uSweep"), ZONES[0].p[0].cx, ZONES[0].p[0].cz, sweepA, sweepOn * smooth(0.3, 0.8, intro));
    gl.uniform4fv(U(pg, "uPa"), PA); gl.uniform4fv(U(pg, "uPb"), PB); gl.uniform3fv(U(pg, "uZc"), ZC); gl.uniform4fv(U(pg, "uZi"), ZI);

    gl.uniform1i(U(pg, "uMode"), 0); gl.uniform1f(U(pg, "uLift"), 0);
    gl.bindVertexArray(groundVao); gl.drawElements(gl.TRIANGLES, index.length, gl.UNSIGNED_SHORT, 0);
    gl.uniform1i(U(pg, "uMode"), 2);
    gl.bindVertexArray(skirtVao); gl.drawArrays(gl.TRIANGLES, 0, skirtCount);

    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    if (checkVis > 0.02) {   // before the walls and the ceiling, so they blend over it
      gl.useProgram(pd);
      gl.uniformMatrix4fv(U(pd, "uVP"), false, VP); gl.uniformMatrix4fv(U(pd, "uM"), false, droneM);
      gl.uniform1f(U(pd, "uTime"), reduce ? 0 : t); gl.uniform3fv(U(pd, "uProp"), PROPF); gl.uniform3fv(U(pd, "uEye"), cam.eye);
      gl.uniform1f(U(pd, "uFade"), checkVis);
      gl.bindVertexArray(droneVao); gl.drawArrays(gl.TRIANGLES, 0, droneCount);
      gl.useProgram(pg);
    }
    gl.depthMask(false);
    if (ceil > 0.005) {
      gl.uniform1i(U(pg, "uMode"), 1); gl.uniform1f(U(pg, "uLift"), 120);
      gl.bindVertexArray(groundVao); gl.drawElements(gl.TRIANGLES, index.length, gl.UNSIGNED_SHORT, 0);
    }
    gl.useProgram(pw);
    gl.uniformMatrix4fv(U(pw, "uVP"), false, VP);
    gl.uniform1f(U(pw, "uEx"), EX); gl.uniform1f(U(pw, "uRise"), rise); gl.uniform1i(U(pw, "uMask"), 0);
    gl.uniform4f(U(pw, "uSweep"), ZONES[0].p[0].cx, ZONES[0].p[0].cz, sweepA, sweepOn * smooth(0.3, 0.8, intro));
    gl.uniform3fv(U(pw, "uZc"), ZC);
    gl.bindVertexArray(wallVao); gl.drawArrays(gl.TRIANGLES, 0, wallCount);
    gl.bindVertexArray(null); gl.depthMask(true);
    return intro;
  }

  function place(el, pt, show) {
    if (!pt || !show) { el.style.opacity = "0"; return; }
    el.style.opacity = typeof show === "number" ? show.toFixed(3) : "";
    el.style.transform = "translate3d(" + pt[0].toFixed(1) + "px," + pt[1].toFixed(1) + "px,0)";
  }
  function overlays(intro) {
    var s2 = [VP[0], VP[5], VP[12], VP[13], VP[14], droneAt[1], checkVis, altP, rise, pointer.x, pointer.y, pointer.in, intro > 0.9].join();
    if (s2 === sig) return;
    sig = s2;
    var labels = intro > 0.9;
    spots.forEach(function (s) { place(s.el, project(s.x, Math.max(0, s.h) * EX, s.z), labels && open > 0.2 ? smooth(0.2, 0.6, open) : 0); });
    ZONES.forEach(function (zone) {
      var lx = zone.tag ? zone.tag[0] * HALF : zone.p[0].cx, lz = zone.tag ? zone.tag[1] * HALF : zone.p[0].cz;
      place(zone.el, project(lx, groundY(lx, lz) + zone.tall * 0.6 * rise * EX, lz), labels ? smooth(0.6, 1, rise) : 0);
    });
    var gy = groundY(aim.x, aim.z), ground = Math.max(0, heightAt(aim.x, aim.z)), up = droneUp;
    var a = project(aim.x, gy, aim.z), b = project(droneAt[0], droneAt[1], droneAt[2]), top = project(aim.x, gy + up * EX, aim.z);
    var vis = checkVis > 0.05 && a && b && top;
    place(drone, b, vis ? checkVis : 0); place(groundTag, a, vis ? checkVis : 0);
    if (vis) {
      stem.setAttribute("x1", a[0].toFixed(1)); stem.setAttribute("y1", a[1].toFixed(1)); stem.setAttribute("x2", top[0].toFixed(1)); stem.setAttribute("y2", top[1].toFixed(1));
      stem.style.opacity = checkVis.toFixed(3);
      droneAlt.textContent = Math.round(up) + " m";
      groundTag.textContent = metres(Math.max(0, heightAt(check.x, check.z))) + " · " + gridRef(check.x, check.z);
    } else stem.style.opacity = "0";
    if (altMark) {
      flight.style.setProperty("--alt", (flying ? altP : 1).toFixed(4));
      altMark.textContent = Math.round((flying ? altP : 1) * 120) + " m";
    }
    // The sheet's edge: grid letters, numbers and a true 1 km scale bar, while the chart is still a sheet.
    if (flying && open < 0.99) {
      for (var g = 0; g < 8; g++) {
        var c = project(-HALF + 500 + g * 1000, 0, -HALF), rw = project(-HALF, 0, -HALF + 500 + g * 1000);
        if (c) colTags[g].style.transform = "translate3d(" + c[0].toFixed(1) + "px,0,0)";
        if (rw) rowTags[g].style.transform = "translate3d(0," + rw[1].toFixed(1) + "px,0)";
      }
      var s0 = project(0, 0, 0), s1 = project(1000, 0, 0);
      if (s0 && s1 && scaleBar) scaleBar.style.transform = "scaleX(" + (Math.abs(s1[0] - s0[0]) / 100).toFixed(3) + ")";
    }
    // The probe: a readout under the pointer, never trailing behind it.
    hover = pointer.in ? ray(pointer.x, pointer.y) : null;
    if (hover) {
      var t = L(), here = zonesAt(hover[0], hover[1]), hh = heightAt(hover[0], hover[1]);
      var top = here.length ? here[here.length - 1] : null;
      probe.textContent = gridRef(hover[0], hover[1]) + " · " + (hh < 0 ? "0 m (" + t.sea + ")" : metres(hh)) + (top ? " · " + t.tag[top.key] : "");
      probe.style.setProperty("--c", top ? "var(--z-" + top.key + ")" : "var(--muted)");
      probe.classList.toggle("flip", pointer.x > cw - 240);
      probe.style.transform = "translate3d(" + pointer.x.toFixed(1) + "px," + pointer.y.toFixed(1) + "px,0)";
      probe.style.opacity = "1";
    } else probe.style.opacity = "0";
  }

  function frame(ts) {
    now = (ts - t0) / 1000;
    // On phones, settle to 30 fps once the scroll and the finger rest.
    var settled = coarse && now - lastInput > 0.4 && Math.abs(progress() - ps) < 1e-3;
    skip = settled ? !skip : false;
    if ((flying || need || pointer.in) && !skip) {
      var gap = (ts - last) / 1000, dt = Math.min(0.1, gap); last = ts;
      update(dt);
      paintMask(dt);
      var intro = draw(now);
      overlays(intro);
      need = !reduce && intro < 1;
      // Adaptive quality: drop the resolution if frames run long, as on a phone with a weak GPU.
      frames++; slow = slow * 0.95 + (gap > (settled ? 2 : 1) / 40 ? 0.05 : 0);
      if (frames > 90 && slow > 0.6 && quality > 0.6) { quality *= 0.8; slow = 0; resize(); }
    }
    if (onScreen && !document.hidden) requestAnimationFrame(frame); else running = false;
  }
  function start() { if (running) return; running = true; last = performance.now(); requestAnimationFrame(frame); }

  readColours();
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", readColours);
  new MutationObserver(function (m) {
    if (m.some(function (r) { return r.attributeName === "data-lang"; })) relabel();
    if (m.some(function (r) { return r.attributeName === "data-theme"; })) readColours();
  }).observe(root, { attributes: true });
  relabel();
  resize();
  addEventListener("resize", resize);
  if (document.fonts) document.fonts.ready.then(resize);
  new IntersectionObserver(function (e) { onScreen = e[0].isIntersecting; if (onScreen) start(); }).observe(flight);
  document.addEventListener("visibilitychange", function () { if (!document.hidden && onScreen) start(); });
  if (!reduce) addEventListener("scroll", function () { need = true; lastInput = now; }, { passive: true });
  if (clock) {
    var fmt = new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    var tick = function () { clock.textContent = fmt.format(new Date()); };
    tick(); setInterval(tick, 1000);
  }
  start();
})();
