/* @ds-bundle: {"format":4,"namespace":"EncrePapier","components":[{"name":"FlowField"},{"name":"Voronoi"},{"name":"Mark"},{"name":"DataField"},{"name":"Chart"},{"name":"FlowBackground"},{"name":"FlowType"},{"name":"Dialog"},{"name":"Tabs"},{"name":"Tooltip"},{"name":"LiquidGlass"},{"name":"Scene"},{"name":"Searchbox"},{"name":"Slider"},{"name":"Player"}]} */
(function () {
  "use strict";
  var NS = "EncrePapier";
  var TAU = Math.PI * 2;
  var HAS_DOM = typeof document !== "undefined" && typeof window !== "undefined";

  /* ---------------------------------------------------------------- aléa */
  function hashStr(s) {
    var h = 2166136261 >>> 0, i;
    s = String(s);
    for (i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
    return h >>> 0;
  }
  function seedOf(v) {
    if (typeof v === "number" && isFinite(v)) return v | 0;
    var n = Number(v);
    if (String(v).trim() !== "" && isFinite(n)) return n | 0;
    return hashStr(v);
  }
  function rng(seed) {
    var a = seed | 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /* bruit de gradient 2D, valeurs dans [-1, 1] environ */
  function noise2(seed) {
    var r = rng(seed), perm = new Uint8Array(512), p = [], gx = [], gy = [], i, j, t, a;
    for (i = 0; i < 256; i++) p.push(i);
    for (i = 255; i > 0; i--) { j = (r() * (i + 1)) | 0; t = p[i]; p[i] = p[j]; p[j] = t; }
    for (i = 0; i < 512; i++) perm[i] = p[i & 255];
    for (i = 0; i < 256; i++) { a = r() * TAU; gx.push(Math.cos(a)); gy.push(Math.sin(a)); }
    function fade(u) { return u * u * u * (u * (u * 6 - 15) + 10); }
    return function (x, y) {
      var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      xi &= 255; yi &= 255;
      var A = perm[perm[xi] + yi], B = perm[perm[xi + 1] + yi], C = perm[perm[xi] + yi + 1], D = perm[perm[xi + 1] + yi + 1];
      var u = fade(xf), v = fade(yf);
      var n00 = gx[A] * xf + gy[A] * yf, n10 = gx[B] * (xf - 1) + gy[B] * yf;
      var n01 = gx[C] * xf + gy[C] * (yf - 1), n11 = gx[D] * (xf - 1) + gy[D] * (yf - 1);
      var x1 = n00 + u * (n10 - n00), x2 = n01 + u * (n11 - n01);
      return (x1 + v * (x2 - x1)) * 1.6;
    };
  }

  /* ----------------------------------------------- champ de flux (lignes) */
  /* Renvoie des polylignes [[x, y], ...] dans un espace virtuel w x h.
     Une grille stocke un angle (bruit lisse). Des courbes partent de points
     au hasard, suivent les angles et s'arrêtent avant de toucher une autre. */
  function flowLines(o) {
    o = o || {};
    var W = o.w || 600, H = o.h || 750;
    var seed = seedOf(o.seed == null ? 7 : o.seed), R = rng(seed), N = noise2(seed * 7 + 3);
    var sc = o.scale || 0.0034, sep = o.sep || 5, step = o.step || 2.4;
    var maxLen = o.maxLen || 520, minPts = o.minPts || 12, warp = o.warp == null ? 1 : o.warp;
    var bias = o.bias || 0, time = o.time || 0, margin = o.margin || 0;
    var count = o.count || Math.round(56000 * (W * H) / (600 * 750));
    var amp = o.amp, mask = o.mask, clear = o.clear;
    var cx = W / 2, cy = H / 2, hr = (o.hole || 0) * Math.min(W, H) / 2;
    var cell = sep, gw = Math.ceil(W / cell) + 2, gh = Math.ceil(H / cell) + 2;
    var grid = new Array(gw * gh);
    var selfGap = Math.ceil(sep * 1.7 / step) + 2;
    var lines = [], i;

    function angleAt(x, y) {
      var a = amp ? amp(x, y) : 1;
      return bias + N(x * sc + time * 0.35, y * sc + time * 0.21) * TAU * warp * a;
    }
    function inside(x, y) {
      if (x < margin || y < margin || x > W - margin || y > H - margin) return false;
      if (hr) { var dx = x - cx, dy = y - cy; if (dx * dx + dy * dy < hr * hr) return false; }
      if (clear && x > clear[0] * W && x < (clear[0] + clear[2]) * W && y > clear[1] * H && y < (clear[1] + clear[3]) * H) return false;
      if (mask && !mask(x, y)) return false;
      return true;
    }
    function free(x, y, id, idx) {
      var gx0 = (x / cell) | 0, gy0 = (y / cell) | 0, s2 = sep * sep, j, k, b, e, dx, dy;
      for (j = gy0 - 1; j <= gy0 + 1; j++) {
        if (j < 0 || j >= gh) continue;
        for (k = gx0 - 1; k <= gx0 + 1; k++) {
          if (k < 0 || k >= gw) continue;
          b = grid[j * gw + k];
          if (!b) continue;
          for (e = 0; e < b.length; e += 4) {
            if (b[e + 2] === id && Math.abs(b[e + 3] - idx) < selfGap) continue;
            dx = b[e] - x; dy = b[e + 1] - y;
            if (dx * dx + dy * dy < s2) return false;
          }
        }
      }
      return true;
    }
    function put(x, y, id, idx) {
      var gi = ((y / cell) | 0) * gw + ((x / cell) | 0);
      (grid[gi] || (grid[gi] = [])).push(x, y, id, idx);
    }
    function trace(x, y, dir, id) {
      var pts = [], n, a;
      for (n = 1; n < maxLen; n++) {
        a = angleAt(x, y);
        x += Math.cos(a) * step * dir; y += Math.sin(a) * step * dir;
        if (!inside(x, y) || !free(x, y, id, n * dir)) break;
        pts.push([x, y]);
      }
      return pts;
    }
    for (i = 0; i < count; i++) {
      var x0 = R() * W, y0 = R() * H, id = lines.length + 1;
      if (!inside(x0, y0) || !free(x0, y0, id, 0)) continue;
      var f = trace(x0, y0, 1, id), b = trace(x0, y0, -1, id);
      if (f.length + b.length + 1 < minPts) continue;
      var line = b.reverse().concat([[x0, y0]], f), k;
      put(x0, y0, id, 0);
      for (k = 0; k < f.length; k++) put(f[k][0], f[k][1], id, k + 1);
      for (k = 0; k < b.length; k++) put(b[b.length - 1 - k][0], b[b.length - 1 - k][1], id, -(k + 1));
      lines.push(line);
    }
    return lines;
  }

  /* Rubans : des fils partent des deux bords et suivent un champ qui bouge. */
  function ribbonLines(o) {
    o = o || {};
    var W = o.w || 600, H = o.h || 750, seed = seedOf(o.seed == null ? 7 : o.seed), N = noise2(seed * 7 + 3);
    var n = o.count || 72, sc = o.scale || 0.0028, step = o.step || 4, len = o.maxLen || 150, time = o.time || 0;
    var warp = o.warp == null ? 0.9 : o.warp, clear = o.clear, out = [], i, k, x, y, a, line, side, f;
    for (i = 0; i < n; i++) {
      side = i % 2 ? 1 : -1; f = (Math.floor(i / 2) + 0.5) / Math.ceil(n / 2);
      x = side > 0 ? W : 0; y = f * H; line = [[x, y]];
      for (k = 0; k < len; k++) {
        a = N(x * sc + time * 0.5, y * sc + time * 0.3 + 11) * TAU * warp + (side > 0 ? Math.PI : 0) + Math.sin(f * TAU + time) * 0.1;
        x += Math.cos(a) * step; y += Math.sin(a) * step;
        if (x < -20 || x > W + 20 || y < -20 || y > H + 20) break;
        if (clear && x > clear[0] * W && x < (clear[0] + clear[2]) * W && y > clear[1] * H && y < (clear[1] + clear[3]) * H) break;
        line.push([x, y]);
      }
      if (line.length > 4) out.push(line);
    }
    return out;
  }

  /* ------------------------------------------------------------- Voronoï */
  function clipHalf(poly, nx, ny, c) {
    var out = [], n = poly.length, i, a, b, da, db, t;
    for (i = 0; i < n; i++) {
      a = poly[i]; b = poly[(i + 1) % n];
      da = nx * a[0] + ny * a[1] - c; db = nx * b[0] + ny * b[1] - c;
      if (da <= 0) out.push(a);
      if ((da < 0 && db > 0) || (da > 0 && db < 0)) { t = da / (da - db); out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]); }
    }
    return out;
  }
  function voronoiCells(pts, W, H) {
    var cells = [], i, j, poly, nx, ny, c;
    for (i = 0; i < pts.length; i++) {
      poly = [[0, 0], [W, 0], [W, H], [0, H]];
      for (j = 0; j < pts.length && poly.length; j++) {
        if (j === i) continue;
        nx = pts[j][0] - pts[i][0]; ny = pts[j][1] - pts[i][1];
        c = nx * (pts[i][0] + pts[j][0]) / 2 + ny * (pts[i][1] + pts[j][1]) / 2;
        poly = clipHalf(poly, nx, ny, c);
      }
      cells.push(poly);
    }
    return cells;
  }
  function centroid(poly) {
    var a = 0, cx = 0, cy = 0, n = poly.length, i, p, q, f;
    if (n < 3) return n ? poly[0] : [0, 0];
    for (i = 0; i < n; i++) {
      p = poly[i]; q = poly[(i + 1) % n]; f = p[0] * q[1] - q[0] * p[1];
      a += f; cx += (p[0] + q[0]) * f; cy += (p[1] + q[1]) * f;
    }
    if (Math.abs(a) < 1e-9) return poly[0];
    return [cx / (3 * a), cy / (3 * a)];
  }
  function voronoiSeeds(seed, n, W, H) {
    var R = rng(seedOf(seed)), pts = [], i;
    for (i = 0; i < n; i++) pts.push([R() * W, R() * H]);
    return pts;
  }
  /* un pas de Lloyd : chaque graine glisse vers le centre de sa cellule */
  function relax(pts, W, H, rate) {
    var cells = voronoiCells(pts, W, H), moved = 0, i, c, dx, dy;
    for (i = 0; i < pts.length; i++) {
      c = centroid(cells[i]); dx = (c[0] - pts[i][0]) * rate; dy = (c[1] - pts[i][1]) * rate;
      pts[i][0] += dx; pts[i][1] += dy; moved = Math.max(moved, Math.abs(dx) + Math.abs(dy));
    }
    return moved;
  }

  /* ------------------------------------------------- courbes paramétriques */
  function lorenzLine(o) {
    o = o || {};
    var W = o.w || 600, H = o.h || 750, n = o.points || 9000, h = 0.005, rot = o.rotation || 0.6;
    var seed = seedOf(o.seed == null ? 1 : o.seed), R = rng(seed);
    var x = 1 + R() * 0.5, y = 1 + R() * 0.5, z = 1 + R() * 0.5, i, pts = [], k1, k2, k3, k4;
    function f(s) { return [10 * (s[1] - s[0]), s[0] * (28 - s[2]) - s[1], s[0] * s[1] - (8 / 3) * s[2]]; }
    var s = [x, y, z];
    for (i = 0; i < n + 400; i++) {
      k1 = f(s); k2 = f([s[0] + h / 2 * k1[0], s[1] + h / 2 * k1[1], s[2] + h / 2 * k1[2]]);
      k3 = f([s[0] + h / 2 * k2[0], s[1] + h / 2 * k2[1], s[2] + h / 2 * k2[2]]);
      k4 = f([s[0] + h * k3[0], s[1] + h * k3[1], s[2] + h * k3[2]]);
      s = [s[0] + h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]), s[1] + h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]), s[2] + h / 6 * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2])];
      if (i >= 400) pts.push([s[0], s[1], s[2] - 25]);
    }
    var c = Math.cos(rot), sn = Math.sin(rot), minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9, pr = [];
    for (i = 0; i < pts.length; i++) {
      var px = pts[i][0] * c + pts[i][1] * sn, py = pts[i][2];
      pr.push([px, py]); if (px < minx) minx = px; if (px > maxx) maxx = px; if (py < miny) miny = py; if (py > maxy) maxy = py;
    }
    var m = 0.1, k = Math.min(W * (1 - 2 * m) / (maxx - minx), H * (1 - 2 * m) / (maxy - miny));
    var ox = (W - (maxx - minx) * k) / 2, oy = (H - (maxy - miny) * k) / 2;
    return [pr.map(function (p) { return [ox + (p[0] - minx) * k, oy + (p[1] - miny) * k]; })];
  }
  /* Rosettes : épitrochoïdes fermées (R entier, r = 1), plusieurs bandes déphasées qui se tissent. */
  function guillocheLines(o) {
    o = o || {};
    var W = o.w || 600, H = o.h || 750, seed = seedOf(o.seed == null ? 3 : o.seed), R = rng(seed);
    var bands = o.bands || 7, out = [], b, t, pts, cx = W / 2, cy = H / 2, base = Math.min(W, H) * 0.44;
    var Rs = [5, 7, 9, 11], Rr = Rs[Math.floor(R() * Rs.length)];
    for (b = 0; b < bands; b++) {
      var d = 0.55 + 0.75 * R(), ph = (b % 2 ? Math.PI / (Rr + 1) : 0) + b * 0.11, rad = base * (0.42 + 0.58 * (b + 1) / bands);
      var norm = (Rr + 1) + d, steps = 720; pts = [];
      for (t = 0; t <= steps; t++) {
        var a = t / steps * TAU;
        pts.push([cx + ((Rr + 1) * Math.cos(a + ph) - d * Math.cos((Rr + 1) * a + ph)) / norm * rad, cy + ((Rr + 1) * Math.sin(a + ph) - d * Math.sin((Rr + 1) * a + ph)) / norm * rad]);
      }
      out.push(pts);
    }
    return out;
  }

  /* ---------------------------------------------------------------- SVG */
  function f1(n) { return String(Math.round(n * 10) / 10); }
  function pathD(lines) {
    var s = "", i, j, l;
    for (i = 0; i < lines.length; i++) {
      l = lines[i]; if (l.length < 2) continue;
      s += "M" + f1(l[0][0]) + " " + f1(l[0][1]) + "L";
      for (j = 1; j < l.length; j++) s += f1(l[j][0]) + " " + f1(l[j][1]) + (j < l.length - 1 ? " " : "");
    }
    return s;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  /* o.stroke : couleur du trait (défaut currentColor) ; o.background : fond ou rien */
  function svgOf(lines, o) {
    o = o || {};
    var W = o.w || 600, H = o.h || 750, stroke = o.stroke || "currentColor", wt = o.weight || 1;
    var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + " " + H + '"' + (o.width ? ' width="' + o.width + '"' : "") + (o.height ? ' height="' + o.height + '"' : "") + ' role="img" aria-label="' + esc(o.label || "Illustration générative") + '">';
    if (o.background) s += '<rect width="' + W + '" height="' + H + '" fill="' + o.background + '"/>';
    s += (o.extra || "") + '<path d="' + pathD(lines) + '" fill="none" stroke="' + stroke + '" stroke-width="' + wt + '" stroke-linecap="round" stroke-linejoin="round"' + (o.vector ? ' vector-effect="non-scaling-stroke"' : "") + "/>";
    return s + "</svg>";
  }
  function flowSVG(o) {
    o = o || {};
    var lines = o.mode === "ribbons" ? ribbonLines(o) : flowLines(o);
    return svgOf(lines, o);
  }
  function voronoiSVG(o) {
    o = o || {};
    var W = o.w || 600, H = o.h || 750, pts = voronoiSeeds(o.seed == null ? 3 : o.seed, o.cells || 64, W, H), i;
    for (i = 0; i < (o.steps == null ? 40 : o.steps); i++) relax(pts, W, H, 0.6);
    var cells = voronoiCells(pts, W, H), lines = [];
    cells.forEach(function (c) { if (c.length > 2) lines.push(c.concat([c[0]])); });
    return svgOf(lines, o);
  }
  /* Marque d'identité : un nom donne un seed, le seed donne une marque dans un cercle. */
  function markSVG(name, o) {
    o = o || {};
    var S = 200, r = 96, seed = seedOf(String(name || "").trim().toLowerCase() || "sans nom"), cx = S / 2;
    var lines = flowLines({ w: S, h: S, seed: seed, count: 420, sep: 6.2, step: 1.8, scale: 0.012, maxLen: 160, minPts: 8, warp: 1,
      mask: function (x, y) { var dx = x - cx, dy = y - cx; return dx * dx + dy * dy < (r - 5) * (r - 5); } });
    var stroke = o.stroke || "currentColor";
    var ring = '<circle cx="' + cx + '" cy="' + cx + '" r="' + r + '" fill="' + (o.fill || "none") + '" stroke="' + stroke + '" stroke-width="' + (o.ring || 1.6) + '"/>';
    return svgOf(lines, { w: S, h: S, stroke: stroke, weight: o.weight || 1.5, extra: ring, label: o.label || "Marque de " + name, width: o.size, height: o.size, background: o.background });
  }
  /* Champ piloté par des données : barres en bas, la turbulence au-dessus suit la hauteur. */
  function dataFieldSVG(o) {
    o = o || {};
    var data = (o.data || []).map(Number), labels = o.labels || [], n = data.length || 1;
    var W = o.w || 600, H = o.h || 420, barH = o.barH || 72, labelH = labels.length ? 22 : 8, fieldH = H - barH - labelH - 8;
    var max = Math.max.apply(null, data.concat([1e-9])), min = Math.min.apply(null, data.concat([0]));
    var norm = function (v) { return (v - min) / (max - min || 1); };
    var colW = W / n;
    function level(x) {
      var p = x / colW - 0.5, i = Math.max(0, Math.min(n - 1, Math.floor(p))), j = Math.min(n - 1, i + 1), t = Math.max(0, Math.min(1, p - i));
      var u = t * t * (3 - 2 * t);
      return norm(data[i]) * (1 - u) + norm(data[j]) * u;
    }
    var lines = flowLines({ w: W, h: fieldH, seed: o.seed == null ? 7 : o.seed, sep: o.sep || 5.5, step: 2.2, scale: 0.006, bias: 0, warp: 1,
      amp: function (x) { return 0.05 + 1.15 * level(x); }, margin: 2 });
    var stroke = o.stroke || "currentColor", bars = "", txt = "", i, bw = Math.max(2, colW * 0.46), by = fieldH + 8;
    for (i = 0; i < n; i++) {
      var hh = Math.max(1.5, norm(data[i]) * barH), bx = colW * i + (colW - bw) / 2;
      bars += '<rect x="' + f1(bx) + '" y="' + f1(by + barH - hh) + '" width="' + f1(bw) + '" height="' + f1(hh) + '" fill="' + stroke + '"/>';
      if (labels[i] != null) txt += '<text x="' + f1(colW * i + colW / 2) + '" y="' + (by + barH + 16) + '" text-anchor="middle" font-family="DM Mono, ui-monospace, monospace" font-size="11" fill="' + stroke + '" opacity=".72">' + esc(labels[i]) + "</text>";
    }
    var base = '<line x1="0" x2="' + W + '" y1="' + (by + barH + 0.5) + '" y2="' + (by + barH + 0.5) + '" stroke="' + stroke + '" stroke-opacity=".32" stroke-width="1"/>';
    var desc = "Barres : " + data.map(function (v, k) { return (labels[k] != null ? labels[k] + " " : "") + v; }).join(", ") + ". Plus la barre est haute, plus le champ au-dessus est turbulent.";
    var svg = svgOf(lines, { w: W, h: H, stroke: stroke, weight: o.weight || 1, label: desc, extra: "" });
    return svg.replace("</svg>", bars + base + txt + "</svg>");
  }

  /* ------------------------------------------------------------- utilités DOM */
  function ready(fn) { if (!HAS_DOM) return; if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn); else fn(); }
  function reducedMotion() { return HAS_DOM && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
  function attrNum(el, name, def) { var v = el.getAttribute(name); if (v == null || v === "") return def; var n = parseFloat(v); return isFinite(n) ? n : def; }
  function parseRect(s) { if (!s) return null; var a = String(s).split(/[ ,]+/).map(parseFloat); return a.length === 4 && a.every(isFinite) ? a : null; }
  function define(name, cls) { if (HAS_DOM && window.customElements && !customElements.get(name)) customElements.define(name, cls); }
  var themeWatchers = [];
  function watchTheme(fn) {
    themeWatchers.push(fn);
  }
  if (HAS_DOM) {
    var tw = function () { themeWatchers.forEach(function (f) { try { f(); } catch (e) { /* noop */ } }); };
    try { new MutationObserver(tw).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class", "style"] }); } catch (e) { /* noop */ }
    if (window.matchMedia) { try { window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", tw); } catch (e) { /* noop */ } }
  }

  /* --------------------------------------------------------- <ep-flow-field> */
  /* Canvas sans dépendance. Attributs : seed, mode (field|ribbons), density, scale, sep, hole, clear, warp,
     weight, animate (draw|none), paused, controls, fill, label. Couleur du trait = color du CSS (ink). */
  var FlowField = HAS_DOM ? class extends HTMLElement {
    static get observedAttributes() { return ["seed", "mode", "density", "scale", "sep", "hole", "clear", "warp", "weight", "animate", "paused", "label"]; }
    connectedCallback() {
      if (this._ready) { this._build(); return; }
      this._ready = true;
      if (getComputedStyle(this).display === "inline") this.style.display = "block";
      this._canvas = document.createElement("canvas");
      this._canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
      if (getComputedStyle(this).position === "static") this.style.position = "relative";
      this.appendChild(this._canvas);
      this.setAttribute("role", "img");
      this._aria();
      if (this.hasAttribute("controls")) {
        this.tabIndex = 0;
        this.addEventListener("keydown", (e) => { if (e.key === " " || e.code === "Space") { e.preventDefault(); this.toggle(); } });
        this.addEventListener("click", () => this.toggle());
        this.style.cursor = "pointer";
      }
      this._ro = new ResizeObserver(() => { clearTimeout(this._rt); this._rt = setTimeout(() => this._build(), 80); });
      this._ro.observe(this);
      this._io = new IntersectionObserver((es) => { this._visible = es[0].isIntersecting; if (this._visible && this._loop && !this.paused) this._tick(); });
      this._io.observe(this);
      this._visible = true;
      this._themeFn = () => this._paintAll();
      watchTheme(this._themeFn);
      this._build();
    }
    disconnectedCallback() {
      if (this._ro) this._ro.disconnect();
      if (this._io) this._io.disconnect();
      cancelAnimationFrame(this._raf);
      var i = themeWatchers.indexOf(this._themeFn); if (i >= 0) themeWatchers.splice(i, 1);
      this._ready = false;
    }
    attributeChangedCallback(name) {
      if (!this._ready) return;
      if (name === "label") { this._aria(); return; }
      if (name === "paused") { if (!this.paused) this._tick(); return; }
      clearTimeout(this._at); this._at = setTimeout(() => this._build(), 30);
    }
    get paused() { return this.hasAttribute("paused"); }
    set paused(v) { if (v) this.setAttribute("paused", ""); else this.removeAttribute("paused"); }
    toggle() { this.paused = !this.paused; return this.paused; }
    reseed(n) { this.setAttribute("seed", String(n == null ? (Math.random() * 99999) | 0 : n)); }
    _aria() { this.setAttribute("aria-label", this.getAttribute("label") || "Illustration générative : lignes qui suivent un champ de flux"); }
    _opts() {
      var cw = this.clientWidth || 300, ch = this.clientHeight || cw * 1.25;
      var W = Math.min(cw, 900), H = W * ch / cw;
      return { cw: cw, ch: ch, w: W, h: H, seed: this.getAttribute("seed") == null ? 7 : this.getAttribute("seed"), mode: this.getAttribute("mode") || "field",
        density: attrNum(this, "density", 1), scale: attrNum(this, "scale", 0.0034 * 600 / Math.max(W, 300) * 1.0), sep: attrNum(this, "sep", 5),
        hole: attrNum(this, "hole", 0), warp: attrNum(this, "warp", 1), clear: parseRect(this.getAttribute("clear")), weight: attrNum(this, "weight", 1) };
    }
    _build() {
      if (!this._ready) return;
      cancelAnimationFrame(this._raf);
      var o = this._opts(); this._o = o;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      this._canvas.width = Math.max(1, Math.round(o.cw * dpr)); this._canvas.height = Math.max(1, Math.round(o.ch * dpr));
      this._k = this._canvas.width / o.w;
      this._loop = false;
      if (o.mode === "ribbons") {
        this._loop = !reducedMotion() && this.getAttribute("animate") !== "none"; this._t = this._t || 0; this._last = 0;
        this._paintRibbons();
        if (this._loop && !this.paused) this._tick();
        return;
      }
      this._lines = flowLines({ w: o.w, h: o.h, seed: o.seed, count: Math.round(56000 * (o.w * o.h) / (600 * 750) * o.density), scale: o.scale, sep: o.sep, hole: o.hole, warp: o.warp, clear: o.clear });
      this._n = this._lines.length;
      var anim = this.getAttribute("animate") !== "none" && !reducedMotion();
      this._p = anim ? 0 : 1; this._drawn = new Array(this._n).fill(0);
      this._clearCanvas();
      if (anim) { this._t0 = 0; this._loop = true; this._tick(); } else this._paintAll();
      this.dispatchEvent(new CustomEvent("ep-ready", { detail: { lines: this._n } }));
    }
    _ink() { return getComputedStyle(this).color || "#17181b"; }
    _clearCanvas() { var c = this._canvas.getContext("2d"); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this._canvas.width, this._canvas.height); }
    _ctx() {
      var c = this._canvas.getContext("2d");
      c.setTransform(this._k, 0, 0, this._k, 0, 0);
      c.strokeStyle = this._ink(); c.lineWidth = this._o.weight / this._k * (this._canvas.width / this._o.cw); c.lineCap = "round"; c.lineJoin = "round";
      return c;
    }
    _paintAll() {
      if (!this._ready || !this._o) return;
      if (this._o.mode === "ribbons") { this._paintRibbons(); return; }
      if (!this._lines) return;
      this._clearCanvas(); var c = this._ctx(), i, j, l;
      c.beginPath();
      var upto = this._p >= 1 ? null : this._drawn;
      for (i = 0; i < this._n; i++) {
        l = this._lines[i]; var m = upto ? upto[i] : l.length; if (m < 2) continue;
        c.moveTo(l[0][0], l[0][1]); for (j = 1; j < m; j++) c.lineTo(l[j][0], l[j][1]);
      }
      c.stroke();
    }
    _paintRibbons() {
      var o = this._o; this._clearCanvas(); var c = this._ctx();
      var lines = ribbonLines({ w: o.w, h: o.h, seed: o.seed, count: Math.round(70 * o.density * Math.max(0.6, o.w / 600)), time: this._t || 0, clear: o.clear, scale: o.scale * 0.85 });
      c.beginPath(); lines.forEach(function (l) { c.moveTo(l[0][0], l[0][1]); for (var j = 1; j < l.length; j++) c.lineTo(l[j][0], l[j][1]); }); c.stroke();
    }
    _tick() {
      if (!this._loop || this.paused || !this._visible) return;
      cancelAnimationFrame(this._raf);
      this._raf = requestAnimationFrame((now) => {
        if (this._o.mode === "ribbons") {
          var dt = this._last ? Math.min(0.05, (now - this._last) / 1000) : 0; this._last = now; this._t += dt * 0.35; this._paintRibbons(); this._tick(); return;
        }
        if (!this._t0) this._t0 = now;
        var DUR = 4200, p = Math.min(1, (now - this._t0) / DUR), c = this._ctx(), i, j, l, tgt, from;
        c.beginPath();
        for (i = 0; i < this._n; i++) {
          l = this._lines[i]; var s = (i / this._n) * 0.72, e = s + 0.28; var q = Math.max(0, Math.min(1, (p - s) / (e - s))); q = q * q * (3 - 2 * q);
          tgt = Math.round(q * l.length); from = this._drawn[i];
          if (tgt > from && tgt >= 2) { c.moveTo(l[Math.max(0, from - 1)][0], l[Math.max(0, from - 1)][1]); for (j = Math.max(1, from); j < tgt; j++) c.lineTo(l[j][0], l[j][1]); this._drawn[i] = tgt; }
        }
        c.stroke(); this._p = p;
        if (p < 1) this._tick(); else { this._loop = false; this._p = 1; this._paintAll(); }
      });
    }
    toSVG(opts) {
      var o = this._opts();
      return flowSVG(Object.assign({ w: o.w, h: o.h, seed: o.seed, mode: o.mode, count: Math.round(56000 * (o.w * o.h) / (600 * 750) * o.density), scale: o.scale, sep: o.sep, hole: o.hole, warp: o.warp, clear: o.clear, stroke: this._ink(), weight: 1 }, opts || {}));
    }
  } : null;

  /* ------------------------------------------------------------ <ep-voronoi> */
  var Voronoi = HAS_DOM ? class extends HTMLElement {
    static get observedAttributes() { return ["seed", "cells", "animate", "paused", "dots", "label"]; }
    connectedCallback() {
      if (this._ready) { this._build(); return; }
      this._ready = true;
      if (getComputedStyle(this).display === "inline") this.style.display = "block";
      if (getComputedStyle(this).position === "static") this.style.position = "relative";
      this._canvas = document.createElement("canvas"); this._canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
      this.appendChild(this._canvas); this.setAttribute("role", "img"); this.setAttribute("aria-label", this.getAttribute("label") || "Illustration générative : un maillage de cellules qui s'égalise");
      if (this.hasAttribute("controls")) { this.tabIndex = 0; this.style.cursor = "pointer"; this.addEventListener("keydown", (e) => { if (e.code === "Space") { e.preventDefault(); this.paused = !this.paused; } }); this.addEventListener("click", () => { this.paused = !this.paused; }); }
      this._ro = new ResizeObserver(() => { clearTimeout(this._rt); this._rt = setTimeout(() => this._build(), 80); }); this._ro.observe(this);
      this._io = new IntersectionObserver((es) => { this._vis = es[0].isIntersecting; if (this._vis) this._tick(); }); this._io.observe(this); this._vis = true;
      this._tf = () => this._paint(); watchTheme(this._tf);
      this._build();
    }
    disconnectedCallback() { if (this._ro) this._ro.disconnect(); if (this._io) this._io.disconnect(); cancelAnimationFrame(this._raf); var i = themeWatchers.indexOf(this._tf); if (i >= 0) themeWatchers.splice(i, 1); this._ready = false; }
    attributeChangedCallback(n) { if (!this._ready) return; if (n === "paused") { if (!this.paused) this._tick(); return; } clearTimeout(this._at); this._at = setTimeout(() => this._build(), 30); }
    get paused() { return this.hasAttribute("paused"); }
    set paused(v) { if (v) this.setAttribute("paused", ""); else this.removeAttribute("paused"); }
    _build() {
      var cw = this.clientWidth || 300, ch = this.clientHeight || cw * 1.25, dpr = Math.min(window.devicePixelRatio || 1, 2);
      this._cw = cw; this._ch = ch; this._canvas.width = Math.round(cw * dpr); this._canvas.height = Math.round(ch * dpr); this._k = this._canvas.width / cw;
      var n = Math.round(attrNum(this, "cells", 60) * Math.max(0.6, Math.min(2, cw * ch / (300 * 375)))); n = Math.min(160, n);
      this._pts = voronoiSeeds(this.getAttribute("seed") == null ? 3 : this.getAttribute("seed"), n, cw, ch);
      this._steps = 0;
      var anim = this.getAttribute("animate") !== "none" && !reducedMotion();
      if (!anim) { for (var i = 0; i < 40; i++) relax(this._pts, cw, ch, 0.6); this._paint(); } else { this._paint(); this._tick(); }
    }
    _paint() {
      if (!this._pts) return;
      var c = this._canvas.getContext("2d"); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this._canvas.width, this._canvas.height);
      c.setTransform(this._k, 0, 0, this._k, 0, 0); var ink = getComputedStyle(this).color; c.strokeStyle = ink; c.fillStyle = ink; c.lineWidth = 1; c.lineJoin = "round";
      var cells = voronoiCells(this._pts, this._cw, this._ch); c.beginPath();
      cells.forEach(function (p) { if (p.length < 3) return; c.moveTo(p[0][0], p[0][1]); for (var j = 1; j < p.length; j++) c.lineTo(p[j][0], p[j][1]); c.closePath(); });
      c.stroke();
      if (this.hasAttribute("dots")) this._pts.forEach(function (p) { c.beginPath(); c.arc(p[0], p[1], 1.6, 0, TAU); c.fill(); });
    }
    _tick() {
      if (this.paused || !this._vis || this._steps > 160) return; cancelAnimationFrame(this._raf);
      this._raf = requestAnimationFrame(() => { var m = relax(this._pts, this._cw, this._ch, 0.14); this._steps++; this._paint(); if (m > 0.04) this._tick(); });
    }
    toSVG(opts) { return voronoiSVG(Object.assign({ w: this._cw, h: this._ch, seed: this.getAttribute("seed") || 3, cells: attrNum(this, "cells", 60), stroke: getComputedStyle(this).color }, opts || {})); }
  } : null;

  /* -------------------------------------------------------------- <ep-mark> */
  var Mark = HAS_DOM ? class extends HTMLElement {
    static get observedAttributes() { return ["name", "size", "filled"]; }
    connectedCallback() { this._render(); }
    attributeChangedCallback() { if (this.isConnected) this._render(); }
    _render() {
      var name = this.getAttribute("name") || "";
      if (getComputedStyle(this).display === "inline") this.style.display = "inline-block";
      var size = this.getAttribute("size"); if (size) { this.style.width = /^\d+$/.test(size) ? size + "px" : size; this.style.height = this.style.width; }
      this.setAttribute("role", "img"); this.setAttribute("aria-label", "Marque de " + (name || "sans nom"));
      this.innerHTML = markSVG(name, { fill: this.hasAttribute("filled") ? "var(--plate)" : "none", label: "Marque de " + name });
      var s = this.firstChild; if (s && s.setAttribute) { s.setAttribute("aria-hidden", "true"); s.removeAttribute("role"); s.removeAttribute("aria-label"); s.style.cssText = "width:100%;height:100%;display:block"; }
    }
  } : null;

  /* -------------------------------------------------------- <ep-data-field> */
  var DataField = HAS_DOM ? class extends HTMLElement {
    static get observedAttributes() { return ["data", "labels", "seed", "table-label"]; }
    connectedCallback() { this._render(); }
    attributeChangedCallback() { if (this.isConnected) this._render(); }
    get data() { try { return JSON.parse(this.getAttribute("data") || "[]"); } catch (e) { return []; } }
    set data(v) { this.setAttribute("data", JSON.stringify(v)); }
    _render() {
      if (getComputedStyle(this).display === "inline") this.style.display = "block";
      var data = this.data, labels = []; try { labels = JSON.parse(this.getAttribute("labels") || "[]"); } catch (e) { /* noop */ }
      var svg = dataFieldSVG({ data: data, labels: labels, seed: this.getAttribute("seed") || 7, w: 600, h: 420 });
      var rows = data.map(function (v, i) { return "<tr><th scope=\"row\">" + esc(labels[i] != null ? labels[i] : i + 1) + "</th><td>" + esc(Number(v).toLocaleString("fr-FR")) + "</td></tr>"; }).join("");
      this.innerHTML = '<div class="ep-datafield__fig" style="color:var(--ink)">' + svg + '</div><details class="ep-datafield__table"><summary>' + esc(this.getAttribute("table-label") || "Voir les données") + '</summary><table class="ep-table"><tbody>' + rows + "</tbody></table></details>";
      var s = this.querySelector("svg"); if (s) { s.style.cssText = "width:100%;height:auto;display:block"; }
    }
  } : null;

  /* ------------------------------------------------------------ <ep-chart> */
  /* data = { labels:[...], series:[{ name, values:[...] }], unit?: "€" } ; type = bar | line | spark */
  var Chart = HAS_DOM ? class extends HTMLElement {
    static get observedAttributes() { return ["data", "type", "height", "unit", "title"]; }
    connectedCallback() {
      if (this._ready) { this._render(); return; }
      this._ready = true;
      if (getComputedStyle(this).display === "inline") this.style.display = "block";
      this._ro = new ResizeObserver(() => { clearTimeout(this._rt); this._rt = setTimeout(() => this._render(), 60); }); this._ro.observe(this);
      this._render();
    }
    disconnectedCallback() { if (this._ro) this._ro.disconnect(); this._ready = false; }
    attributeChangedCallback() { if (this._ready) this._render(); }
    get data() { if (this._d) return this._d; try { return JSON.parse(this.getAttribute("data") || "{}"); } catch (e) { return {}; } }
    set data(v) { this._d = v; if (this._ready) this._render(); }
    _render() {
      var d = this.data, labels = d.labels || [], series = d.series || [], type = this.getAttribute("type") || "bar", unit = this.getAttribute("unit") || d.unit || "";
      var W = Math.max(160, this.clientWidth || 480), spark = type === "spark", H = attrNum(this, "height", spark ? 40 : 280);
      var pad = spark ? { l: 2, r: 2, t: 4, b: 4 } : { l: 44, r: 12, t: 12, b: 28 };
      var n = labels.length || (series[0] && series[0].values.length) || 0;
      if (!n || !series.length) { this.innerHTML = ""; return; }
      var max = 0, min = 0; series.forEach(function (s) { s.values.forEach(function (v) { if (v > max) max = v; if (v < min) min = v; }); });
      function nice(m) { if (m <= 0) return 1; var e = Math.pow(10, Math.floor(Math.log10(m))), f = m / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e; }
      var top = nice(max), ticks = 4, iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
      var y = function (v) { return pad.t + ih - (v - min) / (top - min || 1) * ih; };
      var fmt = function (v) { return Number(v).toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + (unit ? " " + unit : ""); };
      var s = '<svg class="ep-chart__svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" aria-hidden="true">', i, k;
      if (!spark) {
        for (i = 0; i <= ticks; i++) {
          var tv = min + (top - min) * i / ticks, ty = y(tv);
          s += '<line x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + f1(ty) + '" y2="' + f1(ty) + '" stroke="var(--rule)" stroke-width="1"/>';
          s += '<text x="' + (pad.l - 8) + '" y="' + f1(ty + 4) + '" text-anchor="end" class="ep-chart__tick">' + esc(Number(tv).toLocaleString("fr-FR", { maximumFractionDigits: 1 })) + "</text>";
        }
        var every = Math.ceil(n / Math.max(1, Math.floor(iw / 56)));
        for (i = 0; i < n; i += every) {
          var lx = type === "bar" ? pad.l + iw * (i + 0.5) / n : pad.l + (n === 1 ? iw / 2 : iw * i / (n - 1));
          s += '<text x="' + f1(lx) + '" y="' + (H - 8) + '" text-anchor="middle" class="ep-chart__tick">' + esc(labels[i] != null ? labels[i] : i + 1) + "</text>";
        }
      }
      var cx = function (i) { return type === "bar" ? pad.l + iw * (i + 0.5) / n : pad.l + (n === 1 ? iw / 2 : iw * i / (n - 1)); };
      if (type === "bar") {
        var gw = iw / n, inner = Math.min(gw * 0.78, 56 * series.length), bw = Math.max(2, inner / series.length - 2);
        series.forEach(function (sr, si) {
          sr.values.forEach(function (v, j) {
            var x0 = pad.l + gw * j + (gw - inner) / 2 + si * (bw + 2), y0 = y(Math.max(v, 0)), y1 = y(Math.min(v, 0));
            s += '<rect x="' + f1(x0) + '" y="' + f1(y0) + '" width="' + f1(bw) + '" height="' + f1(Math.max(1, y1 - y0)) + '" fill="var(--series-' + (si + 1) + ')"/>';
          });
        });
      } else {
        series.forEach(function (sr, si) {
          var d = sr.values.map(function (v, j) { return (j ? "L" : "M") + f1(cx(j)) + " " + f1(y(v)); }).join("");
          s += '<path d="' + d + '" fill="none" stroke="var(--series-' + (si + 1) + ')" stroke-width="' + (spark ? 1.5 : 2) + '" stroke-linejoin="round" stroke-linecap="round"/>';
          if (!spark && series.length <= 4) { var lv = sr.values[sr.values.length - 1]; s += '<text x="' + f1(cx(sr.values.length - 1) - 4) + '" y="' + f1(y(lv) - 8) + '" text-anchor="end" class="ep-chart__direct">' + esc(sr.name) + "</text>"; }
        });
      }
      s += '<g class="ep-chart__hover"></g></svg>';
      var legend = "";
      if (!spark && series.length >= 2) legend = '<ul class="ep-legend">' + series.map(function (sr, si) { return '<li><span class="ep-legend__sw" style="background:var(--series-' + (si + 1) + ')"></span>' + esc(sr.name) + "</li>"; }).join("") + "</ul>";
      var table = "";
      if (!spark) {
        table = '<details class="ep-chart__table"><summary>Voir les données</summary><div class="ep-table-wrap"><table class="ep-table"><thead><tr><th scope="col"></th>' + series.map(function (sr) { return '<th scope="col" class="ep-num">' + esc(sr.name) + "</th>"; }).join("") + "</tr></thead><tbody>" +
          labels.map(function (lb, j) { return '<tr><th scope="row">' + esc(lb) + "</th>" + series.map(function (sr) { return '<td class="ep-num">' + esc(fmt(sr.values[j])) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div></details>";
      }
      var label = this.getAttribute("title") || d.title || "Graphique";
      this.innerHTML = (legend) + '<div class="ep-chart__plot" role="img" aria-label="' + esc(label) + ' : voir le tableau des données" style="position:relative">' + s + '<div class="ep-chart__tip" role="presentation" hidden></div></div>' + table;
      if (spark) return;
      var plot = this.querySelector(".ep-chart__plot"), tip = this.querySelector(".ep-chart__tip"), hov = this.querySelector(".ep-chart__hover");
      function show(j, clientX) {
        var xj = cx(j), rows = series.map(function (sr, si) { return '<div class="ep-tip__row"><span class="ep-legend__sw" style="background:var(--series-' + (si + 1) + ')"></span><span>' + esc(sr.name) + '</span><b>' + esc(fmt(sr.values[j])) + "</b></div>"; }).join("");
        tip.innerHTML = '<div class="ep-tip__head">' + esc(labels[j] != null ? labels[j] : j + 1) + "</div>" + rows; tip.hidden = false;
        var tw = tip.offsetWidth, left = Math.min(Math.max(4, xj - tw / 2), W - tw - 4); tip.style.left = left + "px"; tip.style.top = "8px";
        if (type === "line") {
          var dots = series.map(function (sr, si) { return '<circle cx="' + f1(xj) + '" cy="' + f1(y(sr.values[j])) + '" r="4" fill="var(--series-' + (si + 1) + ')" stroke="var(--plate)" stroke-width="2"/>'; }).join("");
          hov.innerHTML = '<line x1="' + f1(xj) + '" x2="' + f1(xj) + '" y1="' + pad.t + '" y2="' + (pad.t + ih) + '" stroke="var(--ink-2)" stroke-width="1" stroke-dasharray="2 3"/>' + dots;
        } else {
          var gw2 = iw / n; hov.innerHTML = '<rect x="' + f1(pad.l + gw2 * j) + '" y="' + pad.t + '" width="' + f1(gw2) + '" height="' + ih + '" fill="var(--ink)" opacity=".06"/>';
        }
      }
      function hide() { tip.hidden = true; hov.innerHTML = ""; }
      plot.addEventListener("pointermove", function (e) {
        var r = plot.getBoundingClientRect(), x = e.clientX - r.left, j = type === "bar" ? Math.floor((x - pad.l) / (iw / n)) : Math.round((x - pad.l) / (n === 1 ? 1 : iw / (n - 1)));
        if (j < 0 || j >= n) { hide(); return; } show(j, e.clientX);
      });
      plot.addEventListener("pointerleave", hide);
    }
  } : null;

  /* >>> flowx */
  /* ============================================================================
     Deux systèmes tirés du kit d'origine, repris dans les couleurs du thème :
     1. fond de page : des particules à traînée qui filent et contournent un disque immobile,
     2. titre : un champ de flux dont les lignes restent à l'intérieur des lettres.
     ========================================================================== */
  function cl(x, a, b) { return x < a ? a : x > b ? b : x; }
  /* bruit à 8 directions de gradient : des tourbillons plus serrés que noise2 */
  function noise8(seed) {
    var r = rng(seed), a = [], p = new Uint8Array(512), gx = [], gy = [], i, j, t;
    for (i = 0; i < 256; i++) a.push(i);
    for (i = 255; i > 0; i--) { j = (r() * (i + 1)) | 0; t = a[i]; a[i] = a[j]; a[j] = t; }
    for (i = 0; i < 512; i++) p[i] = a[i & 255];
    for (i = 0; i < 8; i++) { gx.push(Math.cos(i * Math.PI / 4)); gy.push(Math.sin(i * Math.PI / 4)); }
    function fade(u) { return u * u * u * (u * (u * 6 - 15) + 10); }
    return function (x, y) {
      var xi = Math.floor(x), yi = Math.floor(y), X = xi & 255, Y = yi & 255, xf = x - xi, yf = y - yi;
      var aa = p[p[X] + Y] & 7, ab = p[p[X] + Y + 1] & 7, ba = p[p[X + 1] + Y] & 7, bb = p[p[X + 1] + Y + 1] & 7;
      var u = fade(xf), v = fade(yf);
      var d1 = gx[aa] * xf + gy[aa] * yf, d2 = gx[ba] * (xf - 1) + gy[ba] * yf;
      var d3 = gx[ab] * xf + gy[ab] * (yf - 1), d4 = gx[bb] * (xf - 1) + gy[bb] * (yf - 1);
      var x1 = d1 + u * (d2 - d1), x2 = d3 + u * (d4 - d3);
      return (x1 + v * (x2 - x1)) * 1.4;
    };
  }

  /* ------------------------------------------------ fond de page : flux et disque */
  /* o : w, h, seed, particles, trail (64), speed (1.05), disc [x, y, r] en px (ou null), preroll (300). */
  /* Durée d'une tranche de préroulage d'ep-flow-bg : bien sous les 50 ms d'une tâche longue, même sur un téléphone lent. */
  var WARM_SLICE_MS = 8;
  function streamSim(o) {
    o = o || {};
    var W = o.w || 600, H = o.h || 750, seed = seedOf(o.seed == null ? 9 : o.seed), rand = rng(seed), n = noise8(seed + 14);
    var N = o.particles || Math.round(cl(1000 * (W * H) / (600 * 750), 300, 2400)), L = o.trail || 64, STEP = o.speed || 1.05;
    var d = o.disc || null, dcx = d ? d[0] : -1e6, dcy = d ? d[1] : -1e6, R0 = d ? d[2] : 0;
    var hd = 0, tt = 0, i, infl = Math.min(W, H) * 0.75;
    var hx = new Float32Array(N * L), hy = new Float32Array(N * L), px = new Float32Array(N), py = new Float32Array(N), life = new Float32Array(N);
    function spawn(s) {
      var x, y, a;
      do { x = rand() * W; y = rand() * H; } while (Math.hypot(x - dcx, y - dcy) < R0 * 1.1);
      px[s] = x; py[s] = y; life[s] = 140 + rand() * 260;
      for (a = 0; a < L; a++) { hx[s * L + a] = x; hy[s * L + a] = y; }
    }
    /* le champ : un bruit lent, qui devient tangent au disque quand on s'en approche */
    function ang(x, y, t) {
      var b = (n(x * 0.0029 + t * 0.012, y * 0.0029 + 3) + 0.5 * n(x * 0.008 + 9, y * 0.008 - t * 0.017)) * Math.PI * 1.9;
      if (!R0) return b;
      var dx = x - dcx, dy = y - dcy, dd = Math.sqrt(dx * dx + dy * dy);
      var w = Math.pow(cl((infl - dd) / (infl - R0 * 1.2), 0, 1), 1.5), tg = Math.atan2(dy, dx) + Math.PI / 2;
      return Math.atan2((1 - w) * Math.sin(b) + w * Math.sin(tg), (1 - w) * Math.cos(b) + w * Math.cos(tg));
    }
    function advance() {
      var s, a, x, y;
      hd = (hd + 1) % L; tt += 1 / 60;
      for (s = 0; s < N; s++) {
        a = ang(px[s], py[s], tt); x = px[s] + Math.cos(a) * STEP; y = py[s] + Math.sin(a) * STEP;
        if (--life[s] <= 0 || x < -4 || y < -4 || x > W + 4 || y > H + 4 || Math.hypot(x - dcx, y - dcy) < R0 * 1.03) { spawn(s); continue; }
        px[s] = x; py[s] = y; hx[s * L + hd] = x; hy[s * L + hd] = y;
      }
    }
    for (i = 0; i < N; i++) { spawn(i); life[i] *= rand(); if (life[i] < 20) life[i] += 20; }
    for (i = 0; i < (o.preroll == null ? 300 : o.preroll); i++) advance();
    /* traînées par bande d'âge : la tête est la plus claire, la queue s'efface */
    function alphaOf(b, NB) { return 0.34 * Math.pow(1 - b / NB, 1.4) + 0.02; }
    function widthOf(b, NB) { return 1.5 - 0.7 * b / NB; }
    function bandPoints(b, NB, s) {
      var SG = Math.floor(L / NB), pts = [], a, j0;
      for (a = b * SG; a <= (b + 1) * SG && a < L; a++) {
        j0 = s * L + ((hd - a + L * 2) % L);
        if (pts.length >= 2 && hx[j0] === pts[pts.length - 2] && hy[j0] === pts[pts.length - 1]) break;
        pts.push(hx[j0], hy[j0]);
      }
      return pts;
    }
    return {
      w: W, h: H, n: N, disc: d, advance: advance, alphaOf: alphaOf, widthOf: widthOf,
      /* réglages en direct, sans reconstruire : le champ réagit tout de suite (variation fluide de la vitesse et du disque) */
      setSpeed: function (v) { if (v > 0) STEP = v; },
      setDisc: function (a) { if (d && a) { d[0] = dcx = a[0]; d[1] = dcy = a[1]; d[2] = R0 = a[2]; } },
      /* Dessin d'une image. Les bandes d'âge font 4 points espacés d'un pixel : une courbe aussi lisse se trace sans perte avec
         3 points (début, milieu, fin de bande). lod 0 : tous les points ; 1 : début, milieu, fin ; 2 : début et fin. Par défaut 1 tant qu'une bande
         ne dépasse pas 5 px (4,2 px avec les réglages d'origine), sinon 0.
         Boucle sans allocation : pas de tableau par bande et par particule (36 000 par image avant).
         wcap : largeur maximale du trait, avec l'opacité relevée pour garder la même quantité d'encre (mode économe). */
      draw: function (ctx, NB, lod, wcap) {
        var b, s, SG, a0, a1, base, k0, k1, km, a, w, al;
        NB = NB || 16; SG = Math.floor(L / NB); lod = lod == null ? (SG * STEP <= 5 ? 1 : 0) : lod;
        for (b = 0; b < NB; b++) {
          w = widthOf(b, NB); al = alphaOf(b, NB);
          if (wcap && w > wcap) { al = Math.min(1, al * w / wcap); w = wcap; }
          ctx.globalAlpha = al; ctx.lineWidth = w; ctx.beginPath();
          a0 = b * SG; a1 = (b + 1) * SG; if (a1 > L - 1) a1 = L - 1;
          for (s = 0; s < N; s++) {
            base = s * L; k0 = base + ((hd - a0 + L * 2) % L); k1 = base + ((hd - a1 + L * 2) % L);
            if (hx[k0] === hx[k1] && hy[k0] === hy[k1]) continue;
            ctx.moveTo(hx[k0], hy[k0]);
            if (lod === 0) { for (a = a0 + 1; a < a1; a++) { km = base + ((hd - a + L * 2) % L); ctx.lineTo(hx[km], hy[km]); } }
            else if (lod === 1 && a1 - a0 > 1) { km = base + ((hd - ((a0 + a1) >> 1) + L * 2) % L); ctx.lineTo(hx[km], hy[km]); }
            ctx.lineTo(hx[k1], hy[k1]);
          }
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      },
      bands: function (NB) {
        var out = [], b, s, pts, d2;
        NB = NB || 8;
        for (b = 0; b < NB; b++) {
          d2 = "";
          for (s = 0; s < N; s++) {
            pts = bandPoints(b, NB, s); if (pts.length < 4) continue;
            d2 += "M" + f1(pts[0]) + " " + f1(pts[1]) + "L";
            for (var q = 2; q < pts.length; q += 2) d2 += f1(pts[q]) + " " + f1(pts[q + 1]) + (q < pts.length - 2 ? " " : "");
          }
          out.push({ alpha: alphaOf(b, NB), width: widthOf(b, NB), d: d2 });
        }
        return out;
      }
    };
  }
  function mixRgb(c, t, k) { return [Math.round(c[0] + (t[0] - c[0]) * k), Math.round(c[1] + (t[1] - c[1]) * k), Math.round(c[2] + (t[2] - c[2]) * k)]; }
  function rgbStr(c) { return "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")"; }
  /* les trois tons du disque, tirés d'une couleur de base : éclat, corps, bord */
  function discTones(base) { return [rgbStr(mixRgb(base, [255, 255, 255], 0.75)), rgbStr(mixRgb(base, [0, 0, 0], 0.03)), rgbStr(mixRgb(base, [0, 0, 0], 0.26))]; }
  /* o : w, h, seed, particles, disc [x, y, r], ground (couleur ou absente), line, base (couleur du disque, [r,g,b]) */
  function streamSVG(o) {
    o = o || {};
    var sim = o.sim || streamSim(o), W = sim.w, H = sim.h, d = sim.disc, line = o.line || "#f0f0ec", s = "", b, t, bands = sim.bands(o.bands || 8), id = "epd" + (hashStr(String(o.seed) + W + H) % 9999);
    s += '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(o.label || "Fond génératif : des lignes de flux qui contournent un disque") + '">';
    if (o.ground) s += '<rect width="' + W + '" height="' + H + '" fill="' + o.ground + '"/>';
    s += '<g fill="none" stroke="' + line + '" stroke-linecap="round" stroke-linejoin="round">';
    for (b = 0; b < bands.length; b++) s += '<path d="' + bands[b].d + '" stroke-opacity="' + bands[b].alpha.toFixed(3) + '" stroke-width="' + bands[b].width.toFixed(2) + '"/>';
    s += "</g>";
    if (d) {
      t = discTones(o.base || [240, 240, 236]);
      s += '<defs><radialGradient id="' + id + '" gradientUnits="userSpaceOnUse" cx="' + f1(d[0]) + '" cy="' + f1(d[1]) + '" r="' + f1(d[2]) + '" fx="' + f1(d[0] - 0.35 * d[2]) + '" fy="' + f1(d[1] - 0.42 * d[2]) + '" fr="' + f1(0.06 * d[2]) + '"><stop offset="0" stop-color="' + t[0] + '"/><stop offset=".55" stop-color="' + t[1] + '"/><stop offset="1" stop-color="' + t[2] + '"/></radialGradient></defs>';
      s += '<circle cx="' + f1(d[0]) + '" cy="' + f1(d[1]) + '" r="' + f1(d[2]) + '" fill="url(#' + id + ')"/>';
    }
    return s + "</svg>";
  }

  /* ----------------------------------------------------------- utilités couleur (DOM) */
  var rgbCanvas = null;
  function rgbOf(str) {
    if (!rgbCanvas) { rgbCanvas = document.createElement("canvas"); rgbCanvas.width = rgbCanvas.height = 1; }
    var c = rgbCanvas.getContext("2d", { willReadFrequently: true });
    c.clearRect(0, 0, 1, 1); c.fillStyle = "#000"; c.fillStyle = str; c.fillRect(0, 0, 1, 1);
    var d = c.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]];
  }
  /* Noir est le thème par défaut : sans data-theme, on est en sombre. */
  function isDark() { if (!HAS_DOM) return false; var th = document.documentElement.getAttribute("data-theme"); return th ? /^(dark|noir)$/.test(th) : true; }
  function tokenOf(el, name) { return getComputedStyle(el).getPropertyValue(name).trim(); }

  /* --------------------------------------------------------------- <ep-flow-bg> */
  /* Attributs : seed, particles, speed, trail, disc ("x,y,r" en fractions de la largeur, de la hauteur et du petit côté, ou "none"),
     tone (poster | paper), animate (live | none), paused, fill, label.
     Couleurs : variables --ep-bg-ground, --ep-bg-line, --ep-bg-disc pour forcer, sinon tirées du thème. */
  var FlowBackground = HAS_DOM ? class extends HTMLElement {
    static get observedAttributes() { return ["seed", "particles", "speed", "trail", "disc", "tone", "animate", "paused", "label", "quality"]; }
    connectedCallback() {
      if (this._ready) { this._build(); return; }
      this._ready = true;
      if (getComputedStyle(this).display === "inline") this.style.display = "block";
      if (getComputedStyle(this).position === "static") this.style.position = "relative";
      this._canvas = document.createElement("canvas"); this._canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
      this.appendChild(this._canvas); this._aria();
      /* la première notification (à l'observation) et celles sans changement de taille ne relancent ni la construction ni le préroulage */
      this._rw = this.clientWidth; this._rh = this.clientHeight;
      this._ro = new ResizeObserver(() => {
        if (this.clientWidth === this._rw && this.clientHeight === this._rh) return;
        this._rw = this.clientWidth; this._rh = this.clientHeight;
        clearTimeout(this._rt); this._rt = setTimeout(() => this._build(), 80);
      }); this._ro.observe(this);
      this._io = new IntersectionObserver((es) => { this._vis = es[0].isIntersecting; if (this._vis) this._tick(); }); this._io.observe(this); this._vis = true;
      this._tf = () => this._paint(); watchTheme(this._tf);
      this._build();
    }
    disconnectedCallback() {
      if (this._ro) this._ro.disconnect(); if (this._io) this._io.disconnect();
      cancelAnimationFrame(this._raf); clearTimeout(this._wt); var i = themeWatchers.indexOf(this._tf); if (i >= 0) themeWatchers.splice(i, 1); this._ready = false;
    }
    attributeChangedCallback(name) {
      if (!this._ready) return;
      if (name === "label") { this._aria(); return; }
      if (name === "speed" && this._live && this._sim && this._sim.setSpeed) { this._sim.setSpeed(attrNum(this, "speed", 1.05)); return; }
      if (name === "disc" && this._live && this._sim && this._sim.disc && this.getAttribute("disc") !== "none") { var dd = this._disc(this._W, this._H); if (dd) { this._sim.setDisc(dd); return; } }
      if (name === "quality") { this._q = 0; this._ema = 0; this._n = 0; this._dem = 0; this._lock = 0; this._hold = 0; this._chk = null; return; }
      if (name === "paused") { if (!this.paused) this._tick(); return; }
      clearTimeout(this._at); this._at = setTimeout(() => this._build(), 30);
    }
    get paused() { return this.hasAttribute("paused"); }
    set paused(v) { if (v) this.setAttribute("paused", ""); else this.removeAttribute("paused"); }
    toggle() { this.paused = !this.paused; return this.paused; }
    reseed(n) { this.setAttribute("seed", String(n == null ? (Math.random() * 99999) | 0 : n)); }
    _aria() {
      var l = this.getAttribute("label");
      if (l) { this.setAttribute("role", "img"); this.setAttribute("aria-label", l); this.removeAttribute("aria-hidden"); }
      else { this.removeAttribute("role"); this.removeAttribute("aria-label"); this.setAttribute("aria-hidden", "true"); }
    }
    _disc(W, H) {
      var v = this.getAttribute("disc"); if (v === "none") return null;
      var a = String(v || "0.78,0.2,0.1").split(/[ ,]+/).map(parseFloat); if (a.length !== 3 || !a.every(isFinite)) a = [0.78, 0.2, 0.1];
      return [a[0] * W, a[1] * H, a[2] * Math.min(W, H)];
    }
    _build() {
      if (!this._ready) return;
      cancelAnimationFrame(this._raf);
      var cw = this.clientWidth || 300, ch = this.clientHeight || cw * 1.25, W = Math.min(cw, 1600), H = W * ch / cw, dpr = Math.min(window.devicePixelRatio || 1, 2);
      this._canvas.width = Math.max(1, Math.round(cw * dpr)); this._canvas.height = Math.max(1, Math.round(ch * dpr)); this._k = this._canvas.width / W; this._W = W; this._H = H;
      var live = this.getAttribute("animate") !== "none" && !reducedMotion();
      /* préroulage (300 pas animé, 420 figé) découpé en tranches de WARM_SLICE_MS : plus de tâche longue au montage */
      this._sim = streamSim({ w: W, h: H, seed: this.getAttribute("seed") == null ? 9 : this.getAttribute("seed"), particles: attrNum(this, "particles", 0) || undefined, speed: attrNum(this, "speed", 1.05), trail: attrNum(this, "trail", 64), disc: this._disc(W, H), preroll: 0 });
      this._live = live; this._acc = 0; this._last = 0; this._warm = live ? 300 : 420;
      this._warmUp();
    }
    /* Prérôle la simulation par tranches courtes, une tâche par tranche : la page reste réactive pendant ce temps.
       Première image après la première tranche, image finale à la fin ; même résultat qu'un préroulage d'un bloc
       (même suite de pas pour un même seed). Un nouveau _build ou le retrait de l'élément annule les tranches restantes. */
    _warmUp() {
      var sim = this._sim, first = true;
      clearTimeout(this._wt);
      var slice = () => {
        if (!this._ready || sim !== this._sim) return;
        var t0 = performance.now();
        while (this._warm > 0 && performance.now() - t0 < WARM_SLICE_MS) { sim.advance(); this._warm--; }
        if (this._warm > 0) { if (first) this._paint(); first = false; this._wt = setTimeout(slice, 0); return; }
        this._paint();
        this.dispatchEvent(new CustomEvent("ep-ready", { detail: { particles: sim.n } }));
        if (this._live) this._tick();
      };
      slice();
    }
    /* Termine le préroulage d'un coup (export SVG demandé avant la fin des tranches). */
    _warmNow() { clearTimeout(this._wt); while (this._warm > 0) { this._sim.advance(); this._warm--; } }
    _colors() {
      var poster = this.getAttribute("tone") !== "paper", dark = isDark(), g = (n) => tokenOf(this, n), pick = (v, f) => g(v) || g(f);
      if (poster) return { ground: rgbOf(g("--ep-bg-ground") || (dark ? g("--paper-deep") : g("--ink"))), line: rgbOf(g("--ep-bg-line") || (dark ? g("--ink") : g("--paper"))), base: rgbOf(g("--ep-bg-disc") || (dark ? g("--ink") : g("--plate"))), poster: true };
      return { ground: null, line: rgbOf(g("--ep-bg-line") || getComputedStyle(this).color), base: rgbOf(g("--ep-bg-disc") || g("--plate-hover") || g("--plate")), poster: false };
    }
    _paint() {
      if (!this._sim) return;
      var c = this._canvas.getContext("2d"), k = this._k, W = this._W, H = this._H, col = this._colors(), sim = this._sim, d = sim.disc, g, t;
      c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this._canvas.width, this._canvas.height); c.setTransform(k, 0, 0, k, 0, 0);
      if (col.ground) { c.fillStyle = rgbStr(col.ground); c.fillRect(0, 0, W, H); }
      /* qualité 0 : trait rond, largeurs d'origine. 1 : bout plat (même rendu à 1 px près, un tiers moins cher). 2 : largeur plafonnée à 1 px, opacité relevée. */
      var q = this._live ? (this._q || 0) : 0;
      c.lineCap = q >= 1 ? "butt" : "round"; c.lineJoin = q >= 1 ? "miter" : "round"; c.strokeStyle = rgbStr(col.line);
      sim.draw(c, 16, this.getAttribute("quality") === "high" ? 0 : null, q >= 2 ? 1 : 0);
      c.lineCap = "round"; c.lineJoin = "round";
      if (d) {
        t = discTones(col.base);
        g = c.createRadialGradient(d[0] - 0.35 * d[2], d[1] - 0.42 * d[2], d[2] * 0.06, d[0], d[1], d[2]);
        g.addColorStop(0, t[0]); g.addColorStop(0.55, t[1]); g.addColorStop(1, t[2]);
        c.fillStyle = g; c.beginPath(); c.arc(d[0], d[1], d[2], 0, TAU); c.fill();
        if (!col.poster) { c.strokeStyle = rgbStr(col.line); c.globalAlpha = 0.5; c.lineWidth = 1; c.stroke(); c.globalAlpha = 1; }
      }
    }
    /* Régulateur de qualité : le tracé de 2 000 traînées est cher quand le canvas n'est pas accéléré (rendu logiciel). Si la cadence
       tombe sous 37 images par seconde, on passe au niveau suivant ; on remonte à l'essai après un délai qui double à chaque échec.
       quality="high" ne dégrade jamais, "low" démarre au niveau 2, "auto" (défaut) régule. Sur une machine capable : niveau 0, rien ne change. */
    _govern(ms) {
      if (!(ms > 0)) return;
      ms = Math.min(ms, 100);
      var mode = this.getAttribute("quality") || "auto", q = this._q || 0, t = performance.now(), chk;
      if (mode === "high") { this._q = 0; return; }
      if (mode === "low") { this._q = 2; return; }
      this._ema = this._ema ? this._ema * 0.92 + ms * 0.08 : ms; this._n = (this._n || 0) + 1;
      if (this._n < 40) return;
      /* un cran vient d'être descendu : s'il n'a pas gagné au moins 15 %, la limite vient d'ailleurs (écran à 30 Hz, économie d'énergie) : on le reprend */
      if (this._chk) {
        chk = this._chk; this._chk = null;
        if (this._ema > chk.pre * 0.85) { this._q = chk.from; this._hold = t + 120000; this._n = 0; this._ema = 0; return; }
      }
      if (this._ema > 27 && q < 2 && t > (this._hold || 0)) {
        this._chk = { from: q, pre: this._ema }; this._q = q + 1; this._n = 0; this._ema = 0;
        this._lock = t + Math.min(300000, 15000 * Math.pow(2, this._dem || 0)); this._dem = (this._dem || 0) + 1;
      } else if (this._ema < 18.5 && q > 0 && t > (this._lock || 0) && this._n > 240) { this._q = q - 1; this._n = 0; this._ema = 0; }
    }
    _tick() {
      if (!this._live || this.paused || !this._vis || this._warm > 0) { this._last = 0; return; }
      cancelAnimationFrame(this._raf);
      this._raf = requestAnimationFrame((now) => {
        this._govern(this._last ? now - this._last : 0);
        var dt = this._last ? Math.min(0.1, (now - this._last) / 1000) : 1 / 60; this._last = now; this._acc += dt * 60;
        var steps = Math.min(4, Math.floor(this._acc)); this._acc -= steps;
        while (steps-- > 0) this._sim.advance();
        this._paint(); this._tick();
      });
    }
    toSVG(opts) {
      if (this._warm > 0) this._warmNow();
      var col = this._colors();
      return streamSVG(Object.assign({ sim: this._sim, ground: col.ground ? rgbStr(col.ground) : null, line: rgbStr(col.line), base: col.base, seed: this.getAttribute("seed") }, opts || {}));
    }
  } : null;

  /* -------------------------------------------------------------- <ep-flow-type> */
  /* Un mot rempli de lignes : le champ de flux ne s'écrit qu'à l'intérieur des lettres.
     Attributs : text (sinon le contenu ; "|" ou <br> coupent les lignes), seed, font, weight, embolden (em),
     size, max-size (220), line-height (.95), spacing, animate (drift | none), outline (.5), wrap (wrap | none), paused.
     La police par défaut est --font-display. Le texte reste dans le DOM pour les lecteurs d'écran. */
  var FlowType = HAS_DOM ? class extends HTMLElement {
    static get observedAttributes() { return ["text", "seed", "font", "weight", "embolden", "size", "max-size", "line-height", "spacing", "density", "animate", "outline", "wrap", "paused", "fps"]; }
    connectedCallback() {
      if (this._ready) { this._build(); return; }
      /* le texte du contenu n'est pas encore analysé tant que la page se charge */
      if (this.getAttribute("text") == null && document.readyState === "loading") { document.addEventListener("DOMContentLoaded", () => { if (this.isConnected) this.connectedCallback(); }, { once: true }); return; }
      this._ready = true;
      if (getComputedStyle(this).display === "inline") this.style.display = "block";
      if (getComputedStyle(this).position === "static") this.style.position = "relative";
      var t = this.getAttribute("text");
      if (t == null) { var cp = this.cloneNode(true); cp.querySelectorAll("br").forEach(function (b) { b.replaceWith("|"); }); t = cp.textContent; }
      this._lines = String(t).split("|").map(function (x) { return x.replace(/\s+/g, " ").trim(); }).filter(Boolean);
      this.textContent = "";
      this._sr = document.createElement("span"); this._sr.textContent = this._lines.join(" ");
      this._sr.style.cssText = "position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0";
      this._canvas = document.createElement("canvas"); this._canvas.setAttribute("aria-hidden", "true"); this._canvas.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;display:block";
      this.appendChild(this._sr); this.appendChild(this._canvas);
      /* la mise en page ne dépend que de la largeur, et l'élément fixe lui-même sa hauteur : seul un changement de largeur
         la relance (avant, la hauteur posée par _layout la relançait aussitôt, une seconde mise en page complète) */
      this._rw = this.clientWidth;
      this._ro = new ResizeObserver(() => {
        if (this.clientWidth === this._rw) return;
        this._rw = this.clientWidth;
        clearTimeout(this._rt); this._rt = setTimeout(() => this._build(), 80);
      }); this._ro.observe(this);
      this._io = new IntersectionObserver((es) => { this._vis = es[0].isIntersecting; if (this._vis) this._tick(); }); this._io.observe(this); this._vis = true;
      this._tf = () => { var dk = isDark(); if (this._dk !== dk && !this.hasAttribute("density") && !this.hasAttribute("spacing")) this._build(); else this._paint(); }; watchTheme(this._tf);
      this._build();
    }
    disconnectedCallback() {
      if (this._ro) this._ro.disconnect(); if (this._io) this._io.disconnect();
      cancelAnimationFrame(this._raf); var i = themeWatchers.indexOf(this._tf); if (i >= 0) themeWatchers.splice(i, 1); this._ready = false;
    }
    attributeChangedCallback(name) {
      if (!this._ready) return;
      if (name === "text") { this._lines = String(this.getAttribute("text")).split("|").map(function (x) { return x.trim(); }).filter(Boolean); this._sr.textContent = this._lines.join(" "); }
      if (name === "paused") { if (!this.paused) this._tick(); return; }
      if (name === "fps") return;
      clearTimeout(this._at); this._at = setTimeout(() => this._build(), 30);
    }
    get paused() { return this.hasAttribute("paused"); }
    set paused(v) { if (v) this.setAttribute("paused", ""); else this.removeAttribute("paused"); }
    _family() { var f = this.getAttribute("font"); if (f) return f; return tokenOf(this, "--font-display") || getComputedStyle(this).fontFamily; }
    _build() {
      if (!this._ready) return;
      var id = this._bid = (this._bid || 0) + 1, fam = this._family(), wt = this.getAttribute("weight") || "400", self = this;
      var go = function () { if (id === self._bid) self._layout(fam, wt); };
      if (document.fonts && document.fonts.load) { document.fonts.load(wt + " 64px " + fam, this._lines.join(" ")).then(go, go); } else go();
    }
    _layout(fam, wt) {
      cancelAnimationFrame(this._raf);
      var cw = this.clientWidth || 600, pad = 4, lh = attrNum(this, "line-height", 0.95), maxS = attrNum(this, "max-size", 220), size = attrNum(this, "size", 0) || maxS;
      var m = document.createElement("canvas").getContext("2d"), lines = [], i, w; var wrapOn = this.getAttribute("wrap") !== "none";
      var emb = this.hasAttribute("embolden") ? attrNum(this, "embolden", 0) : (parseInt(wt, 10) >= 600 ? 0 : 0.04);
      /* retour à la ligne glouton, puis réduction si un mot dépasse */
      for (var pass = 0; pass < 4; pass++) {
        m.font = wt + " " + size + "px " + fam; lines = [];
        this._lines.forEach(function (ln) {
          var words = ln.split(" "), cur = "";
          words.forEach(function (wd) { var t = cur ? cur + " " + wd : wd; if (cur && wrapOn && m.measureText(t).width > cw - 2 * pad - emb * size) { lines.push(cur); cur = wd; } else cur = t; });
          if (cur) lines.push(cur);
        });
        w = 0; for (i = 0; i < lines.length; i++) w = Math.max(w, m.measureText(lines[i]).width);
        if (w + emb * size <= cw - 2 * pad) break;
        size *= (cw - 2 * pad) / (w + emb * size) * 0.99;
      }
      /* hauteur de la première ligne : un « H » ne suffit pas, une capitale accentuée (É, Â, Ç) monte plus haut et serait rognée */
      m.font = wt + " " + size + "px " + fam;
      var cap = Math.max(m.measureText("H").actualBoundingBoxAscent || size * 0.7, lines.length ? m.measureText(lines[0]).actualBoundingBoxAscent || 0 : 0), step = size * lh, top = pad + emb * size / 2 + cap;
      var H = Math.ceil(top + (lines.length - 1) * step + size * 0.28 + emb * size / 2 + pad);
      this.style.height = H + "px";
      var dpr = Math.min(window.devicePixelRatio || 1, 2), W = cw, k = dpr;
      this._o = { W: W, H: H, k: k, lines: lines, font: wt + " " + size.toFixed(1) + "px " + fam, size: size, emb: emb * size, top: top, step: step, fam: fam, wt: wt };
      this._canvas.width = Math.round(W * k); this._canvas.height = Math.round(H * k);
      var o = this._o, draw = function (g, mode) {
        g.font = o.font; g.textAlign = "center"; g.textBaseline = "alphabetic"; g.lineJoin = "round"; g.miterLimit = 2;
        for (var j = 0; j < o.lines.length; j++) { var y = o.top + j * o.step; if (mode === "stroke") g.strokeText(o.lines[j], W / 2, y); else { g.fillText(o.lines[j], W / 2, y); if (o.emb > 0) { g.lineWidth = o.emb; g.strokeText(o.lines[j], W / 2, y); } } }
      };
      /* masque en haute résolution et carte alpha 1x pour choisir les graines */
      var mask = document.createElement("canvas"); mask.width = this._canvas.width; mask.height = this._canvas.height;
      var mg = mask.getContext("2d"); mg.setTransform(k, 0, 0, k, 0, 0); mg.fillStyle = "#000"; mg.strokeStyle = "#000"; draw(mg, "fill");
      var lo = document.createElement("canvas"); lo.width = Math.ceil(W); lo.height = H;
      var lg = lo.getContext("2d", { willReadFrequently: true }); lg.fillStyle = "#000"; lg.strokeStyle = "#000"; draw(lg, "fill");
      var al = lg.getImageData(0, 0, lo.width, lo.height).data, LW2 = lo.width, LH2 = lo.height;
      /* Densité des graines. Par défaut : l'écart des graines suit la taille (4 %), mais le trait ne descend pas sous 1,1 px, donc un petit titre était 2 fois plus chargé en encre que la planche 28 du kit : on espace d'autant. Densité 1 sur papier clair, 0,5 sur fond sombre (traits pâles clairsemés : un corps sombre où le champ se lit en brins clairs, l'inverse de la planche sur papier). `density` force la valeur. */
      this._dk = isDark(); var dens = this.hasAttribute("density") ? Math.max(0.1, attrNum(this, "density", 1)) : (isDark() ? 0.5 : 1);
      var S = attrNum(this, "spacing", 0) || Math.max(4, size * 0.04) * Math.sqrt(Math.max(1, 1.1 / (size * 0.006))) / Math.sqrt(dens), r = rng(seedOf(this.getAttribute("seed") == null ? 31 : this.getAttribute("seed"))), seeds = [], gx, gy, dx, dy, hit, sx, sy, px, py;
      for (gy = 0; gy < LH2; gy += S) for (gx = 0; gx < LW2; gx += S) {
        sx = gx + r() * S; sy = gy + r() * S; hit = false;
        for (dy = -S; dy <= S && !hit; dy += S) for (dx = -S; dx <= S; dx += S) {
          px = Math.round(sx + dx); py = Math.round(sy + dy);
          if (px >= 0 && py >= 0 && px < LW2 && py < LH2 && al[(py * LW2 + px) * 4 + 3] > 128) { hit = true; break; }
        }
        if (hit) seeds.push(sx, sy);
      }
      /* anneau de contour : la forme élargie moins la forme, tracée une fois */
      var ring = document.createElement("canvas"); ring.width = this._canvas.width; ring.height = this._canvas.height;
      var rg = ring.getContext("2d"); rg.setTransform(k, 0, 0, k, 0, 0); rg.fillStyle = "#000"; rg.strokeStyle = "#000"; rg.lineWidth = o.emb + 1.4; draw(rg, "stroke"); rg.lineWidth = o.emb + 1.4; rg.globalCompositeOperation = "source-over";
      rg.setTransform(1, 0, 0, 1, 0, 0); rg.globalCompositeOperation = "destination-out"; rg.drawImage(mask, 0, 0);
      var lay = document.createElement("canvas"); lay.width = this._canvas.width; lay.height = this._canvas.height;
      this._mask = mask; this._ring = ring; this._lay = lay; this._seeds = seeds;
      this._ns = 14; this._step = Math.max(1.8, size * 0.0125) * 20 / this._ns; this._F = 1.7 / size * 1.0; this._n1 = noise8(4711); this._n2 = noise8(917);
      this._T = 9; this._live = this.getAttribute("animate") !== "none" && !reducedMotion(); this._last = 0;
      this._paint();
      this.dispatchEvent(new CustomEvent("ep-ready", { detail: { seeds: seeds.length / 2 } }));
      if (this._live) this._tick();
    }
    _lines2(T, cb) {
      var ph = (T % 90) / 90 * TAU, ox = Math.cos(ph) * 1.7, oy = Math.sin(ph) * 1.7, F = this._F, h = this._step, s, d, st, x, y, a, sd = this._seeds, n1 = this._n1, n2 = this._n2;
      for (s = 0; s < sd.length; s += 2) {
        for (d = -1; d <= 1; d += 2) {
          x = sd[s]; y = sd[s + 1]; cb(0, x, y);
          for (st = 0; st < this._ns; st++) {
            a = (n1(x * F + ox, y * F + oy) + 0.22 * n2(x * F * 2.7 + oy, y * F * 2.7 - ox)) * Math.PI * 2.1;
            x += Math.cos(a) * h * d; y += Math.sin(a) * h * d; cb(1, x, y);
          }
        }
      }
    }
    /* Même tracé que _lines2, sans fonction de rappel par point (80 000 appels par image avant) : l'export SVG garde _lines2. */
    _strokeLines(lc, T) {
      var ph = (T % 90) / 90 * TAU, ox = Math.cos(ph) * 1.7, oy = Math.sin(ph) * 1.7, F = this._F, F2 = F * 2.7, h = this._step, s, d, st, x, y, a, sd = this._seeds, n1 = this._n1, n2 = this._n2, ns = this._ns;
      for (s = 0; s < sd.length; s += 2) {
        for (d = -1; d <= 1; d += 2) {
          x = sd[s]; y = sd[s + 1]; lc.moveTo(x, y);
          for (st = 0; st < ns; st++) {
            a = (n1(x * F + ox, y * F + oy) + 0.22 * n2(x * F2 + oy, y * F2 - ox)) * 6.5973445725385655;
            x += Math.cos(a) * h * d; y += Math.sin(a) * h * d; lc.lineTo(x, y);
          }
        }
      }
    }
    _paint() {
      if (!this._o) return;
      var o = this._o, c = this._canvas.getContext("2d"), lc = this._lay.getContext("2d"), k = o.k, ink = getComputedStyle(this).color || "#17181b", al = attrNum(this, "outline", 0.5);
      lc.setTransform(1, 0, 0, 1, 0, 0); lc.globalCompositeOperation = "source-over"; lc.clearRect(0, 0, this._lay.width, this._lay.height);
      lc.setTransform(k, 0, 0, k, 0, 0); lc.strokeStyle = ink; lc.lineWidth = Math.max(1.1, o.size * 0.006); lc.lineCap = "round"; lc.lineJoin = "round"; lc.beginPath();
      this._strokeLines(lc, this._T);
      lc.stroke();
      lc.setTransform(1, 0, 0, 1, 0, 0); lc.globalCompositeOperation = "destination-in"; lc.drawImage(this._mask, 0, 0);
      c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this._canvas.width, this._canvas.height); c.drawImage(this._lay, 0, 0);
      if (al > 0) {
        if (!this._tint || this._tintInk !== ink || this._tintFor !== this._ring) {
          var rc = this._tint || (this._tint = document.createElement("canvas")); rc.width = this._ring.width; rc.height = this._ring.height;
          var tg = rc.getContext("2d"); tg.globalCompositeOperation = "source-over"; tg.clearRect(0, 0, rc.width, rc.height); tg.drawImage(this._ring, 0, 0);
          tg.globalCompositeOperation = "source-in"; tg.fillStyle = ink; tg.fillRect(0, 0, rc.width, rc.height); this._tintInk = ink; this._tintFor = this._ring;
        }
        c.globalAlpha = al; c.drawImage(this._tint, 0, 0); c.globalAlpha = 1;
      }
    }
    _tick() {
      if (!this._live || this.paused || !this._vis) { this._rp = 0; return; }
      cancelAnimationFrame(this._raf);
      this._raf = requestAnimationFrame((now) => {
        if (!this._last) this._last = now;
        /* la cadence s'adapte au coût réel d'un tracé : jamais plus de ~15 % du temps du processeur */
        /* fps="30" : cadence demandée, le tracé n'est plus bridé à ~15 % du processeur (cadence du kit : une image par rafraîchissement) */
        var want = attrNum(this, "fps", 0), gap = want > 0 ? Math.max(1000 / want, 1.15 * (this._cost || 0)) : Math.max(110, 6 * (this._cost || 0));
        /* le coût du tracé n'est pas tout dans cette fonction (la rastérisation suit) : si la page entière tombe sous 30 images par seconde, on espace les tracés */
        var fdt = this._rp ? Math.min(250, now - this._rp) : 0; this._rp = now; if (fdt) this._fdt = this._fdt ? this._fdt * 0.9 + fdt * 0.1 : fdt;
        if (this._fdt > 33) gap = Math.max(gap, 2.2 * this._fdt);
        if (now - this._last >= gap) {
          this._T += (now - this._last) / 1000; this._last = now;
          var t0 = performance.now(); this._paint(); this._cost = this._cost ? this._cost * 0.6 + (performance.now() - t0) * 0.4 : performance.now() - t0;
        }
        this._tick();
      });
    }
    toSVG(opts) {
      var o = this._o; if (!o) return "";
      opts = opts || {};
      var ink = getComputedStyle(this).color || "#17181b", al = attrNum(this, "outline", 0.5), d = "", a = [], W = o.W, H = o.H, i, txt = "", ff = o.fam.replace(/"/g, "'");
      this._lines2(this._T, function (t, x, y) { if (t) d += f1(x) + " " + f1(y) + " "; else d += "M" + f1(x) + " " + f1(y) + "L"; });
      d = d.replace(/L(?=M)/g, "");
      for (i = 0; i < o.lines.length; i++) txt += '<text x="' + f1(W / 2) + '" y="' + f1(o.top + i * o.step) + '">' + esc(o.lines[i]) + "</text>";
      var tattr = ' text-anchor="middle" font-family="' + esc(ff) + '" font-size="' + o.size.toFixed(1) + '" font-weight="' + o.wt + '" stroke-linejoin="round"';
      var shape = function (stroke, fill) { return '<g' + tattr + ' fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + (o.emb || 0) + '">' + txt + "</g>"; };
      var ring = '<g' + tattr + ' fill="#fff" stroke="#fff" stroke-width="' + (o.emb + 1.4).toFixed(2) + '">' + txt + "</g><g" + tattr + ' fill="#000" stroke="#000" stroke-width="' + (o.emb || 0) + '">' + txt + "</g>";
      var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(this._lines.join(" ")) + '"><defs><mask id="epm" maskUnits="userSpaceOnUse" x="0" y="0" width="' + W + '" height="' + H + '"><rect width="' + W + '" height="' + H + '" fill="#000"/>' + shape("#fff", "#fff") + '</mask><mask id="epr" maskUnits="userSpaceOnUse" x="0" y="0" width="' + W + '" height="' + H + '"><rect width="' + W + '" height="' + H + '" fill="#000"/>' + ring + "</mask></defs>";
      s += '<g mask="url(#epm)"><path d="' + d.trim() + '" fill="none" stroke="' + ink + '" stroke-width="' + Math.max(1.1, o.size * 0.006).toFixed(2) + '" stroke-linecap="round" stroke-linejoin="round"/></g>';
      if (al > 0) s += '<rect width="' + W + '" height="' + H + '" fill="' + ink + '" fill-opacity="' + al + '" mask="url(#epr)"/>';
      return s + "</svg>";
    }
  } : null;
  /* <<< flowx */

  /* ------------------------------------------------- comportements délégués */
  var toastHost = null;
  function toast(o) {
    if (!HAS_DOM) return null; o = o || {};
    if (!toastHost || !document.body.contains(toastHost)) {
      toastHost = document.createElement("div"); toastHost.className = "ep-toasts"; toastHost.setAttribute("role", "region"); toastHost.setAttribute("aria-label", "Notifications"); document.body.appendChild(toastHost);
    }
    var tone = o.tone || "info", el = document.createElement("div");
    el.className = "ep-toast ep-toast--" + tone; el.setAttribute("role", tone === "danger" ? "alert" : "status");
    var label = { success: "Succès", warning: "Attention", danger: "Erreur", info: "Info" }[tone] || "Info";
    el.innerHTML = '<span class="ep-toast__icon" aria-hidden="true"></span><div class="ep-toast__body"><p class="ep-toast__title"><span class="ep-sr">' + label + " : </span>" + esc(o.title || label) + "</p>" + (o.message ? "<p class=\"ep-toast__msg\">" + esc(o.message) + "</p>" : "") + '</div><button type="button" class="ep-toast__close" aria-label="Fermer la notification">Fermer</button>';
    var timer, dur = o.duration == null ? 6000 : o.duration;
    function close() { clearTimeout(timer); if (el.parentNode) el.parentNode.removeChild(el); }
    el.querySelector(".ep-toast__close").addEventListener("click", close);
    if (dur > 0) { timer = setTimeout(close, dur); el.addEventListener("pointerenter", function () { clearTimeout(timer); }); el.addEventListener("pointerleave", function () { timer = setTimeout(close, 2000); }); }
    toastHost.appendChild(el); return { element: el, close: close };
  }
  function activateTab(tab) {
    var list = tab.closest('[role="tablist"]'); if (!list) return;
    var tabs = list.querySelectorAll('[role="tab"]'), root = list.closest("[data-ep-tabs]") || document;
    tabs.forEach(function (t) {
      var on = t === tab; t.setAttribute("aria-selected", on ? "true" : "false"); t.tabIndex = on ? 0 : -1;
      var id = t.getAttribute("aria-controls"), p = id && root.querySelector("#" + CSS.escape(id)); if (p) p.hidden = !on;
    });
  }
  var tipEl = null;
  function showTip(target) {
    var text = target.getAttribute("data-ep-tip"); if (!text) return;
    if (!tipEl) { tipEl = document.createElement("div"); tipEl.className = "ep-tooltip"; tipEl.id = "ep-tooltip"; tipEl.setAttribute("role", "tooltip"); document.body.appendChild(tipEl); }
    tipEl.textContent = text; tipEl.hidden = false; target.setAttribute("aria-describedby", "ep-tooltip");
    var r = target.getBoundingClientRect(), tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
    var left = Math.min(Math.max(8, r.left + r.width / 2 - tw / 2), window.innerWidth - tw - 8), top = r.top - th - 8;
    if (top < 8) top = r.bottom + 8;
    tipEl.style.left = left + window.scrollX + "px"; tipEl.style.top = top + window.scrollY + "px";
  }
  function hideTip(target) { if (tipEl) tipEl.hidden = true; if (target) target.removeAttribute("aria-describedby"); }
  if (HAS_DOM) {
    document.addEventListener("click", function (e) {
      var o = e.target.closest && e.target.closest("[data-ep-open]");
      if (o) { var d = document.querySelector(o.getAttribute("data-ep-open")); if (d && d.showModal && !d.open) { d.dataset.epReturn = ""; d.__epOpener = o; d.showModal(); } return; }
      var c = e.target.closest && e.target.closest("[data-ep-close]");
      if (c) { var dd = c.closest("dialog"); if (dd) dd.close(); return; }
      if (e.target.tagName === "DIALOG" && e.target.classList.contains("ep-dialog")) {
        var r = e.target.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) e.target.close();
        return;
      }
      var tab = e.target.closest && e.target.closest('[data-ep-tabs] [role="tab"]'); if (tab) { activateTab(tab); return; }
      var tg = e.target.closest && e.target.closest("[data-ep-toggle] button");
      if (tg) { var grp = tg.closest("[data-ep-toggle]"); grp.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", b === tg ? "true" : "false"); }); grp.dispatchEvent(new CustomEvent("ep-change", { bubbles: true, detail: { value: tg.getAttribute("data-value") || tg.textContent.trim() } })); }
    });
    document.addEventListener("close", function (e) { var d = e.target; if (d && d.__epOpener && d.__epOpener.focus) d.__epOpener.focus(); }, true);
    document.addEventListener("keydown", function (e) {
      var tab = e.target.closest && e.target.closest('[data-ep-tabs] [role="tab"]');
      if (tab) {
        var list = tab.closest('[role="tablist"]'), tabs = Array.prototype.slice.call(list.querySelectorAll('[role="tab"]')), i = tabs.indexOf(tab), n = null;
        if (e.key === "ArrowRight") n = tabs[(i + 1) % tabs.length]; else if (e.key === "ArrowLeft") n = tabs[(i - 1 + tabs.length) % tabs.length]; else if (e.key === "Home") n = tabs[0]; else if (e.key === "End") n = tabs[tabs.length - 1];
        if (n) { e.preventDefault(); n.focus(); activateTab(n); }
      }
      if (e.key === "Escape") hideTip();
    });
    document.addEventListener("pointerover", function (e) { var t = e.target.closest && e.target.closest("[data-ep-tip]"); if (t) showTip(t); });
    document.addEventListener("pointerout", function (e) { var t = e.target.closest && e.target.closest("[data-ep-tip]"); if (t && !t.contains(e.relatedTarget)) hideTip(t); });
    document.addEventListener("focusin", function (e) { var t = e.target.closest && e.target.closest("[data-ep-tip]"); if (t) showTip(t); });
    document.addEventListener("focusout", function (e) { var t = e.target.closest && e.target.closest("[data-ep-tip]"); if (t) hideTip(t); });
  }

  /* ------------------------------------------------------------ API publique */
  function setTheme(mode) {
    if (!HAS_DOM) return;
    var root = document.documentElement;
    function apply() { root.setAttribute("data-theme", window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"); }
    if (mode === "system") { apply(); if (window.matchMedia) window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", apply); }
    else root.setAttribute("data-theme", mode === "dark" ? "dark" : mode === "noir" ? "noir" : "light");
  }
  function loadFonts() {
    if (!HAS_DOM || document.querySelector("link[data-ep-fonts]")) return;
    var l = document.createElement("link"); l.rel = "stylesheet"; l.setAttribute("data-ep-fonts", "");
    l.href = "https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Instrument+Sans:wght@400..700&family=Instrument+Serif:ital@0;1&display=swap";
    document.head.appendChild(l);
  }

  var api = {
    version: "1.0.0",
    FlowField: FlowField, Voronoi: Voronoi, Mark: Mark, DataField: DataField, Chart: Chart, FlowBackground: FlowBackground, FlowType: FlowType,
    Dialog: { open: function (el) { if (typeof el === "string") el = document.querySelector(el); if (el && el.showModal && !el.open) el.showModal(); }, close: function (el) { if (typeof el === "string") el = document.querySelector(el); if (el && el.close) el.close(); } },
    Toast: toast, toast: toast,
    Tabs: { activate: activateTab }, Tooltip: { show: showTip, hide: hideTip },
    engine: { rng: rng, noise2: noise2, seedOf: seedOf, hashStr: hashStr, flowLines: flowLines, ribbonLines: ribbonLines, voronoiCells: voronoiCells, voronoiSeeds: voronoiSeeds, relax: relax, lorenzLine: lorenzLine, guillocheLines: guillocheLines, noise8: noise8, streamSim: streamSim },
    svg: { flow: flowSVG, voronoi: voronoiSVG, mark: markSVG, dataField: dataFieldSVG, stream: streamSVG, fromLines: svgOf, pathD: pathD },
    setTheme: setTheme, loadFonts: loadFonts
  };
  if (HAS_DOM) {
    define("ep-flow-field", FlowField); define("ep-voronoi", Voronoi); define("ep-mark", Mark); define("ep-data-field", DataField); define("ep-chart", Chart); define("ep-flow-bg", FlowBackground); define("ep-flow-type", FlowType);
  }
  if (typeof window !== "undefined") window[NS] = api;
})();
/* ---------------------------------------------------------------- Liquid Glass
   Réfraction réelle : une carte de déplacement (feImage + feDisplacementMap) calculée par la loi de Snell-Descartes
   sur le profil d'un biseau, appliquée en backdrop-filter. Chromium seulement ; ailleurs, repli en flou + saturation.
   Chaque surface lit sa forme dans le CSS : border-radius, --glass-bezel, --glass-thickness, --glass-surface… */
(function () {
  "use strict";
  if (typeof document === "undefined" || typeof window === "undefined") return;
  var NS = window.EncrePapier || (window.EncrePapier = {});
  var SVGNS = "http://www.w3.org/2000/svg";
  var N = 127; /* échantillons du profil : 8 bits, 128 = neutre */

  /* Profils de surface : t de 0 (bord) à 1 (fin du biseau) -> hauteur de 0 à 1. */
  var SURF = {
    convex: function (t) { return Math.pow(1 - Math.pow(1 - t, 4), 0.25); },
    circle: function (t) { return Math.sqrt(1 - (1 - t) * (1 - t)); },
    concave: function (t) { return 1 - SURF.convex(t); },
    lip: function (t) { var s = t * t * t * (t * (t * 6 - 15) + 10); return SURF.convex(t) * (1 - s) + SURF.concave(t) * s; }
  };

  /* ---------------------------------------------------------- détection */
  var ua = navigator.userAgent || "";
  var brands = (navigator.userAgentData && navigator.userAgentData.brands) || [];
  var CHROMIUM = brands.some(function (b) { return /Chromium/i.test(b.brand); }) || (/Chrome\/\d+/.test(ua) && !/Firefox\//.test(ua));
  var HAS_BACKDROP = !!(window.CSS && CSS.supports && (CSS.supports("backdrop-filter", "blur(1px)") || CSS.supports("-webkit-backdrop-filter", "blur(1px)")));
  var REFRACT = CHROMIUM && HAS_BACKDROP;

  /* Surfaces qui reçoivent la réfraction (le CSS leur donne la forme et la teinte). */
  var SELECTORS = [
    ".ep-glass", "[data-glass]", ".ep-plate:not(.ep-plate--flat)", ".ep-dialog", ".ep-header", ".ep-sidebar", ".ep-table-wrap", ".ep-alert", ".ep-toast",
    ".ep-tooltip", ".ep-chart__tip", ".ep-player", ".ep-search", ".ep-btn", ".ep-input", ".ep-select", ".ep-textarea", ".ep-tag",
    ".ep-toggle", ".ep-tabs", ".ep-page", ".ep-range__thumb", ".ep-check input", ".ep-kbd", ".ep-pop"
  ].join(",");
  /* Parties flottantes d'un contrôle : la pastille de l'interrupteur est un pseudo-élément du champ. */
  var THUMBS = [{ sel: ".ep-switch input", prop: "--epg-thumb" }];

  /* ------------------------------------------------------------- calcul */
  var profCache = {};
  function profile(surface, bezel, thick, ior) {
    var key = [surface, bezel.toFixed(1), thick, ior].join("|");
    if (profCache[key]) return profCache[key];
    var f = SURF[surface] || SURF.convex, mag = new Float32Array(N), max = 0, i, t, t1, t2, dh, slope, alpha, th2, dev, depth, v;
    for (i = 0; i < N; i++) {
      t = i / (N - 1); t1 = Math.max(0, t - 0.002); t2 = Math.min(1, t + 0.002);
      dh = (f(t2) - f(t1)) / (t2 - t1);
      slope = dh * thick / bezel;
      alpha = Math.atan(Math.abs(slope));
      th2 = Math.asin(Math.sin(alpha) / ior);
      dev = (alpha - th2) * (slope < 0 ? -1 : 1);
      depth = thick * (0.3 + f(t));
      v = Math.tan(dev) * depth;
      /* Amorce douce : au bord même la pente est verticale et le déplacement saute de 0 à son pic en un pixel, ce qui hache le contour. */
      if (t < 0.12) { var u = t / 0.12; v *= u * u * (3 - 2 * u); }
      mag[i] = v;
      if (Math.abs(v) > max) max = Math.abs(v);
    }
    if (max < 0.001) max = 0.001;
    for (i = 0; i < N; i++) mag[i] /= max;
    return (profCache[key] = { mag: mag, max: Math.min(max, 140) });
  }

  /* Pixel neutre de la carte (128, 128, 128, 255 : aucun déplacement), lu dans l'ordre des octets de la plateforme. */
  var NEUTRAL = new Uint32Array(new Uint8ClampedArray([128, 128, 128, 255]).buffer)[0];

  /* ---------------------------------------------------------------- PNG
     Écrit à la main, sans compression (blocs « stored » de deflate), à partir des pixels déjà calculés : passer par un
     canvas imposait une copie vers le GPU puis une relecture synchrone (toDataURL comme toBlob), qui figeait la page.
     Le navigateur décode ensuite l'image hors du fil principal. */
  var CRC_TABLE = (function () {
    var t = new Int32Array(256), c, n, k;
    for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
    return t;
  })();
  function crc32(bytes, from, to) {
    var c = -1;
    for (var i = from; i < to; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
    return c ^ -1;
  }
  function adler32(bytes) {
    var a = 1, b = 0, i = 0, n = bytes.length, end;
    while (i < n) { /* 5552 octets au plus entre deux modulos : b reste sous 2^32 */
      end = Math.min(i + 5552, n);
      for (; i < end; i++) { a += bytes[i]; b += a; }
      a %= 65521; b %= 65521;
    }
    return (b << 16 | a) >>> 0;
  }
  var STORED_MAX = 65535;
  function png(w, h, rgba) {
    var row = w * 4 + 1, raw = new Uint8Array(row * h), y, i;
    for (y = 0; y < h; y++) raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * row + 1); /* filtre 0 en tête de rangée */
    var blocks = Math.max(1, Math.ceil(raw.length / STORED_MAX)), idat = 2 + raw.length + blocks * 5 + 4;
    var out = new Uint8Array(8 + (12 + 13) + (12 + idat) + 12), p = 0;
    function u32(v) { out[p++] = v >>> 24 & 255; out[p++] = v >>> 16 & 255; out[p++] = v >>> 8 & 255; out[p++] = v & 255; }
    function chunk(type, length, write) {
      u32(length);
      var start = p;
      for (var j = 0; j < 4; j++) out[p++] = type.charCodeAt(j);
      write();
      u32(crc32(out, start, p));
    }
    out.set([137, 80, 78, 71, 13, 10, 26, 10]); p = 8;
    /* 8 bits par canal, RGBA, compression et filtres standard, sans entrelacement */
    chunk("IHDR", 13, function () { u32(w); u32(h); out[p++] = 8; out[p++] = 6; out[p++] = 0; out[p++] = 0; out[p++] = 0; });
    chunk("IDAT", idat, function () {
      out[p++] = 0x78; out[p++] = 0x01;
      for (i = 0; i < raw.length; i += STORED_MAX) {
        var len = Math.min(STORED_MAX, raw.length - i);
        out[p++] = i + len >= raw.length ? 1 : 0; /* dernier bloc */
        out[p++] = len & 255; out[p++] = len >>> 8; out[p++] = ~len & 255; out[p++] = ~len >>> 8 & 255;
        out.set(raw.subarray(i, i + len), p); p += len;
      }
      u32(adler32(raw));
    });
    chunk("IEND", 0, function () {});
    return out;
  }
  function pngUrl(w, h, rgba) {
    var bytes = png(w, h, rgba);
    if (typeof Blob !== "undefined" && typeof URL !== "undefined" && URL.createObjectURL) {
      return URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
    }
    var bin = "";
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return "data:image/png;base64," + btoa(bin);
  }

  /* Cartes par forme, en cache. */
  var mapCache = {};
  function maps(w, h, r, bezel, surface, thick, ior, specW, reach) {
    var key = [w, h, r.toFixed(1), bezel.toFixed(1), surface, thick, ior, specW, reach].join("|");
    if (mapCache[key]) return mapCache[key];
    var prof = profile(surface, bezel, thick, ior), mag = prof.mag, sReal = Math.min(prof.max, bezel * reach);
    var k = Math.min(1, Math.sqrt(380000 / (w * h)));
    var cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k)), s = 1 / k;
    var d1 = new Uint8ClampedArray(cw * ch * 4), d2 = new Uint8ClampedArray(cw * ch * 4);
    var hw = w / 2, hh = h / 2, rx = hw - r, ry = hh - r, LX = -0.7071, LY = -0.7071;
    var x, y, px, py, dx, dy, qx, qy, nx, ny, sd, dist, t, fi, i0, i1, m, idx, len, dot, I, fall, a, b;
    /* Seul le bord change quelque chose : au-delà de `band` du bord, la carte est neutre et le reflet transparent.
       On remplit donc tout en neutre, puis on ne calcule que les rangées des coins (et du haut, du bas) en entier
       et, ailleurs, les deux bandes de gauche et de droite. Résultat identique au calcul de chaque pixel. */
    new Uint32Array(d1.buffer).fill(NEUTRAL);
    var band = Math.max(bezel, specW + 1) + 2 * s, edge = Math.max(r, band) + 2 * s;
    var xa = Math.min(cw, Math.ceil(band / s)), xb = Math.max(xa, cw - Math.ceil(band / s)), full;
    for (y = 0; y < ch; y++) {
      py = (y + 0.5) * s; full = py < edge || py > h - edge;
      for (x = 0; x < cw; x++) {
        if (!full && x === xa && xb > xa) { x = xb - 1; continue; }
        px = (x + 0.5) * s; dx = px - hw; dy = py - hh;
        qx = Math.abs(dx) - rx; qy = Math.abs(dy) - ry;
        if (qx > 0 && qy > 0) { len = Math.sqrt(qx * qx + qy * qy); nx = (dx < 0 ? -1 : 1) * qx / len; ny = (dy < 0 ? -1 : 1) * qy / len; sd = len - r; }
        else if (qx > qy) { nx = dx < 0 ? -1 : 1; ny = 0; sd = qx - r; }
        else { nx = 0; ny = dy < 0 ? -1 : 1; sd = qy - r; }
        dist = -sd; idx = (y * cw + x) * 4;
        if (dist > -1 && dist < bezel) {
          t = (dist < 0 ? 0 : dist) / bezel; fi = t * (N - 1); i0 = fi | 0; i1 = i0 + 1 > N - 1 ? N - 1 : i0 + 1;
          m = mag[i0] + (mag[i1] - mag[i0]) * (fi - i0);
          /* un déplacement vers l'extérieur ne doit pas sortir de l'élément : le fond n'existe pas au-delà (bords étirés) */
          if (m < 0) { a = (dist < 0 ? 0 : dist) * 0.7 / sReal; if (-m > a) m = -a; }
          d1[idx] = 128 - nx * m * 127; d1[idx + 1] = 128 - ny * m * 127;
        }
        if (dist > -1 && dist < specW + 1) {
          dot = nx * LX + ny * LY; I = Math.pow(Math.abs(dot), 1.25) * (dot < 0 ? 0.5 : 1);
          fall = 1 - Math.max(0, dist) / (specW + 1); fall = fall * fall;
          a = I * fall;
          if (dist < bezel) { b = 1 - dist / bezel; a += I * b * b * 0.1; }
          d2[idx] = 255; d2[idx + 1] = 255; d2[idx + 2] = 255; d2[idx + 3] = Math.min(255, a * 255);
        }
      }
    }
    /* Déplacement maximal borné à reach x biseau : au-delà, le contenu vient de trop loin et le bord se hache (surtout sur une pastille de 30 px). */
    return (mapCache[key] = { map: pngUrl(cw, ch, d1), spec: pngUrl(cw, ch, d2), scale: Math.min(prof.max, bezel * reach) * 2.008 });
  }

  /* --------------------------------------------------------------- filtres */
  var defs = null, uid = 0, entries = new Map();
  function ensureDefs() {
    if (defs && defs.isConnected) return defs;
    var svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("width", "0"); svg.setAttribute("height", "0"); svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
    defs = document.createElementNS(SVGNS, "defs"); svg.appendChild(defs);
    (document.body || document.documentElement).appendChild(svg);
    return defs;
  }
  function el(name, attrs) {
    var n = document.createElementNS(SVGNS, name), k;
    for (k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }
  function buildFilter(id, w, h, m, strength, specOpacity) {
    var f = ensureDefs().querySelector("#" + id);
    if (!f) { f = el("filter", { id: id, "color-interpolation-filters": "sRGB" }); defs.appendChild(f); }
    while (f.firstChild) f.removeChild(f.firstChild);
    var img = function (href, result) {
      var n = el("feImage", { x: 0, y: 0, width: w, height: h, preserveAspectRatio: "none", result: result });
      n.setAttribute("href", href); n.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", href);
      return n;
    };
    f.appendChild(img(m.map, "epmap"));
    f.appendChild(el("feDisplacementMap", { in: "SourceGraphic", in2: "epmap", scale: (m.scale * strength).toFixed(2), xChannelSelector: "R", yChannelSelector: "G", result: "epdisp" }));
    f.appendChild(img(m.spec, "epspec"));
    f.appendChild(el("feComponentTransfer", { in: "epspec", result: "epspec2" }));
    f.lastChild.appendChild(el("feFuncA", { type: "linear", slope: specOpacity }));
    f.appendChild(el("feComposite", { in: "epspec2", in2: "epdisp", operator: "over" }));
  }

  /* ------------------------------------------------------------ lecture CSS */
  function num(cs, name, def) { var v = parseFloat(cs.getPropertyValue(name)); return isFinite(v) ? v : def; }
  function str(cs, name, def) { var v = cs.getPropertyValue(name).trim(); return v || def; }
  function radiusOf(cs, w, h) {
    var r = cs.borderTopLeftRadius || "0px", v = parseFloat(r) || 0;
    if (/%/.test(r)) v = Math.min(w, h) * v / 100;
    return Math.max(0, Math.min(v, Math.min(w, h) / 2));
  }

  function apply(node, part) {
    var cs = getComputedStyle(node), p = part ? "--gt-" : "--glass-", w, h, r, prop = part ? part.prop : "--epg";
    w = part ? num(cs, "--gt-w", 0) : node.offsetWidth;
    h = part ? num(cs, "--gt-h", 0) : node.offsetHeight;
    if (!(w > 2 && h > 2)) return false;
    r = part ? Math.min(num(cs, "--gt-r", h / 2), Math.min(w, h) / 2) : radiusOf(cs, w, h);
    var bezel = Math.max(2, Math.min(num(cs, p + "bezel", Math.min(14, Math.min(w, h) / 2)), Math.min(w, h) / 2));
    var thick = num(cs, p + "thickness", 36), ior = num(cs, p + "ior", 1.5), surface = str(cs, p + "surface", "convex");
    var blur = num(cs, p + "blur", 4), sat = num(cs, p + "sat", 1.5), spec = num(cs, p + "spec", 0.8), strength = num(cs, p + "strength", 1);
    var specW = num(cs, p + "spec-width", 1.6), reach = num(cs, p + "reach", 1.2);
    var key = (part ? "t" : "s"), rec = entries.get(node) || {};
    var id = rec[key] || (rec[key] = "epg-" + (++uid));
    entries.set(node, rec);
    buildFilter(id, w, h, maps(Math.round(w), Math.round(h), r, bezel, surface, thick, ior, specW, reach), strength, spec);
    node.style.setProperty(prop, "blur(" + blur + "px) url(#" + id + ") saturate(" + sat + ")");
    rec.w = w; rec.h = h;
    return true;
  }
  function release(node) {
    node.style.removeProperty("--epg"); node.style.removeProperty("--epg-thumb");
  }

  /* Un élément à backdrop-filter est une « racine de fond » : ses enfants ne voient plus la page, seulement lui.
     Un contrôle posé dans un bloc de verre n'est donc pas réfracté : il reçoit un style de verre posé (data-glass-nested).
     Les pastilles (interrupteur, curseur) et les cases ont ce même rendu posé partout, dans un bloc comme sur la scène : un seul aspect. */
  var FLAT = ".ep-range__thumb, .ep-check input";
  function isNested(node) {
    if (node.matches("dialog")) return false;
    if (node.matches(FLAT)) return true;
    var p = node.parentElement;
    return !!(p && p.closest("[data-glass-live]"));
  }
  function enabled(node) { return !node.closest('[data-surface="paper"], [data-glass="off"]'); }

  /* Un élément qui apparaît (dialogue ouvert, onglet affiché) est traité tout de suite ; un redimensionnement continu est regroupé sur 60 ms. */
  var ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(function (list) {
    list.forEach(function (e) { var rec = entries.get(e.target); queue(e.target, !rec || !rec.w); });
  }) : null;
  var pending = new Set(), timer = 0, due = 0;
  function queue(node, fast) {
    pending.add(node);
    var wait = fast ? 0 : 60, at = performance.now() + wait;
    if (timer && due <= at) return;
    clearTimeout(timer); due = at; timer = setTimeout(flush, wait);
  }
  function flush() {
    timer = 0;
    var list = Array.from(pending); pending.clear();
    list.forEach(function (n) { if (n.isConnected) update(n); });
  }
  function update(node) {
    var rec = entries.get(node);
    if (!rec) return;
    if (!enabled(node)) { release(node); node.removeAttribute("data-glass-live"); node.removeAttribute("data-glass-thumb"); node.removeAttribute("data-glass-nested"); return; }
    if (rec.thumb) {
      /* même règle que les surfaces : pas de réfraction hors Chromium, ni dans un bloc de verre (racine de fond) */
      var inside = true; /* l'interrupteur a toujours la pastille posée */
      node.toggleAttribute("data-glass-nested", inside);
      if (!REFRACT || inside) { release(node); node.removeAttribute("data-glass-thumb"); return; }
      if (apply(node, rec.thumb)) node.setAttribute("data-glass-thumb", "");
      return;
    }
    if (isNested(node)) { release(node); node.removeAttribute("data-glass-live"); node.setAttribute("data-glass-nested", ""); return; }
    node.removeAttribute("data-glass-nested");
    if (!REFRACT) return;
    /* posé tout de suite : les contrôles placés dedans se savent imbriqués sans attendre la carte */
    node.setAttribute("data-glass-live", "");
    refractLater(node);
  }

  /* Une carte de réfraction coûte cher (une boucle par pixel, puis deux PNG) et une page en compte des dizaines au chargement :
     calculées d'un bloc, elles figeaient la page plusieurs centaines de millisecondes sur mobile. On les calcule par tranches
     de quelques millisecondes ; en attendant, le CSS applique le flou de repli (var(--epg, blur(...))). */
  var REFRACT_SLICE_MS = 8, toRefract = new Set(), refractTimer = 0;
  /* Une surface hors de l'écran attend d'en approcher (une demi-hauteur d'écran) : au chargement, seules les cartes
     visibles sont calculées, et une surface masquée (dialogue fermé) ne l'est qu'à son ouverture. */
  var nearView = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(function (list) {
    list.forEach(function (e) {
      if (!e.isIntersecting) return;
      nearView.unobserve(e.target);
      queueRefract(e.target);
    });
  }, { rootMargin: "50% 0px" }) : null;
  function refractLater(node) {
    /* observer à nouveau un élément déjà observé ne redonne pas de notification : on le retire d'abord */
    if (nearView) { nearView.unobserve(node); nearView.observe(node); } else queueRefract(node);
  }
  function queueRefract(node) {
    toRefract.add(node);
    if (!refractTimer) refractTimer = setTimeout(refractSlice, 0);
  }
  function refractSlice() {
    refractTimer = 0;
    var end = performance.now() + REFRACT_SLICE_MS, it = toRefract.values(), step;
    while (!(step = it.next()).done) {
      toRefract.delete(step.value);
      refract(step.value);
      if (performance.now() >= end) break;
    }
    if (toRefract.size) refractTimer = setTimeout(refractSlice, 0);
  }
  function refract(node) {
    /* l'élément a pu disparaître, passer sur papier ou dans un bloc de verre entre-temps */
    if (!node.isConnected || !entries.has(node) || !node.hasAttribute("data-glass-live")) return;
    if (apply(node, null)) return;
    /* trop petit pour une carte (élément masqué) : pas de verre réfractant, et ses enfants ne sont plus imbriqués */
    node.removeAttribute("data-glass-live");
    scheduleScan();
  }

  var scanQueued = false;
  function scan(root) {
    root = root || document;
    var nodes = root.querySelectorAll ? root.querySelectorAll(SELECTORS) : [];
    var list = Array.prototype.slice.call(nodes);
    if (root.matches && root !== document && root.matches(SELECTORS)) list.unshift(root);
    list.forEach(function (n) {
      if (entries.has(n)) return;
      entries.set(n, {});
      if (ro) ro.observe(n);
      update(n);
    });
    THUMBS.forEach(function (t) {
      var ns = root.querySelectorAll ? root.querySelectorAll(t.sel) : [];
      Array.prototype.forEach.call(ns, function (n) {
        if (entries.has(n)) return;
        entries.set(n, { thumb: t });
        if (ro) ro.observe(n);
        update(n);
      });
    });
    /* nettoyage des filtres dont l'élément a disparu */
    entries.forEach(function (rec, n) {
      if (n.isConnected) return;
      entries.delete(n); if (ro) ro.unobserve(n); if (nearView) nearView.unobserve(n);
      ["s", "t"].forEach(function (k) { if (rec[k] && defs) { var f = defs.querySelector("#" + rec[k]); if (f) defs.removeChild(f); } });
    });
    /* le statut « imbriqué » dépend de l'ordre : on le rafraîchit pour les éléments déjà connus, pastilles comprises */
    entries.forEach(function (rec, n) { if (n.isConnected && isNested(n) !== n.hasAttribute("data-glass-nested")) update(n); });
  }
  function scheduleScan() {
    if (scanQueued) return; scanQueued = true;
    requestAnimationFrame(function () { scanQueued = false; scan(document); });
  }

  /* ------------------------------------------------------ composants annexes */
  function setRange(wrap) {
    var input = wrap.querySelector("input[type=range]");
    if (!input) return;
    var min = parseFloat(input.min || 0), max = parseFloat(input.max || 100), v = parseFloat(input.value);
    wrap.style.setProperty("--pf", String(max > min ? (v - min) / (max - min) : 0));
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function fmtTime(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ":" + pad(s % 60); }
  var players = [];
  function setupPlayer(p) {
    if (p.__ep) return; p.__ep = true;
    var rng = p.querySelector("input[type=range]"), cur = p.querySelector("[data-ep-time]"), tot = p.querySelector("[data-ep-total]"),
      play = p.querySelector("[data-ep-play]"), dur = parseFloat(p.getAttribute("data-duration") || 214);
    if (!rng) return;
    rng.min = 0; rng.max = dur; rng.step = 1;
    if (tot) tot.textContent = fmtTime(dur);
    function sync() { setRange(rng.closest(".ep-range")); if (cur) cur.textContent = fmtTime(+rng.value); }
    rng.addEventListener("input", sync); sync();
    if (play) play.addEventListener("click", function () { play.setAttribute("aria-pressed", play.getAttribute("aria-pressed") === "true" ? "false" : "true"); });
    players.push({ p: p, rng: rng, play: play, sync: sync, dur: dur });
  }
  setInterval(function () {
    players.forEach(function (o) {
      if (!o.p.isConnected || !o.play || o.play.getAttribute("aria-pressed") !== "true") return;
      var v = +o.rng.value + 1; if (v > o.dur) { v = 0; o.play.setAttribute("aria-pressed", "false"); }
      o.rng.value = v; o.sync();
    });
  }, 1000);

  function initRanges(root) {
    Array.prototype.forEach.call((root || document).querySelectorAll(".ep-range"), setRange);
    Array.prototype.forEach.call((root || document).querySelectorAll("[data-ep-player]"), setupPlayer);
  }

  function init() {
    var root = document.documentElement;
    root.setAttribute("data-glass-mode", REFRACT ? "refract" : (HAS_BACKDROP ? "blur" : "flat"));
    ensureDefs(); scan(document); initRanges(document);
    if (typeof MutationObserver !== "undefined") {
      new MutationObserver(function (muts) {
        var hasEl = function (l) { return Array.prototype.some.call(l, function (n) { return n.nodeType === 1; }); };
        var add = muts.some(function (m) { return !(defs && defs.parentNode && defs.parentNode.contains(m.target)) && (hasEl(m.addedNodes) || hasEl(m.removedNodes)); });
        if (add) { scheduleScan(); initRanges(document); }
      }).observe(document.body, { childList: true, subtree: true });
    }
    document.addEventListener("input", function (e) { var w = e.target.closest && e.target.closest(".ep-range"); if (w) setRange(w); });
    function press(on) { return function (e) { var w = e.target.closest && e.target.closest(".ep-range"); if (w) { if (on) w.setAttribute("data-active", ""); else w.removeAttribute("data-active"); } if (!on) Array.prototype.forEach.call(document.querySelectorAll(".ep-range[data-active]"), function (x) { x.removeAttribute("data-active"); }); }; }
    document.addEventListener("pointerdown", press(true)); document.addEventListener("pointerup", press(false)); document.addEventListener("pointercancel", press(false));
    /* un <dialog> ouvert change de taille et d'affichage : on laisse ResizeObserver agir, sauf si le navigateur n'émet rien */
    document.addEventListener("toggle", scheduleScan, true);
    document.addEventListener("click", function () { setTimeout(scheduleScan, 30); }, true);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();

  NS.Glass = {
    /** "refract" (Chromium : vraie réfraction), "blur" (flou et saturation) ou "flat". */
    mode: REFRACT ? "refract" : (HAS_BACKDROP ? "blur" : "flat"),
    surfaces: Object.keys(SURF),
    /** Recalcule les surfaces (toutes, ou celles d'un sous-arbre). */
    refresh: function (root) { entries.forEach(function (rec, n) { if (!root || root.contains(n)) update(n); }); scan(root || document); },
    /** Donne le verre à un élément qui n'est pas dans la liste de base. */
    add: function (node) { node.setAttribute("data-glass", ""); scan(node.parentNode || document); }
  };
})();
