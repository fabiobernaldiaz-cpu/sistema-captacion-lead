/* ══════════════════════════════════════════════════════════════
   HISTORIA 3D — "De la auditoría a producción en 21 días".
   Una nube de partículas que se transforma con el scroll, una forma
   por fase del método:
     01 Auditoría  → nube dispersa (tus tareas, cada una por su lado)
     02 Diseño     → retícula (el proceso, ordenado sobre plano)
     03 Despliegue → esfera (el agente, compacto)
     04 Operación  → esfera con tres órbitas cian en marcha (igual que
                     el núcleo del vídeo de portada)
   WebGL 1 a pelo (~8 KB, sin three.js). Si no hay WebGL o se pide
   menos movimiento, la sección se queda como lista normal.
   ══════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var section = document.querySelector("[data-story]");
  if (!section) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var canvas = section.querySelector(".story-canvas");
  var gl = canvas && (canvas.getContext("webgl", { antialias: true, alpha: false, premultipliedAlpha: true, powerPreference: "high-performance" }) ||
                      canvas.getContext("experimental-webgl"));
  if (!gl) return;

  var steps = [].slice.call(section.querySelectorAll(".story-step"));
  var bars = [].slice.call(section.querySelectorAll(".story-progress i"));
  var narrow = function () { return window.innerWidth < 900; };

  /* ── Formas ─────────────────────────────────────────────── */
  var N = window.innerWidth < 760 ? 3600 : ((navigator.hardwareConcurrency || 4) <= 4 ? 5200 : 7200);
  var RING_R = [1.85, 2.2, 2.55];
  var RING_TILT = [[1.22, 0.18, 0], [0.34, 0.92, 0.28], [-0.62, -0.48, 0.82]];

  var seed = 1337;
  function rand() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  function gauss() { var u = rand() || 1e-6, v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2831853 * v); }

  var A = new Float32Array(N * 3), B = new Float32Array(N * 3), C = new Float32Array(N * 3), D = new Float32Array(N * 3);
  var META = new Float32Array(N * 4);

  // A · nube: cúmulos sueltos + polvo
  var clusters = [];
  for (var k = 0; k < 9; k++) clusters.push([(rand() - 0.5) * 6.4, (rand() - 0.5) * 3.2, (rand() - 0.5) * 3.2]);
  // B · retícula cúbica
  var side = Math.ceil(Math.cbrt(N));
  var span = 2.7;
  // C · esfera de Fibonacci
  var golden = Math.PI * (3 - Math.sqrt(5));

  for (var i = 0; i < N; i++) {
    var i3 = i * 3, i4 = i * 4;

    if (rand() < 0.72) {
      var c = clusters[i % clusters.length];
      A[i3] = c[0] + gauss() * 0.42; A[i3 + 1] = c[1] + gauss() * 0.32; A[i3 + 2] = c[2] + gauss() * 0.42;
    } else {
      A[i3] = (rand() - 0.5) * 8; A[i3 + 1] = (rand() - 0.5) * 4.4; A[i3 + 2] = (rand() - 0.5) * 5;
    }

    var gx = i % side, gy = Math.floor(i / side) % side, gz = Math.floor(i / (side * side));
    B[i3] = (gx / (side - 1) - 0.5) * span;
    B[i3 + 1] = (gy / (side - 1) - 0.5) * span;
    B[i3 + 2] = (gz / (side - 1) - 0.5) * span;

    var y = 1 - (i / (N - 1)) * 2, rr = Math.sqrt(1 - y * y), th = golden * i;
    C[i3] = Math.cos(th) * rr * 1.55; C[i3 + 1] = y * 1.55; C[i3 + 2] = Math.sin(th) * rr * 1.55;

    // D · 74 % en una esfera algo menor, 26 % repartidas en tres órbitas
    var ring = -1, theta = 0;
    if (i % 100 < 26) { ring = i % 3; theta = rand() * 6.2831853; }
    D[i3] = C[i3] * 0.82; D[i3 + 1] = C[i3 + 1] * 0.82; D[i3 + 2] = C[i3 + 2] * 0.82;

    META[i4] = rand();                       // semilla
    META[i4 + 1] = rand() < 0.07 ? 1 : 0;    // acento cian suelto
    META[i4 + 2] = ring;
    META[i4 + 3] = theta;
  }

  /* ── Shaders ────────────────────────────────────────────── */
  var VS = [
    "attribute vec3 aA; attribute vec3 aB; attribute vec3 aC; attribute vec3 aD; attribute vec4 aM;",
    "uniform float uP; uniform float uT; uniform mat4 uProj; uniform mat4 uView;",
    "uniform mat3 uR0; uniform mat3 uR1; uniform mat3 uR2; uniform vec3 uRR;",
    "uniform float uSize;",
    "varying float vA; varying float vC;",
    "float stage(float p, float k, float s) { return smoothstep(0.0, 1.0, clamp((p - k - s * 0.35) / 0.65, 0.0, 1.0)); }",
    "void main() {",
    "  float s = aM.x;",
    "  vec3 d = aD;",
    "  if (aM.z > -0.5) {",
    "    float r = aM.z < 0.5 ? uRR.x : (aM.z < 1.5 ? uRR.y : uRR.z);",
    "    float sp = aM.z < 0.5 ? 0.42 : (aM.z < 1.5 ? -0.33 : 0.27);",
    "    float a = aM.w + uT * sp;",
    "    vec3 q = vec3(cos(a) * r, sin(a) * r, 0.0);",
    "    d = aM.z < 0.5 ? uR0 * q : (aM.z < 1.5 ? uR1 * q : uR2 * q);",
    "  }",
    "  vec3 drift = vec3(sin(uT * 0.6 + s * 40.0), cos(uT * 0.5 + s * 31.0), sin(uT * 0.4 + s * 17.0));",
    "  float f1 = stage(uP, 0.0, s), f2 = stage(uP, 1.0, s), f3 = stage(uP, 2.0, s);",
    "  vec3 p = mix(aA + drift * 0.09, aB, f1);",
    "  p = mix(p, aC + drift * 0.015, f2);",
    "  p = mix(p, d, f3);",
    "  vec4 mv = uView * vec4(p, 1.0);",
    "  gl_Position = uProj * mv;",
    "  float depth = -mv.z;",
    "  float isRing = aM.z > -0.5 ? f3 : 0.0;",
    "  gl_PointSize = uSize * (1.0 + aM.y * 0.7 + isRing * 0.5) / depth;",
    "  vA = clamp(1.55 - depth * 0.13, 0.22, 1.0) * (0.62 + 0.38 * sin(uT * 1.6 + s * 50.0));",
    "  vC = max(aM.y * (1.0 - f3 * 0.6), isRing);",
    "}"
  ].join("\n");

  var FS = [
    "precision mediump float;",
    "varying float vA; varying float vC;",
    "void main() {",
    "  vec2 c = gl_PointCoord - 0.5;",
    "  float r = dot(c, c);",
    "  if (r > 0.25) discard;",
    "  float a = smoothstep(0.25, 0.0, r) * vA;",
    "  vec3 col = mix(vec3(0.93, 0.94, 0.97), vec3(0.0, 0.83, 1.0), vC);",
    "  gl_FragColor = vec4(col * a, a);",
    "}"
  ].join("\n");

  function shader(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { throw new Error(gl.getShaderInfoLog(s)); }
    return s;
  }
  var prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) {
    return; // sin 3D: la sección sigue funcionando como lista
  }
  gl.useProgram(prog);

  function attr(name, data, size) {
    var loc = gl.getAttribLocation(prog, name);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  }
  attr("aA", A, 3); attr("aB", B, 3); attr("aC", C, 3); attr("aD", D, 3); attr("aM", META, 4);

  var U = {};
  ["uP", "uT", "uProj", "uView", "uR0", "uR1", "uR2", "uRR", "uSize"].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });

  /* ── Matrices ───────────────────────────────────────────── */
  function rotXYZ(x, y, z) {
    var cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z);
    // R = Rx · Ry · Rz (columna mayor para WebGL)
    return new Float32Array([
      cy * cz, cx * sz + sx * sy * cz, sx * sz - cx * sy * cz,
      -cy * sz, cx * cz - sx * sy * sz, sx * cz + cx * sy * sz,
      sy, -sx * cy, cx * cy
    ]);
  }
  gl.uniformMatrix3fv(U.uR0, false, rotXYZ.apply(null, RING_TILT[0]));
  gl.uniformMatrix3fv(U.uR1, false, rotXYZ.apply(null, RING_TILT[1]));
  gl.uniformMatrix3fv(U.uR2, false, rotXYZ.apply(null, RING_TILT[2]));
  gl.uniform3f(U.uRR, RING_R[0], RING_R[1], RING_R[2]);

  function perspective(fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
  }
  function view(ry, rx, ox, oy, dist) {
    var cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx);
    // T(ox, oy, -dist) · Rx · Ry
    return new Float32Array([
      cy, sx * sy, -cx * sy, 0,
      0, cx, sx, 0,
      sy, -sx * cy, cx * cy, 0,
      ox, oy, -dist, 1
    ]);
  }

  /* ── Tamaño y bucle ─────────────────────────────────────── */
  var DPR = Math.min(window.devicePixelRatio || 1, 1.75);
  var W = 0, H = 0;
  function resize() {
    var r = canvas.getBoundingClientRect();
    W = Math.max(2, Math.round(r.width * DPR));
    H = Math.max(2, Math.round(r.height * DPR));
    canvas.width = W; canvas.height = H;
    gl.viewport(0, 0, W, H);
    gl.uniformMatrix4fv(U.uProj, false, perspective(0.62, W / H, 0.1, 60));
    gl.uniform1f(U.uSize, (narrow() ? 26 : 30) * DPR * Math.min(1.25, H / (900 * DPR) + 0.35));
  }

  gl.clearColor(0, 0, 0, 1);
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE); // aditivo: donde se juntan partículas, hay más luz

  var target = 0, cur = 0, t0 = performance.now(), raf = null, visible = false;

  function rawProgress() {
    var r = section.getBoundingClientRect();
    var total = section.offsetHeight - window.innerHeight;
    return total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 0;
  }
  // escalera suave: cada forma se queda quieta un rato antes de transformarse
  function staircase(x) {
    var raw = x * 3, k = Math.min(2, Math.floor(raw)), f = raw - k;
    if (raw >= 3) return 3;
    var e = Math.min(1, Math.max(0, (f - 0.22) / 0.56));
    return k + e * e * (3 - 2 * e);
  }

  var active = -1;
  function paintUI(x) {
    var idx = Math.min(3, Math.max(0, Math.round(x * 3)));
    if (idx !== active) {
      active = idx;
      steps.forEach(function (s, i) {
        s.classList.toggle("is-active", i === idx);
        s.setAttribute("aria-hidden", i === idx ? "false" : "true");
      });
    }
    bars.forEach(function (b, i) { b.style.setProperty("--p", Math.min(1, Math.max(0, x * 4 - i)).toFixed(3)); });
  }

  function frame(now) {
    raf = null;
    var x = rawProgress();
    target = staircase(x);
    cur += (target - cur) * 0.085;
    var t = (now - t0) / 1000;

    var ox = narrow() ? 0 : 1.75;
    var oy = narrow() ? 0.62 : 0.05;
    gl.uniform1f(U.uP, cur);
    gl.uniform1f(U.uT, t);
    gl.uniformMatrix4fv(U.uView, false, view(t * 0.09 + cur * 0.55, 0.32 - cur * 0.05, ox, oy, narrow() ? 8.4 : 7.2));
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.POINTS, 0, N);
    paintUI(x);

    if (visible && !document.hidden) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }

  section.classList.add("is-live");
  steps.forEach(function (s, i) { s.setAttribute("aria-hidden", i === 0 ? "false" : "true"); });
  resize();
  paintUI(0);
  frame(performance.now());

  new IntersectionObserver(function (en) {
    visible = en[0].isIntersecting;
    if (visible) kick();
  }, { rootMargin: "100px 0px" }).observe(section);
  document.addEventListener("visibilitychange", function () { if (!document.hidden && visible) kick(); });
  var rt;
  window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { resize(); kick(); }, 150); });
  canvas.addEventListener("webglcontextlost", function (e) { e.preventDefault(); section.classList.remove("is-live"); });
})();
