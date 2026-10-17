/* @code-my-life/systems-generator 0.1.1 : générateur de fond, à charger après liquid-paper.js (window.BgGen, window.BgGenerator). Généré par scripts/build-dist.mjs, ne pas éditer. */
/* ---- bg-gen-core.js */
/* Noyau du générateur de fond : registre des systèmes, outils communs et boucle de canevas.
   Sans interface : le panneau est dans bg-generator.js, les systèmes dans gen-types/*.js.
   Chaque système s'enregistre avec BgGen.register({...}) (voir gen-types/SPEC.md). Dépend de window.EncrePapier (liquid-paper.js, paquet @code-my-life/liquid-paper). */
(function () {
  "use strict";
  var EP = window.EncrePapier, doc = typeof document !== "undefined" ? document : null;
  var TAU = Math.PI * 2;

  /* ------------------------------------------------------------------ outils */
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function hexRgb(h) {
    var m = /^#?([0-9a-f]{6})/i.exec(String(h).trim());
    if (!m) return [240, 240, 236];
    return [parseInt(m[1].substr(0, 2), 16), parseInt(m[1].substr(2, 2), 16), parseInt(m[1].substr(4, 2), 16)];
  }
  /* couleurs du thème courant : l'encre (--ink) et le papier (--paper), en [r, g, b] */
  function themeRgb(name, fallback) {
    if (!doc || !window.getComputedStyle) return fallback;
    return hexRgb(getComputedStyle(doc.documentElement).getPropertyValue(name) || "") || fallback;
  }
  function inkRgb() { return themeRgb("--ink", [240, 240, 236]); }
  function paperRgb() { return themeRgb("--paper", [23, 24, 27]); }
  function css(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + (a == null ? 1 : a) + ")"; }
  function inkCss(a) { return css(inkRgb(), a); }
  function paperCss(a) { return css(paperRgb(), a); }
  function isDark() { var c = paperRgb(); return (c[0] + c[1] + c[2]) / 3 < 128; }
  function seedOf(v) { return EP.engine.seedOf(v); }
  function setAttr(el, k, v) { if (v === null || v === undefined || v === "") { if (el.hasAttribute(k)) el.removeAttribute(k); } else if (el.getAttribute(k) !== String(v)) el.setAttribute(k, String(v)); }

  /* ------------------------------------------------------- boucle de canevas */
  /* Un canevas plein cadre, redimensionné avec la fenêtre, avec une boucle rAF qui s'arrête quand l'onglet est masqué.
     opt : frame(r, dt) obligatoire ; resize(r) ; redraw(r) ; scale (résolution relative, 1 par défaut) ; maxDpr (1,5 par défaut).
     r : cv, ctx, w, h (px CSS), k (échelle appareil), t (secondes de simulation), paused, dirty (demande une image même en pause), speed. */
  function runner(host, opt) {
    var cv = doc.createElement("canvas"), r = { cv: cv, ctx: cv.getContext("2d"), w: 2, h: 2, k: 1, t: 0, paused: false, dirty: true }, raf = 0, last = 0, rt = 0, ro = null, dead = false;
    cv.className = "gen__cv"; host.appendChild(cv);
    function size() {
      var b = host.getBoundingClientRect();
      r.w = Math.max(2, Math.round(b.width)); r.h = Math.max(2, Math.round(b.height));
      r.k = Math.min(window.devicePixelRatio || 1, opt.maxDpr || 1.5) * (opt.scale || 1);
      cv.width = Math.max(2, Math.round(r.w * r.k)); cv.height = Math.max(2, Math.round(r.h * r.k));
      r.dirty = true;
      if (opt.resize) opt.resize(r);
    }
    function loop(now) {
      if (dead) return;
      raf = requestAnimationFrame(loop);
      var dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (doc.hidden || (r.paused && !r.dirty)) return;
      if (!r.paused) r.t += dt * (r.speed == null ? 1 : r.speed);
      r.dirty = false;
      opt.frame(r, dt);
    }
    size();
    if (typeof ResizeObserver !== "undefined") { ro = new ResizeObserver(function () { clearTimeout(rt); rt = setTimeout(size, 120); }); ro.observe(host); }
    raf = requestAnimationFrame(function (n) { last = n; loop(n); });
    r.destroy = function () { dead = true; cancelAnimationFrame(raf); clearTimeout(rt); if (ro) ro.disconnect(); cv.remove(); };
    r.redraw = function () { r.dirty = true; if (opt.redraw) opt.redraw(r); };
    return r;
  }

  /* ---------------------------------------------------------------- registre */
  /* auto : false = jamais varié ; un nombre (0 à 1) = fraction de l'amplitude de variation (réglage sensible) ; absent = amplitude pleine */
  function range(k, label, min, max, step, v, unit, auto) { return { k: k, label: label, type: "range", min: min, max: max, step: step, v: v, unit: unit || "", auto: auto !== false, autoAmp: typeof auto === "number" ? auto : 1 }; }
  function toggle(k, label, v) { return { k: k, label: label, type: "toggle", v: v, auto: false }; }
  /* options : [[valeur, libellé], ...] ; la valeur est une chaîne */
  function select(k, label, options, v) { return { k: k, label: label, type: "select", options: options, v: v == null ? options[0][0] : v, auto: false }; }
  function text(k, label, v, max) { return { k: k, label: label, type: "text", v: v || "", max: max || 40, auto: false }; }

  var GROUPS = ["Flux et attracteurs", "Croissance et cellules", "Corps et foules", "Formes et lumière", "Motifs et ondes", "Déformation par le bruit", "Le système en usage"];
  var BgGen = { types: {}, order: [], groups: GROUPS, hostEl: null };

  BgGen.register = function (def) {
    if (!def || !def.id || !def.label || !def.mount || !def.code || !Array.isArray(def.params)) throw new Error("BgGen.register : id, label, params, mount et code sont obligatoires (" + (def && def.id) + ")");
    if (GROUPS.indexOf(def.group) < 0) throw new Error("BgGen.register : groupe inconnu « " + def.group + " » (" + def.id + ")");
    if (def.params.length > 10) throw new Error("BgGen.register : 10 réglages au plus (" + def.id + ")");
    if (BgGen.types[def.id]) throw new Error("BgGen.register : id déjà pris (" + def.id + ")");
    def.int = def.int == null ? 0.9 : def.int;
    BgGen.types[def.id] = def;
    BgGen.order.push(def.id);
    /* tri : groupes dans l'ordre du kit, puis numéro de planche */
    BgGen.order.sort(function (a, b) {
      var A = BgGen.types[a], B = BgGen.types[b], ga = GROUPS.indexOf(A.group), gb = GROUPS.indexOf(B.group);
      return ga - gb || String(A.kit).localeCompare(String(B.kit));
    });
    return def;
  };
  BgGen.range = range; BgGen.toggle = toggle; BgGen.select = select; BgGen.text = text;

  BgGen.api = {
    EP: EP, TAU: TAU, clamp: clamp, smooth: smooth, ink: inkRgb, paper: paperRgb, inkCss: inkCss, paperCss: paperCss, css: css, isDark: isDark,
    seedOf: seedOf, rng: function (seed) { return EP.engine.rng(seedOf(seed)); }, noise: function (seed) { return EP.engine.noise8(seedOf(seed)); }, setAttr: setAttr,
    runner: runner, range: range, toggle: toggle, select: select, text: text,
    /* demande à l'interface de passer à un autre système, avec un seed et des réglages (planche contact) */
    pick: function (o) { if (doc) doc.dispatchEvent(new CustomEvent("bggen:pick", { detail: o })); },
    get host() { return BgGen.hostEl || (doc && doc.querySelector(".gen__layer")); }
  };

  /* Monte un système sans le panneau : un seul fond par page. host reçoit le canevas (classe gen__layer conseillée).
     o : type (id du registre, "stream" par défaut), seed, params (réglages partiels), intensity (0,1 à 1), live (animation). */
  BgGen.mount = function (host, o) {
    o = o || {};
    var T = BgGen.types[o.type || "stream"];
    if (!T) throw new Error("BgGen.mount : système inconnu « " + o.type + " »");
    var S = { type: T.id, seed: o.seed == null ? "9" : String(o.seed), live: o.live !== false, intensity: o.intensity == null ? T.int : o.intensity, p: {} };
    T.params.forEach(function (d) { S.p[d.k] = o.params && d.k in o.params ? o.params[d.k] : d.v; });
    BgGen.hostEl = host;
    host.style.opacity = S.intensity;
    var m = T.mount(S, BgGen.api);
    return {
      state: function () { return S; },
      update: function (n) {
        n = n || {};
        if (n.seed != null) S.seed = String(n.seed);
        if (n.live != null) S.live = !!n.live;
        if (n.intensity != null) { S.intensity = n.intensity; host.style.opacity = S.intensity; }
        if (n.params) Object.keys(n.params).forEach(function (k) { if (k in S.p) S.p[k] = n.params[k]; });
        m.update(S);
      },
      code: function () { return T.code(S); },
      toSVG: m.toSVG ? function () { return m.toSVG(); } : null,
      destroy: function () { m.destroy(); if (BgGen.hostEl === host) BgGen.hostEl = null; }
    };
  };

  window.BgGen = BgGen;
})();

/* ---- gen-types/builtin.js */
/* Systèmes de base du générateur : ceux que sert le design system (flux, champ, rubans, Voronoï, Lorenz, guilloché)
   et quatre planches du kit portées en canevas plein cadre (Clifford, moiré, demi-teintes, harmonographe). */
(function () {
  "use strict";
  var A = BgGen.api, EP = A.EP, doc = document, TAU = A.TAU, clamp = A.clamp, smooth = A.smooth, inkRgb = A.ink, inkCss = A.inkCss, seedOf = A.seedOf, setAttr = A.setAttr, runner = A.runner;
  var range = BgGen.range, toggle = BgGen.toggle;
  var TYPES = {};

  /* 29 : fond de page, des particules qui contournent un disque */
  TYPES.stream = {
    kit: "29", group: "Flux et attracteurs", label: "Flux autour d'un disque", note: "Particules et traînées, un disque immobile. Le fond de la planche 29.",
    params: [range("particles", "Particules (0 : auto)", 0, 2400, 50, 0, "", false), range("speed", "Vitesse", 0.3, 3, 0.05, 1.05), range("trail", "Traînée", 12, 120, 2, 64, "", false),
      toggle("disc", "Disque", true), range("dx", "Disque : x", 0, 1, 0.01, 0.8), range("dy", "Disque : y", 0, 1, 0.01, 0.22), range("dr", "Disque : rayon", 0.04, 0.3, 0.005, 0.1),
      toggle("solid", "Fond plein (poster)", false)],
    mount: function (S, api) {
      var e = doc.createElement("ep-flow-bg"); e.setAttribute("fill", "");
      function sync(S) {
        var p = S.p;
        setAttr(e, "seed", S.seed); setAttr(e, "tone", p.solid ? "poster" : "paper"); setAttr(e, "particles", p.particles > 0 ? p.particles : "");
        setAttr(e, "speed", p.speed); setAttr(e, "trail", p.trail); setAttr(e, "disc", p.disc ? p.dx + "," + p.dy + "," + p.dr : "none"); setAttr(e, "animate", S.live ? "live" : "none");
      }
      /* attributs posés avant l'insertion : posés après, chacun relançait la construction (et le préroulage) de l'élément */
      sync(S); api.host.appendChild(e);
      return { el: e, update: sync, destroy: function () { e.remove(); }, toSVG: function () { return e.toSVG(); } };
    },
    code: function (S) {
      var p = S.p; return '<ep-flow-bg fill tone="' + (p.solid ? "poster" : "paper") + '" seed="' + S.seed + '"' + (p.particles > 0 ? ' particles="' + p.particles + '"' : "") + ' speed="' + p.speed + '" trail="' + p.trail + '" disc="' + (p.disc ? p.dx + "," + p.dy + "," + p.dr : "none") + '" animate="' + (S.live ? "live" : "none") + '"></ep-flow-bg>';
    }
  };

  /* 01 et 02 : champ de flux et rubans (même élément, deux modes) */
  function fieldType(mode) {
    var ribbons = mode === "ribbons";
    return {
      kit: ribbons ? "02" : "01", group: "Flux et attracteurs", label: ribbons ? "Rubans" : "Champ de flux", heavy: true, noAuto: true,
      note: ribbons ? "Des fils animés qui partent des bords et se déforment. La planche 02." : "Des milliers de courbes qui suivent un champ d'angles et s'arrêtent avant de se toucher. La planche 01.",
      params: [range("density", "Densité", 0.3, 2.5, 0.05, ribbons ? 0.7 : 1), range("scale", "Taille des tourbillons", 0.4, 3, 0.05, 1), range("sep", "Écart des lignes", 3, 14, 0.5, 5),
        range("hole", "Disque vide", 0, 0.6, 0.01, 0), range("warp", "Déformation", 0, 2.5, 0.05, 1), range("weight", "Épaisseur du trait", 0.4, 2.2, 0.05, 1)],
      mount: function (S, api) {
        var e = doc.createElement("ep-flow-field"); e.setAttribute("fill", ""); e.setAttribute("mode", mode);
        function sync(S) {
          var p = S.p, base = 0.0034 * 600 / Math.max(api.host.clientWidth || 600, 300);
          setAttr(e, "seed", S.seed); setAttr(e, "density", p.density); setAttr(e, "scale", +(base * p.scale).toFixed(6)); setAttr(e, "sep", p.sep);
          setAttr(e, "hole", p.hole || ""); setAttr(e, "warp", p.warp); setAttr(e, "weight", p.weight); setAttr(e, "animate", S.live ? "draw" : "none");
        }
        sync(S); api.host.appendChild(e);
        return { el: e, update: sync, destroy: function () { e.remove(); }, toSVG: function () { return e.toSVG(); } };
      },
      code: function (S) {
        var p = S.p; return '<ep-flow-field fill mode="' + mode + '" seed="' + S.seed + '" density="' + p.density + '" scale="' + +(0.0034 * 600 / 1200 * p.scale).toFixed(6) + '" sep="' + p.sep + '"' + (p.hole ? ' hole="' + p.hole + '"' : "") + ' warp="' + p.warp + '" weight="' + p.weight + '" animate="' + (S.live ? "draw" : "none") + '"></ep-flow-field>';
      }
    };
  }
  TYPES.field = fieldType("field");
  TYPES.ribbons = fieldType("ribbons");

  /* 09 : Voronoï */
  TYPES.voronoi = {
    kit: "09", group: "Croissance et cellules", label: "Voronoï", heavy: true, noAuto: true, note: "Des cellules qui s'égalisent par relaxation de Lloyd. Les planches 09 et 30.",
    params: [range("cells", "Cellules", 12, 240, 2, 60), toggle("dots", "Afficher les graines", false)],
    mount: function (S, api) {
      var e = doc.createElement("ep-voronoi"); e.setAttribute("fill", "");
      function sync(S) { var p = S.p; setAttr(e, "seed", S.seed); setAttr(e, "cells", p.cells); if (p.dots) { if (!e.hasAttribute("dots")) e.setAttribute("dots", ""); } else e.removeAttribute("dots"); setAttr(e, "animate", S.live ? "relax" : "none"); }
      sync(S); api.host.appendChild(e);
      return { el: e, update: sync, destroy: function () { e.remove(); }, toSVG: function () { return e.toSVG(); } };
    },
    code: function (S) { var p = S.p; return '<ep-voronoi fill seed="' + S.seed + '" cells="' + p.cells + '"' + (p.dots ? " dots" : "") + ' animate="' + (S.live ? "relax" : "none") + '"></ep-voronoi>'; }
  };

  /* 03 : attracteur de Clifford, des millions de points accumulés puis effacés par fondu */
  TYPES.clifford = {
    kit: "03", group: "Flux et attracteurs", label: "Attracteur de Clifford", note: "x' = sin(a y) + c cos(a x), y' = sin(b x) + d cos(b y), accumulé en densité. La planche 03.",
    params: [range("a", "a", -2.4, 2.4, 0.01, -1.4, "", 0.1), range("b", "b", -2.4, 2.4, 0.01, 1.6, "", 0.1), range("c", "c", -2, 2, 0.01, 1.0, "", 0.1), range("d", "d", -2, 2, 0.01, 0.7, "", 0.1),
      range("drift", "Dérive des paramètres", 0, 2, 0.05, 1), range("points", "Points par image (milliers)", 10, 160, 5, 60), range("decay", "Persistance", 0.7, 0.97, 0.01, 0.86), range("zoom", "Zoom", 0.5, 2.6, 0.05, 1.4)],
    mount: function (S, api) {
      var cur = S, grid, img, px, x, y, W, H, lm = Math.log(35), rgb = inkRgb(), r;
      function reset() {
        var q = EP.engine.rng(seedOf(cur.seed)); x = 0.1 + q() * 0.2; y = 0.1 + q() * 0.2; if (grid) grid.fill(0);
      }
      function setup(rr) {
        W = rr.cv.width; H = rr.cv.height; grid = new Float32Array(W * H); img = rr.ctx.createImageData(W, H); px = img.data; rgb = inkRgb();
        for (var i = 0; i < W * H; i++) { px[i * 4] = rgb[0]; px[i * 4 + 1] = rgb[1]; px[i * 4 + 2] = rgb[2]; }
        reset();
      }
      r = runner(api.host, {
        scale: 0.5, maxDpr: 1, resize: setup,
        frame: function (rr) {
          var p = cur.p, t = rr.t, a = p.a + 0.22 * p.drift * Math.sin(t * 0.13), b = p.b + 0.18 * p.drift * Math.sin(t * 0.17 + 1), c = p.c + 0.22 * p.drift * Math.sin(t * 0.11 + 2), d = p.d + 0.18 * p.drift * Math.sin(t * 0.19 + 3);
          var sc = Math.min(W, H) / 4.2 * p.zoom, N = p.points * 1000, j, nx, ny, gx, gy, g, dec = p.decay, cx = W / 2, cy = H / 2;
          for (j = 0; j < N; j++) {
            nx = Math.sin(a * y) + c * Math.cos(a * x); ny = Math.sin(b * x) + d * Math.cos(b * y); x = nx; y = ny;
            gx = (x * sc + cx) | 0; gy = (y * sc + cy) | 0;
            if (gx >= 0 && gx < W && gy >= 0 && gy < H) grid[gy * W + gx]++;
          }
          for (j = 0; j < W * H; j++) { g = grid[j] * dec; grid[j] = g; px[j * 4 + 3] = g < 0.05 ? 0 : Math.pow(Math.min(1, Math.log(1 + g) / lm), 0.85) * 255; }
          rr.ctx.putImageData(img, 0, 0);
        },
        redraw: function (rr) { rgb = inkRgb(); for (var i = 0; i < W * H; i++) { px[i * 4] = rgb[0]; px[i * 4 + 1] = rgb[1]; px[i * 4 + 2] = rgb[2]; } }
      });
      r.speed = 1;
      return { update: function (S) { var seedChanged = S.seed !== cur.seed; cur = S; r.paused = !S.live; r.dirty = true; if (seedChanged) reset(); }, destroy: r.destroy, recolor: r.redraw, png: function () { return r.cv; } };
    },
    code: function (S) { return JSON.stringify({ systeme: "clifford", planche: 3, seed: S.seed, params: S.p }); }
  };

  /* 04 : attracteur de Lorenz, tracé par le moteur du design system, qui tourne lentement */
  TYPES.lorenz = {
    kit: "04", group: "Flux et attracteurs", label: "Attracteur de Lorenz", note: "Trois équations, deux ailes : une seule ligne, projetée en deux dimensions. La planche 04.",
    params: [range("points", "Points", 2000, 22000, 500, 9000, "", false), range("rot", "Rotation", 0, 6.28, 0.02, 0.6), range("spin", "Vitesse de rotation", 0, 1, 0.01, 0.12), range("weight", "Épaisseur du trait", 0.4, 2.4, 0.05, 1), range("zoom", "Zoom", 0.6, 2.4, 0.05, 1.3)],
    mount: function (S, api) {
      var cur = S, r, lastKey = "", lines = null, lastRot = null;
      r = runner(api.host, {
        maxDpr: 1.5,
        frame: function (rr) {
          var p = cur.p, rot = p.rot + rr.t * p.spin, ctx = rr.ctx, i, j, L;
          lines = EP.engine.lorenzLine({ w: rr.w, h: rr.h, points: p.points, rotation: rot, seed: cur.seed }); lastRot = rot;
          ctx.setTransform(rr.k, 0, 0, rr.k, 0, 0); ctx.clearRect(0, 0, rr.w, rr.h);
          ctx.translate(rr.w / 2, rr.h / 2); ctx.scale(p.zoom, p.zoom); ctx.translate(-rr.w / 2, -rr.h / 2);
          ctx.strokeStyle = inkCss(0.75); ctx.lineWidth = p.weight / p.zoom; ctx.lineCap = "round"; ctx.lineJoin = "round";
          for (i = 0; i < lines.length; i++) { L = lines[i]; if (!L.length) continue; ctx.beginPath(); ctx.moveTo(L[0][0], L[0][1]); for (j = 1; j < L.length; j++) ctx.lineTo(L[j][0], L[j][1]); ctx.stroke(); }
        }
      });
      return {
        update: function (S) { cur = S; r.paused = !S.live; r.dirty = true; },
        destroy: r.destroy, png: function () { return r.cv; },
        toSVG: function () { var p = cur.p; return EP.svg.fromLines(EP.engine.lorenzLine({ w: r.w, h: r.h, points: p.points, rotation: lastRot == null ? p.rot : lastRot, seed: cur.seed }), { w: r.w, h: r.h, weight: p.weight, label: "Attracteur de Lorenz" }); }
      };
    },
    code: function (S) { return JSON.stringify({ systeme: "lorenz", planche: 4, seed: S.seed, params: S.p }); }
  };

  /* 21 : guilloché, des rosettes d'épitrochoïdes qui pivotent */
  TYPES.guilloche = {
    kit: "21", group: "Motifs et ondes", label: "Guilloché", note: "Des rosettes d'épitrochoïdes, comme sur un billet. La planche 21.",
    params: [range("bands", "Bandes", 2, 16, 1, 8, "", false), range("weight", "Épaisseur du trait", 0.3, 2, 0.05, 0.9), range("zoom", "Zoom", 0.8, 3.2, 0.05, 1.6), range("spin", "Rotation", 0, 1, 0.01, 0.2)],
    mount: function (S, api) {
      var cur = S, r, lines = [], key = "";
      function build(rr) { key = [cur.seed, cur.p.bands, rr.w, rr.h].join("|"); lines = EP.engine.guillocheLines({ w: rr.w, h: rr.h, bands: cur.p.bands, seed: cur.seed }); }
      r = runner(api.host, {
        maxDpr: 1.5, resize: function (rr) { build(rr); },
        frame: function (rr) {
          var p = cur.p, ctx = rr.ctx, i, j, L;
          if (key !== [cur.seed, p.bands, rr.w, rr.h].join("|")) build(rr);
          ctx.setTransform(rr.k, 0, 0, rr.k, 0, 0); ctx.clearRect(0, 0, rr.w, rr.h);
          ctx.translate(rr.w / 2, rr.h / 2); ctx.rotate(rr.t * p.spin * 0.1); ctx.scale(p.zoom, p.zoom); ctx.translate(-rr.w / 2, -rr.h / 2);
          ctx.strokeStyle = inkCss(0.8); ctx.lineWidth = p.weight / p.zoom; ctx.lineCap = "round"; ctx.lineJoin = "round";
          ctx.beginPath();
          for (i = 0; i < lines.length; i++) { L = lines[i]; if (!L.length) continue; ctx.moveTo(L[0][0], L[0][1]); for (j = 1; j < L.length; j++) ctx.lineTo(L[j][0], L[j][1]); }
          ctx.stroke();
        }
      });
      return {
        update: function (S) { cur = S; r.paused = !S.live; r.dirty = true; },
        destroy: r.destroy, png: function () { return r.cv; },
        toSVG: function () { return EP.svg.fromLines(lines, { w: r.w, h: r.h, weight: cur.p.weight, label: "Guilloché" }); }
      };
    },
    code: function (S) { return JSON.stringify({ systeme: "guilloche", planche: 21, seed: S.seed, params: S.p }); }
  };

  /* 18 : moiré, deux jeux d'anneaux presque identiques dont le décalage fait naître des franges */
  TYPES.moire = {
    kit: "18", group: "Motifs et ondes", label: "Moiré", note: "Deux jeux d'anneaux presque identiques : les franges naissent de leur écart. La planche 18.",
    params: [range("pitch", "Pas des anneaux", 4, 22, 0.25, 8, "", 0.3), range("amp", "Amplitude du décalage", 0, 140, 1, 44, "", 0.5), range("beat", "Écart de pas", 0, 0.08, 0.002, 0.018), range("weight", "Épaisseur du trait", 0.6, 3, 0.05, 1.4), range("speed", "Vitesse", 0, 3, 0.05, 1)],
    mount: function (S, api) {
      var cur = S, r;
      function rings(ctx, ox, oy, gap, R) { var q; ctx.beginPath(); for (q = gap; q < R; q += gap) { ctx.moveTo(ox + q, oy); ctx.arc(ox, oy, q, 0, TAU); } ctx.stroke(); }
      r = runner(api.host, {
        maxDpr: 1.25,
        frame: function (rr) {
          var p = cur.p, ctx = rr.ctx, t = rr.t * p.speed, cx = rr.w / 2, cy = rr.h / 2, ox = p.amp * Math.cos(t * 0.33), oy = p.amp * 0.65 * Math.sin(t * 0.47), g2 = p.pitch * (1 + p.beat * Math.sin(t * 0.21)), R = Math.hypot(rr.w, rr.h) / 2 + p.amp * 2;
          ctx.setTransform(rr.k, 0, 0, rr.k, 0, 0); ctx.clearRect(0, 0, rr.w, rr.h);
          ctx.strokeStyle = inkCss(0.85); ctx.lineWidth = p.weight;
          rings(ctx, cx - ox, cy - oy, p.pitch, R); rings(ctx, cx + ox, cy + oy, g2, R);
        }
      });
      return { update: function (S) { cur = S; r.paused = !S.live; r.dirty = true; }, destroy: r.destroy, png: function () { return r.cv; } };
    },
    code: function (S) { return JSON.stringify({ systeme: "moire", planche: 18, seed: S.seed, params: S.p }); }
  };

  /* 19 : demi-teintes, une sphère éclairée par une lumière qui tourne, rendue en points sur une trame à 45° */
  TYPES.halftone = {
    kit: "19", group: "Motifs et ondes", label: "Demi-teintes", note: "Une trame à 45° dont les points grossissent dans l'ombre. La planche 19.",
    params: [range("spacing", "Pas de la trame", 6, 18, 0.5, 10, "", 0.5), range("size", "Rayon de la sphère", 0.14, 0.5, 0.01, 0.3), range("px", "Position x", 0, 1, 0.01, 0.72), range("py", "Position y", 0, 1, 0.01, 0.42), range("light", "Vitesse de la lumière", 0, 2, 0.05, 0.45)],
    mount: function (S, api) {
      var cur = S, r, ca = Math.SQRT1_2;
      r = runner(api.host, {
        maxDpr: 1,
        frame: function (rr) {
          var p = cur.p, ctx = rr.ctx, W = rr.w, H = rr.h, s = p.spacing, SR = Math.min(W, H) * p.size, sx = W * p.px, sy = H * p.py, th = rr.t * p.light;
          var Lx = Math.cos(th) * 0.75, Ly = -0.5 + 0.22 * Math.sin(rr.t * 0.3 * p.light), Lz = 0.6, ll = Math.hypot(Lx, Ly, Lz), R = Math.ceil(Math.hypot(W, H) / (2 * ca * s)) + 2;
          var shX = sx + 40 - Lx * 70, shY = sy + SR * 1.12, i, j, x, y, dx, dy, d2, dark, z, nx, ny, nz, lam, lum, q, rad;
          Lx /= ll; Ly /= ll; Lz /= ll;
          ctx.setTransform(rr.k, 0, 0, rr.k, 0, 0); ctx.clearRect(0, 0, W, H); ctx.fillStyle = inkCss(0.9); ctx.beginPath();
          for (i = -R; i <= R; i++) for (j = -R; j <= R; j++) {
            x = W / 2 + (i - j) * ca * s; y = H / 2 + (i + j) * ca * s;
            if (x < -s || y < -s || x > W + s || y > H + s) continue;
            dx = x - sx; dy = y - sy; d2 = dx * dx + dy * dy; dark = 0;
            if (d2 < SR * SR) {
              z = Math.sqrt(SR * SR - d2); nx = dx / SR; ny = dy / SR; nz = z / SR; lam = Math.max(0, nx * Lx + ny * Ly + nz * Lz);
              lum = 0.06 + 0.94 * Math.pow(lam, 1.15) + 0.14 * Math.pow(Math.max(0, -nx * Lx - ny * Ly), 2) * (1 - nz); dark = 1 - clamp(lum, 0, 1);
            } else {
              q = Math.pow((x - shX) / (SR * 1.15), 2) + Math.pow((y - shY) / (SR * 0.16), 2);
              if (q < 1) dark = 0.82 * Math.pow(1 - q, 1.4);
            }
            if (dark <= 0.02) continue;
            rad = s * 0.74 * Math.sqrt(dark); if (rad < 0.4) continue;
            ctx.moveTo(x + rad, y); ctx.arc(x, y, rad, 0, TAU);
          }
          ctx.fill();
        }
      });
      return { update: function (S) { cur = S; r.paused = !S.live; r.dirty = true; }, destroy: r.destroy, png: function () { return r.cv; } };
    },
    code: function (S) { return JSON.stringify({ systeme: "demi-teintes", planche: 19, seed: S.seed, params: S.p }); }
  };

  /* 20 : harmonographe, un stylo suspendu à deux pendules qui s'amortissent */
  TYPES.harmonograph = {
    kit: "20", group: "Motifs et ondes", label: "Harmonographe", note: "Deux pendules amortis tracent une courbe qui se resserre jusqu'au repos. La planche 20.",
    params: [range("ratio", "Rapport (0 à 4 : 2:3 à 5:6)", 0, 4, 1, 2, "", false), range("damp", "Amortissement", 0.002, 0.014, 0.0002, 0.0042, "", false), range("steps", "Points par image", 30, 400, 10, 130), range("weight", "Épaisseur du trait", 0.4, 2, 0.05, 0.8), toggle("loop", "Recommencer", true)],
    mount: function (S, api) {
      var cur = S, r, P, T, state, hold, rand, ratios = [[2, 3], [3, 4], [3, 5], [4, 5], [5, 6]];
      function params(rr) {
        var q = ratios[clamp(Math.round(cur.p.ratio), 0, 4)], sw = rand() < 0.5, dm = cur.p.damp, v = function () { return dm * (0.9 + 0.3 * rand()); };
        return { f: [q[0] + (rand() - 0.5) * 0.01, q[1] + (rand() - 0.5) * 0.012, q[sw ? 1 : 0] * (1 + 0.002 * (rand() - 0.5)), q[sw ? 0 : 1] * (1 + 0.002 * (rand() - 0.5))], p: [rand() * TAU, rand() * TAU, rand() * TAU, rand() * TAU], d: [v(), v(), v(), v()] };
      }
      function pos(rr, T) {
        var e = function (i) { return Math.exp(-P.d[i] * T); };
        return [rr.w / 2 + rr.w * 0.44 * (0.55 * Math.sin(P.f[0] * T + P.p[0]) * e(0) + 0.45 * Math.sin(P.f[1] * T + P.p[1]) * e(1)), rr.h / 2 + rr.h * 0.44 * (0.55 * Math.sin(P.f[2] * T + P.p[2]) * e(2) + 0.45 * Math.sin(P.f[3] * T + P.p[3]) * e(3))];
      }
      function fresh(rr) { rand = rand || EP.engine.rng(seedOf(cur.seed)); P = params(rr); T = 0; state = "draw"; hold = 0; rr.ctx.setTransform(1, 0, 0, 1, 0, 0); rr.ctx.clearRect(0, 0, rr.cv.width, rr.cv.height); }
      r = runner(api.host, {
        maxDpr: 1.5, resize: function (rr) { rand = EP.engine.rng(seedOf(cur.seed)); fresh(rr); },
        frame: function (rr) {
          var p = cur.p, ctx = rr.ctx, k, q, a, lim = Math.exp(-p.damp * T);
          ctx.setTransform(rr.k, 0, 0, rr.k, 0, 0);
          if (state === "draw") {
            ctx.strokeStyle = inkCss(0.6); ctx.lineWidth = p.weight; ctx.lineCap = "round"; ctx.beginPath(); a = pos(rr, T); ctx.moveTo(a[0], a[1]);
            for (k = 0; k < p.steps; k++) { T += 0.006; q = pos(rr, T); ctx.lineTo(q[0], q[1]); }
            ctx.stroke(); if (lim < 0.07) { state = "hold"; hold = 150; }
          } else if (state === "hold") { if (!p.loop) return; if (--hold <= 0) { state = "fade"; hold = 70; } }
          else { ctx.globalCompositeOperation = "destination-out"; ctx.fillStyle = "rgba(0,0,0,.07)"; ctx.fillRect(0, 0, rr.w, rr.h); ctx.globalCompositeOperation = "source-over"; if (--hold <= 0) fresh(rr); }
        }
      });
      return {
        update: function (S) { var redo = S.seed !== cur.seed || S.p.ratio !== cur.p.ratio || Math.abs(S.p.damp - cur.p.damp) > 1e-9; cur = S; r.paused = !S.live; r.dirty = true; if (redo) { rand = EP.engine.rng(seedOf(cur.seed)); fresh(r); } },
        destroy: r.destroy, png: function () { return r.cv; }
      };
    },
    code: function (S) { return JSON.stringify({ systeme: "harmonographe", planche: 20, seed: S.seed, params: S.p }); }
  };

  /* ------------------------------------------------------------------- état */

  var INT = { stream: 0.9, field: 0.55, ribbons: 0.75, voronoi: 0.5, clifford: 1, lorenz: 0.85, moire: 0.45, halftone: 0.85, harmonograph: 1, guilloche: 0.9 };
  /* element : le système est un élément personnalisé du design system, sans canevas à surveiller : le banc d'essai ne le teste pas */
  Object.keys(TYPES).forEach(function (id) { var T = TYPES[id]; T.id = id; T.int = INT[id]; T.element = ["stream", "field", "ribbons", "voronoi"].indexOf(id) >= 0; BgGen.register(T); });
})();

/* ---- gen-types/rd.js */
/* Réaction-diffusion : les planches 05 et 06 du kit, en canevas plein cadre.
   Le modèle de Gray-Scott : deux produits chimiques sur une grille (U se consomme, V est l'encre). Le côté court du cadre compte
   de 90 à 160 cellules (140 par défaut), le dessin est le champ V lu par interpolation bilinéaire lissée, converti en alpha d'encre,
   avec un fondu aux bords du cadre. Le canevas est transparent : la page se voit à travers. */
(function () {
  "use strict";
  var A = BgGen.api, clamp = A.clamp, smooth = A.smooth, runner = A.runner;
  var range = BgGen.range, toggle = BgGen.toggle;

  var GROW = 2850;        /* itérations d'une croissance complète de la planche 05 : 1,5 fois celles du kit (1 900), car la pousse doit combler tout le cadre jusqu'aux bords */
  var MATURE2 = 330;      /* avances (de 8 itérations chacune) qui mènent la planche 06 à son image figée */
  var CELLS_MAX = 62000;  /* plafond de cellules de la planche 05, quel que soit le format */
  var CELLS_MAX2 = 40000; /* plafond de la planche 06 : sa recette par cellule rend chaque itération plus chère */
  var BUDGET = 12;        /* millisecondes par image pour rattraper la simulation (pause, redimensionnement) */
  var LIVE_MS = 7;        /* millisecondes par image au plus pour la simulation en direct : au-delà, c'est la simulation qui ralentit, pas l'affichage */
  var MAX_ADV = 2;        /* avances de la planche 06 par image au plus */
  var A0 = 0.9;           /* opacité maximale de l'encre, comme api.inkCss(0.9) */
  var LN = 1023, VMAX = 0.5, LK = LN / VMAX;
  function now() { return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now(); }

  /* --------------------------------------------------------- zone de vie */
  /* Gray-Scott ne dessine quelque chose que dans une bande étroite du plan (alimentation, mortalité) : au-dessus de la limite
     sqrt(f) / 2 - f le motif s'éteint, trop en dessous la grille se remplit d'un aplat. Pour qu'une variation automatique des deux
     réglages ne vide pas le fond, la mortalité est ramenée dans cette bande (mesurée par essais sur la simulation). La bande se
     referme quand l'alimentation monte : au-dessus d'environ 0,05 plus rien ne vit. Une graine de rayon 3 (planche 06) est plus fragile
     qu'une graine de rayon 4 (planche 05), d'où deux bandes : hiOff pour la 05, hiOff2 et fCap pour la 06. */
  var LO = -0.001, FMAX = 0.056;
  function crit(f) { return Math.sqrt(f) * 0.5 - f; }
  function hiOff(f) { return 0.005 - 0.21 * (f - 0.03); }
  /* planche 06 : limite haute de l'écart de mortalité (mesurée : le motif tient jusqu'à 0,006 vers f = 0,036, 0,0035 vers 0,044, 0,002 vers 0,046
     et plus du tout au-dessus de 0,05) ; et alimentation plafonnée en douceur : identique au kit jusqu'à 0,044, puis tend vers 0,046 */
  function hiOff2(f) { return 0.0055 - 0.28 * (f - 0.03); }
  var FKNEE = 0.044, FTOP = 0.046;
  function fCap(f) { return f <= FKNEE ? f : FKNEE + (FTOP - FKNEE) * Math.tanh((f - FKNEE) / (FTOP - FKNEE)); }

  /* ------------------------------------------------------------- grille */
  function makeGrid(w, h, cells, max) {
    var cell = Math.min(w, h) / cells, gw = Math.round(w / cell), gh = Math.round(h / cell), c, n;
    if (gw * gh > max) { c = Math.sqrt(gw * gh / max); gw = Math.round(gw / c); gh = Math.round(gh / c); }
    gw = Math.max(24, gw); gh = Math.max(24, gh); n = gw * gh;
    return { gw: gw, gh: gh, n: n, U: new Float32Array(n).fill(1), V: new Float32Array(n), U2: new Float32Array(n).fill(1), V2: new Float32Array(n), Fm: null, Km: null };
  }
  function clearGrid(g) { g.U.fill(1); g.V.fill(0); g.U2.fill(1); g.V2.fill(0); }
  function mass(g) { var V = g.V, s = 0, i; for (i = 0; i < V.length; i++) s += V[i]; return s; }

  /* count itérations de Gray-Scott (le noyau du kit : voisinage à 9 points, mêmes résultats au bit près). Si g.Fm existe, alimentation et
     mortalité sont lues par cellule (F et K sont alors ignorés). Une fenêtre glissante par ligne évite de relire 6 voisins sur 9. */
  function iterate(g, count, F, K) {
    var gw = g.gw, gh = g.gh, a = g.U, b = g.V, a2 = g.U2, b2 = g.V2, Fm = g.Fm, Km = g.Km, s, j, i, idx, up, dn, t, e;
    var u00, u01, u02, u10, u11, u12, u20, u21, u22, v00, v01, v02, v10, v11, v12, v20, v21, v22, lu, lv, uvv, f, k;
    for (s = 0; s < count; s++) {
      for (j = 1; j < gh - 1; j++) {
        idx = j * gw; up = idx - gw; dn = idx + gw; e = gw - 1;
        u00 = a[up]; u01 = a[up + 1]; u10 = a[idx]; u11 = a[idx + 1]; u20 = a[dn]; u21 = a[dn + 1];
        v00 = b[up]; v01 = b[up + 1]; v10 = b[idx]; v11 = b[idx + 1]; v20 = b[dn]; v21 = b[dn + 1];
        for (i = 1; i < e; i++) {
          u02 = a[up + i + 1]; u12 = a[idx + i + 1]; u22 = a[dn + i + 1]; v02 = b[up + i + 1]; v12 = b[idx + i + 1]; v22 = b[dn + i + 1];
          lu = -u11 + 0.2 * (u10 + u12 + u01 + u21) + 0.05 * (u00 + u02 + u20 + u22);
          lv = -v11 + 0.2 * (v10 + v12 + v01 + v21) + 0.05 * (v00 + v02 + v20 + v22);
          uvv = u11 * v11 * v11;
          if (Fm) { f = Fm[idx + i]; k = Km[idx + i]; } else { f = F; k = K; }
          a2[idx + i] = u11 + lu - uvv + f * (1 - u11);
          b2[idx + i] = v11 + 0.5 * lv + uvv - (f + k) * v11;
          u00 = u01; u01 = u02; u10 = u11; u11 = u12; u20 = u21; u21 = u22;
          v00 = v01; v01 = v02; v10 = v11; v11 = v12; v20 = v21; v21 = v22;
        }
      }
      mirror(a2, gw, gh); mirror(b2, gw, gh);
      t = a; a = a2; a2 = t; t = b; b = b2; b2 = t;
    }
    g.U = a; g.V = b; g.U2 = a2; g.V2 = b2;
  }
  /* bord réfléchissant : la rangée extérieure recopie la rangée voisine. Le kit fixe cette rangée (U = 1, V = 0), ce qui absorbe V et fait
     naître un cadre d'encre le long du bord ; ici le motif se prolonge au contraire jusqu'au bord, comme une fenêtre sur une feuille plus grande. */
  function mirror(m, gw, gh) {
    var i, j, last = (gh - 1) * gw;
    for (i = 1; i < gw - 1; i++) { m[i] = m[gw + i]; m[last + i] = m[last - gw + i]; }
    for (j = 0; j < gh; j++) { m[j * gw] = m[j * gw + 1]; m[j * gw + gw - 1] = m[j * gw + gw - 2]; }
  }

  /* une pastille de produit V (valeur v) sur un fond de produit U : le germe d'une pousse */
  function dab(g, cx, cy, r, v) {
    var ii, jj, x, y, kk, gw = g.gw, gh = g.gh;
    for (jj = -r; jj <= r; jj++) for (ii = -r; ii <= r; ii++) {
      if (ii * ii + jj * jj > r * r) continue;
      x = (cx + ii) | 0; y = (cy + jj) | 0; if (x < 2 || y < 2 || x > gw - 3 || y > gh - 3) continue;
      kk = y * gw + x; g.U[kk] = 0.5; g.V[kk] = v;
    }
  }
  /* n germes de rayon r, répartis (échantillonnage par meilleur candidat : pour chaque germe on tire 40 positions dans le cadre, marge m des bords,
     et on garde celle qui est la plus loin des germes déjà posés). Le kit tire ses germes sur une planche sans contrainte ; ici une grande plage
     sans germe ne laisserait qu'un trou dans le fond, car la croissance a une portée limitée. */
  function scatter(g, q, n, r, m, v) {
    var iw = g.gw - 2 * m, ih = g.gh - 2 * m, X = new Float32Array(n), Y = new Float32Array(n), i, j, c, bx = 0, by = 0, bd, x, y, d, e;
    for (i = 0; i < n; i++) {
      bd = -1;
      for (c = 0; c < 40; c++) {
        x = m + q() * iw; y = m + q() * ih; d = 1e9;
        for (j = 0; j < i; j++) { e = (x - X[j]) * (x - X[j]) + (y - Y[j]) * (y - Y[j]); if (e < d) d = e; }
        if (d > bd) { bd = d; bx = x; by = y; }
      }
      X[i] = bx; Y[i] = by; dab(g, bx, by, r, v);
    }
  }

  /* ------------------------------------------------------------- dessin */
  /* Tables par colonne et par ligne (pixel du canevas vers cellule de la grille, avec poids lissés), image d'encre et fondu des bords. */
  function makePaint(rr, g) {
    var W = rr.cv.width, H = rr.cv.height, sx = (g.gw - 1) / W, sy = (g.gh - 1) / H, x, y, gg, i, t, P;
    P = { W: W, H: H, img: rr.ctx.createImageData(W, H), xi: new Int32Array(W), xf: new Float32Array(W), ex: new Float32Array(W), yo: new Int32Array(H), yf: new Float32Array(H), ey: new Float32Array(H), m: -1 };
    P.px = P.img.data;
    for (x = 0; x < W; x++) { gg = x * sx; i = Math.min(g.gw - 2, gg | 0); t = gg - i; P.xi[x] = i; P.xf[x] = t * t * (3 - 2 * t); }
    for (y = 0; y < H; y++) { gg = y * sy; i = Math.min(g.gh - 2, gg | 0); t = gg - i; P.yo[y] = i * g.gw; P.yf[y] = t * t * (3 - 2 * t); }
    fillInk(P);
    return P;
  }
  function fillInk(P) {
    var c = A.ink(), px = P.px, n = P.W * P.H, i;
    for (i = 0; i < n; i++) { px[i * 4] = c[0]; px[i * 4 + 1] = c[1]; px[i * 4 + 2] = c[2]; }
  }
  /* m : largeur du fondu en pixels du canevas */
  function setEdge(P, m) {
    var x, y;
    if (Math.abs(m - P.m) < 1e-3) return;
    P.m = m;
    for (x = 0; x < P.W; x++) P.ex[x] = smooth(0, 1, Math.min(x, P.W - 1 - x) / m);
    for (y = 0; y < P.H; y++) P.ey[y] = smooth(0, 1, Math.min(y, P.H - 1 - y) / m);
  }
  /* alpha de l'encre selon V, tabulé : c est le seuil (le milieu de la transition) */
  function toneCoral(v, c) { return smooth(c - 0.03, c + 0.03, v) * (0.82 + 0.18 * smooth(c + 0.03, c + 0.14, v)); }
  function toneCoral2(v, c) { return Math.min(1, smooth(c - 0.03, c + 0.03, v) * (0.62 + 0.38 * smooth(c + 0.03, c + 0.18, v)) + 0.16 * smooth(c - 0.09, c - 0.03, v)); }
  function buildLut(lut, tone, c) { var i; for (i = 0; i <= LN; i++) lut[i] = tone(i / LK, c) * 255 * A0; }

  function paint(rr, g, P, lut, fade) {
    var px = P.px, V = g.V, gw = g.gw, W = P.W, H = P.H, xi = P.xi, xf = P.xf, ex = P.ex, x, y, o, fy, gy, ey, p, i0, fx, a, c, v, li, e;
    for (y = 0; y < H; y++) {
      o = P.yo[y]; fy = P.yf[y]; gy = 1 - fy; ey = P.ey[y]; p = y * W * 4 + 3;
      for (x = 0; x < W; x++, p += 4) {
        i0 = o + xi[x]; fx = xf[x];
        a = V[i0]; c = V[i0 + gw];
        v = (a + (V[i0 + 1] - a) * fx) * gy + (c + (V[i0 + gw + 1] - c) * fx) * fy;
        li = (v * LK + 0.5) | 0; if (li > LN) li = LN; else if (li < 0) li = 0;
        e = ex[x]; if (e > ey) e = ey;
        px[p] = lut[li] * e * fade;
      }
    }
    rr.ctx.putImageData(P.img, 0, 0);
  }

  /* échelle du canevas : environ 420 000 pixels, quelle que soit la taille de l'écran */
  function canvasScale(api) {
    var b = api.host.getBoundingClientRect();
    return clamp(Math.sqrt(420000 / Math.max(1, b.width * b.height)), 0.3, 1);
  }

  /* ============================================ 05 : réaction-diffusion */
  BgGen.register({
    id: "coral", kit: "05", group: "Croissance et cellules", label: "Réaction-diffusion",
    note: "Deux produits chimiques qui se nourrissent et s'effacent : le corail pousse depuis quelques graines, se fige, puis repart. La planche 05.",
    int: 0.4,
    params: [
      range("feed", "Alimentation", 0.025, FMAX, 0.0005, 0.055),
      range("kill", "Mortalité (0 : dense, 1 : clairsemé)", 0, 1, 0.01, 0.9),
      range("speed", "Vitesse de croissance", 1, 12, 0.5, 6),
      range("thr", "Épaisseur de l'encre", 0.1, 0.24, 0.005, 0.16),
      range("edge", "Fondu des bords (cellules)", 0, 24, 0.5, 9),
      range("cells", "Finesse (cellules sur le petit côté)", 90, 160, 5, 140, "", false),
      range("hold", "Durée du motif mûr (s)", 0, 20, 0.5, 3.3, "", false),
      toggle("loop", "Recommencer", true)
    ],
    mount: function (S, api) {
      var cur = S, g = null, P = null, lut = new Float32Array(LN + 1), lutC = -1, run = 1, iters = 0, state = "grow", holdT = 0, fade = 1, acc = 0, catchTo = 0, rev = 0, drawn = -1, lastM = -1, lastFade = -1, cellsUsed = 0, fc = 0, r;

      /* nouvelle croissance : des graines réparties au hasard (7 pour 18 000 cellules, comme le kit), toujours les mêmes pour un seed et un numéro de passage */
      function newRun(next) {
        if (next) run++;
        clearGrid(g);
        scatter(g, api.rng(cur.seed + "|coral|" + run), Math.max(3, Math.round(7 * g.n / 18000)), 4, Math.min(10, g.gw * 0.25, g.gh * 0.25), 0.25);
        iters = 0; state = "grow"; fade = 1; acc = 0; catchTo = 0; rev++;
      }
      /* (re)crée la grille et le dessin ; la croissance reprend vite jusqu'où elle en était */
      function build(rr) {
        var keep = state === "grow" ? iters : GROW;
        g = makeGrid(rr.w, rr.h, cur.p.cells, CELLS_MAX); cellsUsed = cur.p.cells; P = makePaint(rr, g); lutC = -1;
        newRun(false); catchTo = keep;
      }
      /* mortalité réelle : la position choisie (de 0 à 1) dans la zone où le motif vit, pour l'alimentation du moment */
      function killOf(p) { var f = clamp(p.feed, 0.02, FMAX); return crit(f) + LO + (hiOff(f) - LO) * clamp(p.kill, 0, 1); }
      function step(n) { if (n > 0) { iterate(g, n, cur.p.feed, killOf(cur.p)); iters += n; rev++; } }

      function frame(rr, dt) {
        var p = cur.p, k, n, quick, m, t0;
        if (p.cells !== cellsUsed) build(rr);
        if (state === "grow") {
          quick = rr.paused ? GROW : catchTo;
          if (iters < quick) { t0 = now(); do step(Math.min(4, quick - iters)); while (iters < quick && now() - t0 < BUDGET); if (rr.paused && iters < GROW) rr.dirty = true; }
          else if (!rr.paused) {
            acc += p.speed * Math.min(2, dt * 60); k = acc | 0; acc -= k; t0 = now();
            while (k > 0) { n = Math.min(4, k); step(n); k -= n; if (now() - t0 > LIVE_MS) break; }
          }
          if (iters >= GROW) { state = "hold"; holdT = p.hold; }
          else if (iters > 120 && (++fc & 15) === 0 && mass(g) < 1.5) newRun(true);
        } else if (state === "hold") {
          if (!rr.paused && p.loop) { holdT -= dt; if (holdT <= 0) state = "fade"; }
        } else if (!rr.paused) {
          fade -= dt * 1.8; if (fade <= 0) newRun(true); else rev++;
        } else { fade = 1; state = "hold"; holdT = p.hold; rev++; }
        /* dessin : seulement si quelque chose a changé */
        if (p.thr !== lutC) { buildLut(lut, toneCoral, p.thr); lutC = p.thr; drawn = -1; }
        m = Math.max(0.5, p.edge * P.W / g.gw); setEdge(P, m);
        if (drawn === rev && lastM === m && lastFade === fade) return;
        drawn = rev; lastM = m; lastFade = fade;
        paint(rr, g, P, lut, fade);
      }
      r = runner(api.host, {
        get scale() { return canvasScale(api); },   /* relue à chaque redimensionnement : le budget de pixels tient à toute taille */
        maxDpr: 1,
        resize: build,
        redraw: function () { if (P) { fillInk(P); drawn = -1; } },
        frame: frame
      });
      r.paused = !S.live;   /* monté à l'arrêt : la simulation ne tourne pas, l'image mûre est préparée à la première image */
      return {
        update: function (S) {
          var seedChanged = S.seed !== cur.seed;
          cur = S; r.paused = !S.live; r.dirty = true;
          if (seedChanged) { run = 1; newRun(false); }
        },
        destroy: r.destroy,
        recolor: function () { r.redraw(); },
        png: function () { return r.cv; }
      };
    },
    code: function (S) { return JSON.stringify({ systeme: "reaction-diffusion", planche: 5, seed: S.seed, params: S.p }); }
  });

  /* ======================================== 06 : réaction-diffusion II */
  BgGen.register({
    id: "coral2", kit: "06", group: "Croissance et cellules", label: "Réaction-diffusion II",
    note: "La recette change d'un point à l'autre de la feuille, et deux plumes sèment de nouvelles pousses sur leur passage. La planche 06.",
    int: 0.4,
    params: [
      range("feed", "Alimentation de base", 0.02, 0.045, 0.001, 0.028),
      range("spread", "Variation sur la feuille", 0, 0.03, 0.001, 0.016),
      range("kill", "Mortalité (écart à la limite)", -0.001, 0.005, 0.0002, 0.003),
      range("scale", "Taille des plages de recette", 0.4, 2.5, 0.05, 1),
      range("speed", "Vitesse", 2, 12, 0.5, 8),
      range("thr", "Épaisseur de l'encre", 0.08, 0.2, 0.005, 0.14),
      range("edge", "Fondu des bords (cellules)", 0, 24, 0.5, 8),
      range("cells", "Finesse (cellules sur le petit côté)", 90, 160, 5, 140, "", false)
    ],
    mount: function (S, api) {
      var cur = S, g = null, P = null, lut = new Float32Array(LN + 1), lutC = -1, rand, nF, nS, adv = 0, ts = 0, acc = 0, catchTo = 0, rev = 0, drawn = -1, lastM = -1, cellsUsed = 0, fc = 0, N0 = 9, run = 1, r;

      /* recette de la feuille : alimentation et mortalité par cellule, tirées d'un bruit lent. On ne rafraîchit qu'un seizième des lignes à chaque avance : les réglages bougent sans à-coup. */
      function recipeRows(j0, j1) {
        var p = cur.p, F0 = p.feed, spr = p.spread, off0 = p.kill, f1 = 0.04 * p.scale, f2 = 0.0625 * p.scale, gw = g.gw, cx = gw * 0.5, cy = g.gh * 0.5, i, j, k, f, off, hi;
        for (j = j0; j < j1; j++) for (i = 0; i < gw; i++) {
          f = fCap(F0 + spr * (0.5 + 0.5 * clamp(nF((i - cx) * f1 + 3.7 + ts * 0.03, (j - cy) * f1 + 1.3) * 1.7, -1, 1)));
          off = off0 - 0.2 * (f - F0) + 0.001 * clamp(nS((i - cx) * f2 + 40, (j - cy) * f2 - ts * 0.02) * 1.7, -1, 1);
          hi = hiOff2(f); off = off < LO ? LO : off > hi ? hi : off;
          k = j * gw + i; g.Fm[k] = f; g.Km[k] = crit(f) + off;
        }
      }
      function newSheet(next) {
        if (next) run++;
        rand = api.rng(cur.seed + "|coral2|" + run); nF = api.noise(cur.seed + "|a"); nS = api.noise(cur.seed + "|b");
        clearGrid(g); adv = 0; ts = 0; acc = 0; catchTo = 0; recipeRows(0, g.gh);
        N0 = Math.max(5, Math.round(9 * g.n / 18000));
        scatter(g, rand, N0, 3, 12, 0.26);
        rev++;
      }
      function build(rr) {
        var keep = Math.min(adv, MATURE2);
        g = makeGrid(rr.w, rr.h, cur.p.cells, CELLS_MAX2); g.Fm = new Float32Array(g.n); g.Km = new Float32Array(g.n); cellsUsed = cur.p.cells;
        P = makePaint(rr, g); lutC = -1;
        newSheet(false); catchTo = keep;
      }
      /* une avance : la recette se rafraîchit en partie, deux plumes sèment, puis 8 itérations (comme chaque image du kit) */
      function advance() {
        var s = adv & 15, gh = g.gh;
        recipeRows(Math.floor(gh * s / 16), Math.floor(gh * (s + 1) / 16));
        dab(g, g.gw * (0.5 + 0.4 * Math.sin(ts * 0.41)), gh * (0.5 + 0.38 * Math.sin(ts * 0.29 + 1.2)), 1, 0.26);
        dab(g, g.gw * (0.5 + 0.42 * Math.sin(ts * 0.23 + 2.0)), gh * (0.5 + 0.4 * Math.sin(ts * 0.37 + 0.4)), 1, 0.26);
        if (adv % 90 === 0) dab(g, 10 + rand() * (g.gw - 20), 10 + rand() * (g.gh - 20), 3, 0.26);
        iterate(g, 8, 0, 0);
        ts += 1 / 60; adv++; rev++;
      }
      function frame(rr, dt) {
        var p = cur.p, k, quick, m, t0;
        if (p.cells !== cellsUsed) build(rr);
        quick = rr.paused ? MATURE2 : catchTo;
        if (adv < quick) { t0 = now(); do advance(); while (adv < quick && now() - t0 < BUDGET); if (rr.paused && adv < MATURE2) rr.dirty = true; }
        else if (!rr.paused) {
          /* au plus MAX_ADV avances et LIVE_MS millisecondes par image : à l'extrême (grille fine, vitesse maximale, 30 images par seconde) la simulation ralentit */
          acc += p.speed / 8 * Math.min(2, dt * 60); k = acc | 0; acc -= k; if (k > MAX_ADV) k = MAX_ADV; t0 = now();
          while (k-- > 0) { advance(); if (now() - t0 > LIVE_MS) break; }
        }
        /* si tout s'est éteint (réglages extrêmes), de nouvelles graines */
        if (adv > 20 && (++fc & 31) === 0 && mass(g) < 1.5) { scatter(g, rand, N0, 3, 12, 0.26); rev++; }
        if (p.thr !== lutC) { buildLut(lut, toneCoral2, p.thr); lutC = p.thr; drawn = -1; }
        m = Math.max(0.5, p.edge * P.W / g.gw); setEdge(P, m);
        if (drawn === rev && lastM === m) return;
        drawn = rev; lastM = m;
        paint(rr, g, P, lut, 1);
      }
      r = runner(api.host, {
        get scale() { return canvasScale(api); },   /* relue à chaque redimensionnement : le budget de pixels tient à toute taille */
        maxDpr: 1,
        resize: build,
        redraw: function () { if (P) { fillInk(P); drawn = -1; } },
        frame: frame
      });
      r.paused = !S.live;   /* monté à l'arrêt : la simulation ne tourne pas, l'image mûre est préparée à la première image */
      return {
        update: function (S) {
          var seedChanged = S.seed !== cur.seed;
          cur = S; r.paused = !S.live; r.dirty = true;
          if (seedChanged) { run = 1; newSheet(false); }
        },
        destroy: r.destroy,
        recolor: function () { r.redraw(); },
        png: function () { return r.cv; }
      };
    },
    code: function (S) { return JSON.stringify({ systeme: "reaction-diffusion-2", planche: 6, seed: S.seed, params: S.p }); }
  });
})();

/* ---- gen-types/growth.js */
/* Croissance différentielle : une courbe fermée qui grandit, se plie et se repousse (planches 07 et 08 du kit).
   Des nœuds reliés par des ressorts, une répulsion entre les brins (grille spatiale), un nœud de plus là où le bruit le choisit
   ou là où la courbe s'étire. 07 trace la ligne et ses échos ; 08 remplit la même simulation en encre pleine.
   Le monde de la simulation est calculé d'après le cadre : la courbe est confinée dans une forme qui déborde un peu de l'écran,
   et le nombre de nœuds reste borné (6 400 au plus). Quand la courbe a rempli le cadre, la suivante a déjà poussé en coulisses
   et prend le relais par un fondu : jamais de cadre vide, jamais de retour au point de départ visible. */
(function () {
  "use strict";
  var A = BgGen.api, TAU = A.TAU, clamp = A.clamp, smooth = A.smooth, seedOf = A.seedOf, runner = A.runner, inkCss = A.inkCss, doc = document;
  var range = BgGen.range, toggle = BgGen.toggle;

  var R0 = 12.5, REST0 = 4.3, KS = 0.42, GROW0 = 0.0011;   /* constantes du kit : portée de la répulsion, longueur au repos, raideur, taux de croissance */
  var SNAP = 70, MAXN = 6400, MAXCAP = 6000, FULL = 1.8, SQ = 3.914, GRID_MIN = 8;
  var HOLD = 7, CROSS = 3, WARM_BUDGET = 7000, WARM_MS = 8, PAUSE_BUDGET = 60000, PAUSE_MS = 8, WARM_STEPS = 5000, ECHO_A = 0.55;
  var WALL = 1.02, WALL8 = Math.pow(WALL, 8);   /* limite dure : la courbe ne dépasse pas la forme confinante de plus de 2 % */

  function mountGrowth(S, api, solid) {
    var cur = S, r = null;
    var order = new Int32Array(MAXN), cellOf = new Int32Array(MAXN), cellStart = null, fillPos = null;
    var seedKey = S.seed, baseSeed = seedOf(S.seed), cycle = 0, main = null, next = null;
    var u = 1, HX = 300, HY = 190, OX = 0, OY = 0, areaW = 1, sx = 1, tx = 0, ty = 0, cvW = 2, cvH = 2;
    var pool = [], ghost = null, ghostOn = false, grab = false, fl = null, pwLast = -1e9, lastDims = [0, 0, 0], phase = "in", paA = 0, paB = 0, fadeT = 0, acc = 0, boost = 1, warming = true, frozen = false, frozenSig = "", lastSig = "", forceDraw = true;
    var P = { R: R0, R2: R0 * R0, rest: REST0, KR: 0.9, KB: 0.16, wild: 1, grow: 0.4, CS: R0, gw: 2, gh: 2, cap: 1000, thr: 1 };

    /* ------------------------------------------------- réglages dérivés */
    function derive(p) {
      var g = p.gap, R = R0 * g;
      P.R = R; P.R2 = R * R; P.rest = REST0 * g; P.KR = p.repel; P.KB = p.bend; P.wild = p.wild; P.grow = p.grow;
      P.CS = Math.max(R, GRID_MIN); P.gw = Math.ceil(2 * OX / P.CS) + 2; P.gh = Math.ceil(2 * OY / P.CS) + 2;
      P.cap = clamp(FULL * areaW / (R * P.rest), 150, MAXCAP);   /* nombre de nœuds qui remplit la forme (mesuré : environ 31 unités carrées par nœud à l'écart du kit) */
      P.thr = 1.7 * P.rest * (1 - 0.31 * P.wild);
    }
    function simSig(p) { return p.repel + "|" + p.bend + "|" + p.grow + "|" + p.gap + "|" + p.wild; }

    /* ------------------------------------------------------------ monde */
    function layout(rr) {
      var w = rr.w, h = rr.h, n0 = clamp(2200 + 0.0012 * w * h, 2600, 4600), area = n0 * R0 * REST0 / FULL, cells;
      /* la forme confinante est un super-ellipse d'exposant 8 : aire = 3,914 HX HY, et elle dépasse le cadre de 5 % */
      u = Math.sqrt(SQ * 1.1025 * w * h / 4 / area);
      HX = 1.05 * w / 2 / u; HY = 1.05 * h / 2 / u; areaW = SQ * HX * HY;
      OX = HX * 1.25 + 20; OY = HY * 1.25 + 20;
      cells = (Math.ceil(2 * OX / GRID_MIN) + 2) * (Math.ceil(2 * OY / GRID_MIN) + 2) + 2;
      cellStart = new Int32Array(cells); fillPos = new Int32Array(cells);
      sx = rr.k * u; tx = rr.k * w / 2; ty = rr.k * h / 2; cvW = rr.cv.width; cvH = rr.cv.height;
      pool = []; ghost = null; ghostOn = false;
    }
    /* une courbe : ses nœuds, son générateur, son bruit et son calque d'échos. target : part du remplissage où la préchauffer.
       Les tableaux et le calque d'une courbe finie sont gardés en réserve et réutilisés : aucun canevas n'est créé à chaque cycle. */
    function newSim(seed, off, target) {
      var s = pool.pop(), i, a, rad, ph, cx, cy;
      if (!s) {
        s = { Ar: new Float32Array(MAXN * 2), Br: new Float32Array(MAXN * 2), hc: doc.createElement("canvas"), hx: null };
        s.hc.width = cvW; s.hc.height = cvH; s.hx = s.hc.getContext("2d");
      } else {
        s.hx.setTransform(1, 0, 0, 1, 0, 0); s.hx.globalCompositeOperation = "source-over"; s.hx.globalAlpha = 1; s.hx.clearRect(0, 0, cvW, cvH);
      }
      s.n = 44; s.steps = 0; s.wsteps = 0; s.target = target; s.ready = false; s.dirty = false; s.rand = A.rng(seed); s.nzf = A.noise(seed);
      ph = s.rand() * TAU; cx = off * (s.rand() - 0.5) * 0.24 * HX; cy = off * (s.rand() - 0.5) * 0.24 * HY;
      for (i = 0; i < s.n; i++) {
        a = i / s.n * TAU; rad = 26 * (1 + 0.1 * Math.sin(3 * a + ph) + 0.06 * Math.sin(5 * a + ph * 2));
        s.Ar[i * 2] = cx + Math.cos(a) * rad; s.Ar[i * 2 + 1] = cy + Math.sin(a) * rad;
      }
      return s;
    }
    function release(s) { if (s && s.hc.width === cvW && s.hc.height === cvH && pool.length < 2) pool.push(s); }
    function restart() {
      seedKey = cur.seed; baseSeed = seedOf(cur.seed); cycle = 0; release(main); release(next); next = null; ghostOn = false; grab = false; derive(cur.p);
      main = newSim(baseSeed, 0, cur.live ? 0.45 : 0.55);
      warming = true; phase = "in"; fadeT = 0; paA = 0; paB = 0; acc = 0; boost = 1; frozen = false; forceDraw = true;
    }

    /* ------------------------------------------------------------ un pas */
    /* gmul : multiplicateur du taux de croissance (le préchauffage tourne toujours au taux du kit) */
    function step(s, gmul) {
      var Ar = s.Ar, Br = s.Br, nzf = s.nzf, rand = s.rand, nn = s.n;
      var R = P.R, R2 = P.R2, CS = P.CS, gw = P.gw, gh = P.gh, rest0 = P.rest, wildK = 0.28 * P.wild, KR = P.KR, KB = P.KB, thr = P.thr, half = nn * 0.5, invCS = 1 / CS, ncell = gw * gh;
      var i, j, k, x, y, fx, fy, ip, inx, dx, dy, d, l, e, gx, gy, ox, oy, cx0, cy0, q, m, dd, ex, ey, s8, rr, mx, my, out, nxt, gr, pe, v, rs, split, tm = s.steps * 0.0012;
      cellStart.fill(0, 0, ncell + 1);
      for (i = 0; i < nn; i++) {
        gx = ((Ar[i * 2] + OX) * invCS) | 0; gy = ((Ar[i * 2 + 1] + OY) * invCS) | 0;
        gx = gx < 0 ? 0 : gx >= gw ? gw - 1 : gx; gy = gy < 0 ? 0 : gy >= gh ? gh - 1 : gy;
        q = gy * gw + gx; cellOf[i] = q; cellStart[q + 1]++;
      }
      for (k = 0; k < ncell; k++) cellStart[k + 1] += cellStart[k];
      for (k = 0; k < ncell; k++) fillPos[k] = cellStart[k];
      for (i = 0; i < nn; i++) order[fillPos[cellOf[i]]++] = i;
      for (i = 0; i < nn; i++) {
        x = Ar[i * 2]; y = Ar[i * 2 + 1]; fx = 0; fy = 0;
        ip = i === 0 ? nn - 1 : i - 1; inx = i === nn - 1 ? 0 : i + 1;
        l = rest0 * (1 + wildK * nzf(x * 0.012, y * 0.012));
        dx = Ar[ip * 2] - x; dy = Ar[ip * 2 + 1] - y; d = Math.sqrt(dx * dx + dy * dy) + 1e-6; e = (d - l) * KS / d; fx += dx * e; fy += dy * e;
        dx = Ar[inx * 2] - x; dy = Ar[inx * 2 + 1] - y; d = Math.sqrt(dx * dx + dy * dy) + 1e-6; e = (d - l) * KS / d; fx += dx * e; fy += dy * e;
        fx += ((Ar[ip * 2] + Ar[inx * 2]) * 0.5 - x) * KB; fy += ((Ar[ip * 2 + 1] + Ar[inx * 2 + 1]) * 0.5 - y) * KB;
        gx = ((x + OX) * invCS) | 0; gy = ((y + OY) * invCS) | 0;
        gx = gx < 0 ? 0 : gx >= gw ? gw - 1 : gx; gy = gy < 0 ? 0 : gy >= gh ? gh - 1 : gy;
        for (oy = -1; oy <= 1; oy++) {
          cy0 = gy + oy; if (cy0 < 0 || cy0 >= gh) continue;
          for (ox = -1; ox <= 1; ox++) {
            cx0 = gx + ox; if (cx0 < 0 || cx0 >= gw) continue;
            q = cy0 * gw + cx0;
            for (k = cellStart[q]; k < cellStart[q + 1]; k++) {
              j = order[k]; if (j === i) continue;
              m = i > j ? i - j : j - i; if (m > half) m = nn - m; if (m <= 2) continue;
              dx = x - Ar[j * 2]; dy = y - Ar[j * 2 + 1]; dd = dx * dx + dy * dy; if (dd >= R2 || dd < 1e-8) continue;
              d = Math.sqrt(dd); e = (1 - d / R) * KR / d; fx += dx * e; fy += dy * e;
            }
          }
        }
        /* mur doux : la forme confinante est un super-ellipse d'exposant 8 (norme p) */
        ex = x / HX; ey = y / HY; ex *= ex; ex *= ex; ex *= ex; ey *= ey; ey *= ey; ey *= ey; s8 = ex + ey;
        if (s8 > 1) { rr = Math.sqrt(Math.sqrt(Math.sqrt(s8))); e = (rr - 1) * 0.66 / rr; fx -= x * e; fy -= y * e; }
        d = Math.sqrt(fx * fx + fy * fy); e = d > 1.5 ? 1.5 / d : 1;
        x += fx * 0.55 * e; y += fy * 0.55 * e;
        /* la pression d'une courbe dense l'emporte sur le mur doux : on ramène en plus les nœuds qui le franchissent */
        ex = x / HX; ey = y / HY; ex *= ex; ex *= ex; ex *= ex; ey *= ey; ey *= ey; ey *= ey; s8 = ex + ey;
        if (s8 > WALL8) { e = WALL / Math.sqrt(Math.sqrt(Math.sqrt(s8))); x *= e; y *= e; }
        Br[i * 2] = x; Br[i * 2 + 1] = y;
      }
      /* reconstruction : un nœud de plus sur les arêtes étirées, et là où le bruit choisit que la courbe pousse plus vite */
      gr = nn >= P.cap ? 0 : GROW0 * (1 + 2.2 * Math.exp(-nn / 260)) * gmul; out = 0;
      for (i = 0; i < nn; i++) {
        nxt = i === nn - 1 ? 0 : i + 1;
        x = Br[i * 2]; y = Br[i * 2 + 1];
        Ar[out * 2] = x; Ar[out * 2 + 1] = y; out++;
        if (out + (nn - 1 - i) >= MAXN - 2) continue;
        dx = Br[nxt * 2] - x; dy = Br[nxt * 2 + 1] - y; d = Math.sqrt(dx * dx + dy * dy);
        mx = x + dx * 0.5; my = y + dy * 0.5; split = false;
        if (d > thr) { rs = rest0 * (1 + wildK * nzf(mx * 0.012, my * 0.012)); if (d > 1.7 * rs) split = true; }
        if (!split && gr > 0) { v = nzf(mx * 0.011 + tm, my * 0.011) * 0.5 + 0.5; pe = gr * 4 * v * v; if (rand() < pe) split = true; }
        if (split) { Ar[out * 2] = mx + (rand() - 0.5) * 0.3; Ar[out * 2 + 1] = my + (rand() - 0.5) * 0.3; out++; }
      }
      s.n = out; s.steps++;
      if (s.steps % SNAP === 0) snap(s);
    }

    /* ----------------------------------------------------------- tracé */
    /* courbe fermée lissée : des arcs quadratiques entre les milieux des arêtes */
    function trace(g, s) {
      var Ar = s.Ar, i, m = s.n, nx, x0 = (Ar[(m - 1) * 2] + Ar[0]) * 0.5, y0 = (Ar[(m - 1) * 2 + 1] + Ar[1]) * 0.5, x1, y1;
      g.beginPath(); g.moveTo(x0, y0);
      for (i = 0; i < m; i++) {
        nx = i + 1 === m ? 0 : i + 1; x1 = (Ar[i * 2] + Ar[nx * 2]) * 0.5; y1 = (Ar[i * 2 + 1] + Ar[nx * 2 + 1]) * 0.5;
        g.quadraticCurveTo(Ar[i * 2], Ar[i * 2 + 1], x1, y1);
      }
      g.closePath();
    }
    /* un écho de l'état présent : les anciens s'estompent, le nouveau se pose par-dessus (en encre : recolor() reteint ce calque) */
    function snap(s) {
      var g = s.hx;
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = "destination-out"; g.globalAlpha = 1; g.fillStyle = "rgba(0,0,0," + (solid ? 0.035 : 0.05) + ")"; g.fillRect(0, 0, s.hc.width, s.hc.height);
      g.globalCompositeOperation = "source-over"; g.setTransform(sx, 0, 0, sx, tx, ty); g.lineJoin = "round";
      if (solid) { g.fillStyle = inkCss(0.11); trace(g, s); g.fill(); }
      else { g.strokeStyle = inkCss(0.6); g.lineWidth = (0.45 + 0.12 * u) / u; trace(g, s); g.stroke(); }
      s.dirty = true;
    }
    /* dessiner un calque dans un canevas d'un pixel en force le tracé en attente : celui de la courbe suivante se fait par petits morceaux
       pendant sa croissance en coulisses, au lieu d'un bloc à la première image du fondu */
    function flushLayer(s) {
      if (!fl) { var c = doc.createElement("canvas"); c.width = 1; c.height = 1; fl = c.getContext("2d"); }
      fl.clearRect(0, 0, 1, 1); fl.drawImage(s.hc, 0, 0, 1, 1); s.dirty = false;
    }
    function drawSim(ctx, s, a, p) {
      if (a <= 0.002) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = "source-over";
      if (p.echo > 0.01) { ctx.globalAlpha = a * p.echo * ECHO_A; ctx.drawImage(s.hc, 0, 0); }
      ctx.setTransform(sx, 0, 0, sx, tx, ty); ctx.lineJoin = "round"; ctx.lineCap = "round";
      trace(ctx, s);
      if (solid) {
        ctx.globalAlpha = a; ctx.fillStyle = inkCss(0.92); ctx.fill();
        if (p.rim > 0.02) {   /* reflet du bord : l'encre s'éclaircit vers le contour, comme un liseré de verre */
          ctx.globalCompositeOperation = "destination-out"; ctx.strokeStyle = "#000";
          ctx.globalAlpha = 0.14 * a; ctx.lineWidth = 5 * p.rim; ctx.stroke();
          ctx.globalAlpha = 0.24 * a; ctx.lineWidth = 1.6 * p.rim; ctx.stroke();
          ctx.globalCompositeOperation = "source-over";
        }
      } else {
        ctx.globalAlpha = 0.07 * a; ctx.fillStyle = inkCss(1); ctx.fill();
        ctx.globalAlpha = a; ctx.strokeStyle = inkCss(0.9); ctx.lineWidth = p.weight * (0.8 + 0.25 * u) / u; ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    function draw(rr, p) {
      var ctx = rr.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, rr.cv.width, rr.cv.height);
      if (ghostOn) { ctx.globalAlpha = paA; ctx.drawImage(ghost, 0, 0); ctx.globalAlpha = 1; }   /* courbe sortante : figée, une simple image */
      else drawSim(ctx, main, paA, p);
      if (next && paB > 0) drawSim(ctx, next, paB, p);
    }
    /* garde l'image de la courbe pleine (le canevas vient de la tracer seule) pour le fondu : elle ne bouge plus et n'est plus retracée */
    function ensureGhost() { if (!ghost) { ghost = doc.createElement("canvas"); ghost.width = cvW; ghost.height = cvH; } }
    function grabGhost(rr) {
      ensureGhost();
      var g = ghost.getContext("2d");
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = "source-over"; g.globalAlpha = 1; g.clearRect(0, 0, cvW, cvH); g.drawImage(rr.cv, 0, 0);
      ghostOn = true;
    }

    /* ------------------------------------------------ préchauffage et pas */
    /* avance une courbe jusqu'à sa part de remplissage, au taux du kit ; renvoie vrai une fois la cible atteinte.
       Deux plafonds par image : un budget en nœuds x pas, et une durée réelle en ms (une machine lente avance moins par image, sans jamais bloquer) */
    function warmUp(s, budget, ms) {
      var tgt = Math.max(120, s.target * P.cap), used = 0, t0 = performance.now();
      while (s.n < tgt && s.wsteps <= WARM_STEPS && used < budget) {
        step(s, 1); s.wsteps++; used += s.n;
        if (performance.now() - t0 > ms) break;
      }
      return s.n >= tgt || s.wsteps > WARM_STEPS;
    }
    function runSteps(s, dt) {
      var ns, k;
      acc += Math.min(dt, 0.05) * 60 * boost; ns = Math.floor(acc); acc -= ns; if (ns > 6) ns = 6;
      for (k = 0; k < ns; k++) step(s, P.grow);
      boost = 1 + (boost - 1) * Math.exp(-dt / 0.8);
    }

    /* ------------------------------------------------------- image */
    function frame(rr, dt) {
      var p = cur.p, sig, t;
      derive(p);
      if (rr.paused) {
        /* monté à l'arrêt, ou graine et taille changées pendant la pause : le préchauffage avance image par image (jamais d'un bloc),
           la courbe se révèle en grandissant, puis l'image se fige */
        if (warming) { if (warmUp(main, PAUSE_BUDGET, PAUSE_MS)) warming = false; else rr.dirty = true; }
        if (warming) {
          fadeT = Math.max(fadeT, Math.min(1, 2 * main.n / Math.max(120, main.target * P.cap)));
          paA = smooth(0, 1, fadeT); paB = 0; frozen = false;
          t = performance.now(); if (t - pwLast < 70) return; pwLast = t;   /* pendant la révélation, une image tous les 70 ms suffit : le calcul passe avant le tracé */
        } else {
          if (phase === "cross") { release(main); main = next; next = null; cycle++; phase = "run"; ghostOn = false; } else if (phase === "in") phase = "run";
          paA = 1; paB = 0; frozen = false;
        }
      } else if (frozen) {
        if (simSig(p) !== frozenSig) { frozen = false; fadeT = 0; }
      } else if (phase === "in") {
        fadeT += dt;
        if (warming) { if (warmUp(main, WARM_BUDGET, WARM_MS)) { warming = false; boost = clamp(WARM_BUDGET / main.n, 1, 6); } } else runSteps(main, dt);
        paA = smooth(0, 1, fadeT);
        if (fadeT >= 1 && !warming) { phase = "run"; paA = 1; }
      } else if (phase === "run") {
        paA = 1; runSteps(main, dt);
        if (main.n >= P.cap) { phase = "hold"; fadeT = 0; }
      } else if (phase === "hold") {
        paA = 1; runSteps(main, dt); fadeT += dt;
        if (main.n < P.cap * 0.97) { phase = "run"; release(next); next = null; }
        else if (p.loop) {
          if (!next) { next = newSim(baseSeed + (cycle + 1) * 7, 1, 0.45); ensureGhost(); }
          else {
            if (!next.ready && warmUp(next, WARM_BUDGET, WARM_MS)) next.ready = true;
            if (next.dirty) flushLayer(next);
          }
          if (fadeT >= HOLD && next && next.ready) { phase = "cross"; fadeT = 0; acc = 0; boost = 1; grab = true; }
        } else { release(next); next = null; if (fadeT >= 8) { frozen = true; frozenSig = simSig(p); } }
      } else {   /* fondu enchaîné : la courbe pleine s'efface, la suivante (déjà poussée) apparaît et continue de grandir */
        fadeT += dt; t = smooth(0, CROSS, fadeT); paA = 1 - t; paB = t;
        runSteps(next, dt);
        if (fadeT >= CROSS) { release(main); main = next; next = null; cycle++; phase = "run"; paA = 1; paB = 0; ghostOn = false; }
      }
      sig = p.weight + "|" + p.echo + "|" + p.rim;
      if (frozen && !forceDraw && sig === lastSig) return;
      lastSig = sig; forceDraw = false;
      draw(rr, p);
      if (grab) { grab = false; if (phase === "cross") grabGhost(rr); }
    }

    r = runner(api.host, {
      maxDpr: 1.25,
      resize: function (rr) {
        /* l'observateur de taille notifie aussi à l'abonnement : à dimensions inchangées, on garde la simulation (le canevas, lui, a été vidé) */
        if (main && rr.w === lastDims[0] && rr.h === lastDims[1] && rr.k === lastDims[2]) { forceDraw = true; return; }
        lastDims = [rr.w, rr.h, rr.k]; layout(rr); restart();
      },
      frame: frame
    });
    r.paused = !cur.live;   /* monté à l'arrêt : la courbe se révèle en grandissant (préchauffage par tranches), puis l'image se fige */

    return {
      update: function (S) {
        var seedChanged = S.seed !== seedKey;
        cur = S; r.paused = !S.live; r.dirty = true;
        if (seedChanged) restart();
        else if (frozen && S.p.loop) { frozen = false; fadeT = 0; }
      },
      destroy: function () { r.destroy(); main = null; next = null; pool = []; ghost = null; ghostOn = false; fl = null; },
      recolor: function () {
        if (ghostOn) { var gx = ghost.getContext("2d"); gx.setTransform(1, 0, 0, 1, 0, 0); gx.globalCompositeOperation = "source-in"; gx.globalAlpha = 1; gx.fillStyle = inkCss(1); gx.fillRect(0, 0, cvW, cvH); gx.globalCompositeOperation = "source-over"; }
        [main, next].forEach(function (s) {
          if (!s) return;
          s.hx.setTransform(1, 0, 0, 1, 0, 0); s.hx.globalCompositeOperation = "source-in"; s.hx.globalAlpha = 1; s.hx.fillStyle = inkCss(1); s.hx.fillRect(0, 0, s.hc.width, s.hc.height); s.hx.globalCompositeOperation = "source-over";
        });
        forceDraw = true; r.redraw();
      },
      png: function () { return r.cv; }   /* pas de toSVG : les échos sont un calque raster, un SVG ne ressemblerait pas à l'écran (le PNG, lui, est fidèle) */
    };
  }

  function params(solid) {
    return [
      range("grow", "Vitesse de croissance", 0.1, 2.5, 0.05, 0.4),
      range("gap", "Écart des lignes", 0.8, 1.5, 0.01, 1),
      range("repel", "Répulsion", 0.4, 1.6, 0.02, 0.9),
      range("bend", "Lissage de la courbe", 0.04, 0.4, 0.01, 0.16),
      range("wild", "Irrégularité", 0, 1.6, 0.05, 1),
      solid ? range("rim", "Reflet du bord", 0, 2, 0.05, 1) : range("weight", "Épaisseur du trait", 0.4, 2.4, 0.05, 1),
      range("echo", "Échos du passé", 0, 1, 0.05, 1),
      toggle("loop", "Recommencer", true)
    ];
  }

  BgGen.register({
    id: "growth", kit: "07", group: "Croissance et cellules", label: "Croissance différentielle", int: 0.55,
    note: "Une courbe fermée qui grandit, se plie et se repousse jusqu'à remplir le cadre. La planche 07.",
    params: params(false),
    mount: function (S, api) { return mountGrowth(S, api, false); },
    code: function (S) { return JSON.stringify({ systeme: "croissance", planche: 7, seed: S.seed, params: S.p }); }
  });
  BgGen.register({
    id: "growthsolid", kit: "08", group: "Croissance et cellules", label: "Croissance différentielle (encre pleine)", int: 0.4,
    note: "La même courbe en encre pleine, entourée de lavis qui gardent la trace de ses états passés. La planche 08.",
    params: params(true),
    mount: function (S, api) { return mountGrowth(S, api, true); },
    code: function (S) { return JSON.stringify({ systeme: "croissance-pleine", planche: 8, seed: S.seed, params: S.p }); }
  });
})();

/* ---- gen-types/crowds.js */
/* Corps et foules : la moisissure (physarum, planche 10) et la nuée (flocking, planche 11).
   Deux systèmes d'agents qui n'obéissent qu'à des règles locales ; le dessin plein cadre vient de leur accumulation. */
(function () {
  "use strict";
  var A = BgGen.api, TAU = A.TAU, clamp = A.clamp;
  var range = BgGen.range;

  function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a.toFixed(3) + ")"; }

  /* ===================================================== 10 : moisissure (physarum) */
  /* Des agents déposent une trace, la suivent, et la trace se diffuse et s'évanouit. Le monde est un tore (rien ne touche le bord),
     sur une grille d'environ 90 000 cellules : le canevas est la grille, le navigateur l'étire en la lissant. */
  BgGen.register({
    id: "physarum", kit: "10", group: "Corps et foules", label: "Moisissure",
    note: "Des agents déposent une trace et suivent celle des autres : personne ne dessine le réseau. La planche 10.",
    int: 0.6,
    /* réglages du kit (18 agents pour 100 cellules, persistance 0,955, diffusion 3 x 3 complète), sauf l'angle des capteurs : 0,8 rad au lieu de 0,6.
       Sur un tore, à 0,6 rad le réseau finit en bandes parallèles droites (4 graines sur 6 après 6 000 pas, soit environ 50 secondes d'animation) ; à 0,8 il reste isotrope. */
    params: [
      range("agents", "Agents (pour 100 cellules)", 4, 28, 1, 18, "", false),
      range("speed", "Vitesse", 0.4, 3, 0.05, 2),
      range("sense", "Angle des capteurs", 0.25, 1.2, 0.01, 0.8),
      range("dist", "Portée des capteurs", 5, 16, 0.25, 9),
      range("decay", "Persistance de la trace", 0.9, 0.975, 0.0025, 0.955),
      range("mix", "Diffusion de la trace", 0.2, 1, 0.01, 1),
      range("respawn", "Renouvellement des agents", 0, 0.01, 0.0005, 0.003),
      range("gain", "Contraste", 0.08, 0.7, 0.01, 0.28)
    ],
    mount: function (S, api) {
      var cur = S, r, host = api.host;
      var PRE = 300, WS = 12;                          /* préchauffage : le réseau est formé après environ 300 pas ; on le fait par paquets de WS pas par image */
      var CT = Math.cos(0.38), ST = Math.sin(0.38), DEP = 1.4;   /* virage et dépôt de la planche du kit */
      var gw = 0, gh = 0, N = 0, T, T2, U, ax, ay, hx, hy, img = null, px = null, rs = 1, acc = 0, needPaint = true, activeKey = "", pendKey = "", tm = 0, warm = 0;
      var lut = new Uint8ClampedArray(1024);

      function paintInk() {
        var c = api.ink(), i, n = gw * gh;
        for (i = 0; i < n; i++) { px[i * 4] = c[0]; px[i * 4 + 1] = c[1]; px[i * 4 + 2] = c[2]; }
      }

      function init(rr) {
        var p = cur.p, rand = api.rng(cur.seed), i, a;
        gw = rr.cv.width; gh = rr.cv.height;
        T = new Float32Array(gw * gh); T2 = new Float32Array(gw * gh); U = new Float32Array(gw * gh);
        N = clamp(Math.round(gw * gh * p.agents / 100), 100, 45000); activeKey = pendKey = cur.seed + "|" + p.agents;
        ax = new Float64Array(N); ay = new Float64Array(N); hx = new Float32Array(N); hy = new Float32Array(N);
        for (i = 0; i < N; i++) { ax[i] = rand() * gw; ay[i] = rand() * gh; a = rand() * TAU; hx[i] = Math.cos(a); hy[i] = Math.sin(a); }
        rs = ((rand() * 4294967295) | 0) || 1;
        img = rr.ctx.createImageData(gw, gh); px = img.data; paintInk();
        acc = 0; needPaint = true;
        warm = gw >= 8 && gh >= 8 ? PRE : 0;
      }

      /* valeur de la trace en (x, y), avec rebouclage sur le tore */
      function at(x, y) {
        var xi = (x + gw) | 0, yi = (y + gh) | 0;
        if (xi >= gw) xi -= gw; if (xi >= gw) xi -= gw;
        if (yi >= gh) yi -= gh; if (yi >= gh) yi -= gh;
        return T[yi * gw + xi];
      }

      function step(p) {
        var W = gw, H = gh, SD = Math.min(p.dist, W * 0.4, H * 0.4), cs = Math.cos(p.sense), sn = Math.sin(p.sense), ct = CT, st = ST;
        var thr = p.respawn * 4294967296, mix = p.mix, keep = 1 - mix, kb = mix / 9 * p.decay, kc = keep * p.decay;
        var i, x, y, dx, dy, nx, ny, f, fl, fr, q, o, y0, x0, rp, rn, t;
        for (i = 0; i < N; i++) {
          x = ax[i]; y = ay[i]; dx = hx[i]; dy = hy[i];
          if (thr > 0) {
            /* un agent sur quelques milliers repart d'ailleurs : sans cela le réseau se resserre en quelques tubes, puis en lignes droites */
            rs ^= rs << 13; rs ^= rs >>> 17; rs ^= rs << 5;
            if ((rs >>> 0) < thr) {
              rs ^= rs << 13; rs ^= rs >>> 17; rs ^= rs << 5; x = (rs >>> 0) / 4294967296 * W;
              rs ^= rs << 13; rs ^= rs >>> 17; rs ^= rs << 5; y = (rs >>> 0) / 4294967296 * H;
              rs ^= rs << 13; rs ^= rs >>> 17; rs ^= rs << 5; q = (rs >>> 0) / 4294967296 * TAU; dx = Math.cos(q); dy = Math.sin(q);
              if (x >= W) x = 0; if (y >= H) y = 0;
            }
          }
          f = at(x + dx * SD, y + dy * SD);
          fl = at(x + (dx * cs + dy * sn) * SD, y + (dy * cs - dx * sn) * SD);
          fr = at(x + (dx * cs - dy * sn) * SD, y + (dy * cs + dx * sn) * SD);
          nx = dx; ny = dy;
          if (f > fl && f > fr) { /* tout droit */ }
          else if (f < fl && f < fr) { rs ^= rs << 13; rs ^= rs >>> 17; rs ^= rs << 5; q = (rs & 256) ? st : -st; nx = dx * ct - dy * q; ny = dx * q + dy * ct; }
          else if (fl < fr) { nx = dx * ct - dy * st; ny = dx * st + dy * ct; }
          else if (fl > fr) { nx = dx * ct + dy * st; ny = dy * ct - dx * st; }
          o = 1.5 - 0.5 * (nx * nx + ny * ny); nx *= o; ny *= o;
          hx[i] = nx; hy[i] = ny;
          x += nx; y += ny;
          if (x < 0) { x += W; if (x >= W) x = 0; } else if (x >= W) x -= W;
          if (y < 0) { y += H; if (y >= H) y = 0; } else if (y >= H) y -= H;
          ax[i] = x; ay[i] = y;
          T[(y | 0) * W + (x | 0)] += DEP;
        }
        /* diffusion 3 x 3 en deux passes (mélange du flou et de la trace brute), avec évanouissement */
        for (y0 = 0; y0 < H; y0++) {
          o = y0 * W;
          U[o] = T[o + W - 1] + T[o] + T[o + 1];
          for (x0 = 1; x0 < W - 1; x0++) U[o + x0] = T[o + x0 - 1] + T[o + x0] + T[o + x0 + 1];
          U[o + W - 1] = T[o + W - 2] + T[o + W - 1] + T[o];
        }
        for (y0 = 0; y0 < H; y0++) {
          o = y0 * W; rp = (y0 === 0 ? H - 1 : y0 - 1) * W; rn = (y0 === H - 1 ? 0 : y0 + 1) * W;
          for (x0 = 0; x0 < W; x0++) T2[o + x0] = (U[rp + x0] + U[o + x0] + U[rn + x0]) * kb + T[o + x0] * kc;
        }
        t = T; T = T2; T2 = t;
      }

      /* trace -> opacité de l'encre : 1 - exp(-gain v), avec un seuil bas pour ne laisser aucune brume autour du réseau */
      function paint(rr) {
        var g = cur.p.gain, vmax = 7 / g, sc = 1023 / vmax, i, v, n = gw * gh, a;
        if (!img) return;
        for (i = 0; i < 1024; i++) { a = 1 - Math.exp(-g * (i / sc)); a = (a - 0.1) / 0.9; a = a > 0 ? a * a * (3 - 2 * a) : 0; lut[i] = a * 0.95 * 255; }
        for (i = 0; i < n; i++) { v = T[i] * sc; px[i * 4 + 3] = lut[v > 1023 ? 1023 : v | 0]; }
        rr.ctx.putImageData(img, 0, 0);
      }

      r = api.runner(host, {
        /* résolution de la grille : environ 90 000 cellules sur tout écran (une cellule fait de 2 à 4,5 pixels CSS), donc le même motif, à l'échelle du cadre */
        get scale() { var b = host.getBoundingClientRect(); return 1 / clamp(Math.sqrt(b.width * b.height / 90000), 2, 4.5); },
        maxDpr: 1, resize: init,
        frame: function (rr, dt) {
          var p = cur.p, n = 0, k;
          if (warm > 0) {
            /* préchauffage étalé sur plusieurs images, sans gel, y compris en pause (on redemande une image tant qu'il dure) ;
               on ne dessine qu'à partir de 96 pas : avant, la trace n'est qu'un voile uniforme, et l'ancienne image reste affichée */
            k = Math.min(warm, WS); warm -= k; while (k-- > 0) step(p);
            rr.dirty = true;
            if (warm <= PRE - 96) { paint(rr); needPaint = false; }
            return;
          }
          if (!rr.paused) {
            acc += p.speed * Math.min(dt, 0.05) * 60; n = Math.floor(acc); acc -= n; if (n > 4) n = 4;
            if (gw >= 8 && gh >= 8) for (k = 0; k < n; k++) step(p);
          }
          if (n > 0 || needPaint) { paint(rr); needPaint = false; }
        },
        redraw: function () { if (img) paintInk(); needPaint = true; }
      });
      r.paused = !S.live;
      return {
        /* le seed et le nombre d'agents redémarrent la simulation : on attend 120 ms sans changement (curseur en cours de glissement) */
        update: function (S) {
          var k = S.seed + "|" + S.p.agents;
          cur = S; r.paused = !S.live; r.dirty = true; needPaint = true;
          if (k === activeKey) { if (tm) { clearTimeout(tm); tm = 0; } pendKey = k; }
          else if (k !== pendKey) { pendKey = k; clearTimeout(tm); tm = setTimeout(function () { tm = 0; init(r); r.dirty = true; }, 120); }
        },
        destroy: function () { clearTimeout(tm); tm = 0; r.destroy(); },
        recolor: function () { r.redraw(); },
        png: function () { return r.cv; }
      };
    },
    code: function (S) { return JSON.stringify({ systeme: "physarum", planche: 10, seed: S.seed, params: S.p }); }
  });

  /* ===================================================== 11 : nuée (flocking) */
  /* Trois règles par oiseau (séparation, alignement, cohésion), une cible qui erre et un peu de vent tourbillonnant.
     La simulation vit dans un monde d'aire fixe (celle de la planche du kit) dont le rapport suit celui de l'écran ; un anneau garde les
     positions des derniers pas : la traînée du direct et la longue exposition de la pause en sont tirées. */
  BgGen.register({
    id: "murmuration", kit: "11", group: "Corps et foules", label: "Nuée",
    note: "Chaque oiseau suit trois règles à l'égard de ses voisins ; en pause, une longue exposition du vol. La planche 11.",
    int: 0.8,
    params: [
      range("birds", "Oiseaux", 200, 1800, 20, 1200, "", false),
      range("speed", "Vitesse", 0.3, 2.5, 0.05, 1),
      range("align", "Alignement", 0.01, 0.15, 0.005, 0.06),
      range("cohesion", "Cohésion", 0.0005, 0.012, 0.0005, 0.0035),
      range("separation", "Séparation", 0.002, 0.04, 0.001, 0.012),
      range("wander", "Errance de la nuée", 0, 0.0006, 0.00002, 0.00022),
      range("trail", "Longueur des traînées", 8, 60, 1, 30),
      range("weight", "Épaisseur du trait", 0.5, 3, 0.05, 1.3)
    ],
    mount: function (S, api) {
      var cur = S, r;
      var AREA = 300000, CS = 44, M = 780, PRE = 300, WS = 8, CAPC = 12, EXPO = 720, SLICE = 60, DIVS = [2, 3, 4, 5, 6, 10, 12, 15, 20, 30, 60], NC = 10;
      var u = 1, Ws = 600, Hs = 750, N = 0, activeKey = "", pendKey = "", tm = 0, n = 0, T = 0, gwc = 1, ghc = 1, warm = 0, warmShown = false;
      var x, y, vx, vy, HX, HY, PX, PY, cellStart, fillAt, order, cellOf, noise = null, LA = new Int32Array(NC + 1), LB = new Int32Array(NC + 1), LF = new Float64Array(NC + 1);
      var exKey = "";
      /* positions des extrémités des cordes de la traînée, en fraction de sa longueur (plus serrées près de la tête, où le trait est le plus visible) */
      var FR = [], MID = [], jj;
      for (jj = 0; jj <= NC; jj++) FR.push(Math.pow(jj / NC, 1.3));
      for (jj = 0; jj < NC; jj++) MID.push((FR[jj] + FR[jj + 1]) / 2);

      function init(rr) {
        var p = cur.p, rand = api.rng(cur.seed), i, a;
        u = Math.sqrt(rr.w * rr.h / AREA); Ws = rr.w / u; Hs = rr.h / u;
        gwc = Math.ceil(Ws / CS) + 1; ghc = Math.ceil(Hs / CS) + 1;
        N = Math.round(p.birds); activeKey = pendKey = cur.seed + "|" + p.birds;
        x = new Float32Array(N); y = new Float32Array(N); vx = new Float32Array(N); vy = new Float32Array(N);
        HX = new Float32Array(N * M); HY = new Float32Array(N * M); PX = new Float32Array(N * (NC + 1)); PY = new Float32Array(N * (NC + 1));
        cellStart = new Int32Array(gwc * ghc + 1); fillAt = new Int32Array(gwc * ghc); order = new Int32Array(N); cellOf = new Int32Array(N);
        noise = api.noise("nuee" + cur.seed);
        for (i = 0; i < N; i++) {
          x[i] = Ws * 0.3 + rand() * 160; y[i] = Hs * 0.4 + rand() * 160; a = rand() * TAU; vx[i] = Math.cos(a) * 2.6; vy[i] = Math.sin(a) * 2.6;
          HX[i * M] = x[i]; HY[i * M] = y[i];
        }
        n = 0; exKey = ""; T = 0; warm = PRE; warmShown = false;
      }

      function step(p) {
        var al = p.align, co = p.cohesion, se = p.separation, pull = p.wander, t = n / 60, W = Ws, H = Hs, i, j, k, cx0, cy0, gxi, gyi, ox, oy, q, o, dx, dy, d2, cnt, ax, ay, sx, sy, cxm, cym, sp, nz, slot, c0, c1, st;
        var tx = W * (0.5 + 0.4 * Math.sin(t * 0.33)), ty = H * (0.5 + 0.4 * Math.sin(t * 0.23 + 1)), gcount = gwc * ghc, mg = Math.min(70, 0.2 * Math.min(W, H));
        cellStart.fill(0);
        for (i = 0; i < N; i++) {
          gxi = (x[i] / CS) | 0; if (gxi < 0) gxi = 0; else if (gxi >= gwc) gxi = gwc - 1;
          gyi = (y[i] / CS) | 0; if (gyi < 0) gyi = 0; else if (gyi >= ghc) gyi = ghc - 1;
          cellOf[i] = gyi * gwc + gxi; cellStart[cellOf[i] + 1]++;
        }
        for (k = 0; k < gcount; k++) cellStart[k + 1] += cellStart[k];
        for (k = 0; k < gcount; k++) fillAt[k] = cellStart[k];
        for (i = 0; i < N; i++) order[fillAt[cellOf[i]]++] = i;
        slot = (n + 1) % M;
        for (i = 0; i < N; i++) {
          /* les règles sociales (la partie coûteuse) ne sont évaluées que pour une moitié des oiseaux à chaque pas, avec un poids double :
             même dynamique, moitié moins de calcul ; l'autre moitié se déplace avec ce qu'elle a déjà */
          if (((i + n) & 1) === 0) {
            q = cellOf[i]; gxi = q % gwc; gyi = (q / gwc) | 0;
            cnt = 0; ax = ay = sx = sy = cxm = cym = 0;
            for (oy = -1; oy <= 1; oy++) for (ox = -1; ox <= 1; ox++) {
              cx0 = gxi + ox; cy0 = gyi + oy; if (cx0 < 0 || cy0 < 0 || cx0 >= gwc || cy0 >= ghc) continue;
              q = cy0 * gwc + cx0; c0 = cellStart[q]; c1 = cellStart[q + 1];
              /* au plus CAPC voisins évalués par case : dans une case plus dense, on n'en prend qu'un sur st (décalé selon l'oiseau et le pas),
                 chacun pesant st, donc la moyenne et la somme de séparation restent justes et le coût est borné */
              st = c1 - c0 > CAPC ? (((c1 - c0) / CAPC) | 0) + 1 : 1;
              for (j = c0 + (st > 1 ? (i + n) % st : 0); j < c1; j += st) {
                o = order[j]; if (o === i) continue;
                dx = x[o] - x[i]; dy = y[o] - y[i]; d2 = dx * dx + dy * dy;
                if (d2 > 1936) continue;
                cnt += st; ax += vx[o] * st; ay += vy[o] * st; cxm += x[o] * st; cym += y[o] * st;
                if (d2 < 256) { sx -= dx * st; sy -= dy * st; }
              }
            }
            if (cnt > 0) {
              vx[i] += ((ax / cnt - vx[i]) * al + (cxm / cnt - x[i]) * co + sx * se) * 2;
              vy[i] += ((ay / cnt - vy[i]) * al + (cym / cnt - y[i]) * co + sy * se) * 2;
            }
          }
          vx[i] += (tx - x[i]) * pull; vy[i] += (ty - y[i]) * pull;
          nz = noise(x[i] * 0.004, y[i] * 0.004 + t * 0.1) * 0.09; vx[i] += -vy[i] * nz * 0.3; vy[i] += vx[i] * nz * 0.3;
          if (x[i] < mg) vx[i] += 0.18 + 0.005 * (mg - x[i]); else if (x[i] > W - mg) vx[i] -= 0.18 + 0.005 * (x[i] - W + mg);
          if (y[i] < mg) vy[i] += 0.18 + 0.005 * (mg - y[i]); else if (y[i] > H - mg) vy[i] -= 0.18 + 0.005 * (y[i] - H + mg);
          sp = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]) || 1;
          if (sp > 3.6) { vx[i] *= 3.6 / sp; vy[i] *= 3.6 / sp; } else if (sp < 2.0) { vx[i] *= 2.0 / sp; vy[i] *= 2.0 / sp; }
          x[i] += vx[i]; y[i] += vy[i];
          HX[i * M + slot] = x[i]; HY[i * M + slot] = y[i];
        }
        n++;
      }

      /* direct : une traînée en dix cordes qui s'effilent et s'effacent. La tête est la position lissée entre deux pas ; chaque extrémité
         de corde est lue dans l'historique à un retard fractionnaire (interpolé), si bien que la longueur de traînée varie sans saut */
      function drawLive(rr, p) {
        var ctx = rr.ctx, ink = api.ink(), L = clamp(p.trail, 8, 60), q, ip, wpx = Math.max(0.8, p.weight * u * 0.8), i, j, b, sa, sb, xa, ya, xb, yb;
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, rr.cv.width, rr.cv.height);
        for (j = 0; j <= NC; j++) {
          q = (n - 1 + clamp(T - (n - 1), 0, 1)) - L * FR[j]; ip = Math.floor(q);
          LA[j] = ((ip % M) + M) % M; LB[j] = ((ip + 1) % M + M) % M; LF[j] = q - ip;
        }
        for (i = 0; i < N; i++) {
          b = i * M;
          for (j = 0; j <= NC; j++) {
            sa = b + LA[j]; sb = b + LB[j]; xa = HX[sa]; ya = HY[sa]; xb = HX[sb]; yb = HY[sb];
            PX[i * (NC + 1) + j] = xa + (xb - xa) * LF[j]; PY[i * (NC + 1) + j] = ya + (yb - ya) * LF[j];
          }
        }
        ctx.setTransform(rr.k * u, 0, 0, rr.k * u, 0, 0); ctx.lineCap = "butt";
        for (j = NC - 1; j >= 0; j--) {
          ctx.strokeStyle = rgba(ink, 0.88 * Math.pow(1 - MID[j], 1.6)); ctx.lineWidth = wpx * (1 - 0.55 * MID[j]) / u;
          ctx.beginPath();
          for (i = 0; i < N; i++) { b = i * (NC + 1) + j; ctx.moveTo(PX[b], PY[b]); ctx.lineTo(PX[b + 1], PY[b + 1]); }
          ctx.stroke();
        }
      }

      /* pause : la longue exposition. Les derniers pas de chaque oiseau, empilés par tranches de soixante pas (une tranche = un seul trait,
         donc les recouvrements d'une même tranche ne s'additionnent pas, ceux de tranches différentes oui), en courbes lissées par les milieux des cordes */
      function drawExposure(rr, p) {
        var ctx = rr.ctx, ink = api.ink(), depth = Math.floor(Math.min(EXPO, n - 2) / SLICE) * SLICE, nsl = depth / SLICE, key, i, k, m, sl, d0, b, s, s2, qx, qy, SUB = 60, st = Math.max(1, Math.round(N / 420)), wpx = Math.max(0.6, p.weight * u * 0.5);
        for (k = 0; k < DIVS.length; k++) if (DIVS[k] * 100000 >= Math.ceil(N / st) * depth) { SUB = DIVS[k]; break; }
        m = SLICE / SUB;
        key = [n, N, rr.w, rr.h, Math.round(p.weight * 10), ink.join(",")].join("|");
        if (key === exKey) return;
        exKey = key;
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, rr.cv.width, rr.cv.height);
        if (nsl < 1) return;
        ctx.setTransform(rr.k * u, 0, 0, rr.k * u, 0, 0); ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = wpx / u;
        for (sl = nsl - 1; sl >= 0; sl--) {
          ctx.strokeStyle = rgba(ink, 0.035 + 0.075 * (1 - sl / Math.max(1, nsl - 1)));
          ctx.beginPath(); d0 = sl * SLICE;
          for (i = 0; i < N; i += st) {
            b = i * M; s = b + (n - d0) % M; ctx.moveTo(HX[s], HY[s]);
            for (k = 1; k < m; k++) {
              s = b + (n - d0 - k * SUB) % M; s2 = b + (n - d0 - (k + 1) * SUB) % M; qx = HX[s]; qy = HY[s];
              ctx.quadraticCurveTo(qx, qy, (qx + HX[s2]) / 2, (qy + HY[s2]) / 2);
            }
            s = b + (n - d0 - SLICE) % M; ctx.lineTo(HX[s], HY[s]);
          }
          ctx.stroke();
        }
      }

      r = api.runner(api.host, {
        maxDpr: 1.5, resize: init,
        frame: function (rr, dt) {
          var p = cur.p, target, k;
          if (warm > 0) {
            /* préchauffage étalé sur plusieurs images, sans gel ; l'ancienne image reste affichée (le canevas n'est redessiné qu'à la fin),
               sauf en pause : on montre alors l'état en cours dès que l'historique couvre une traînée, pour qu'une image figée existe toujours */
            k = Math.min(warm, WS); warm -= k; while (k-- > 0) step(p);
            T = n - 1; rr.dirty = true;
            if (warm > 0) { if (rr.paused && n >= 64 && !warmShown) { drawLive(rr, p); warmShown = true; } return; }
            exKey = "";
          }
          if (!rr.paused) {
            T += p.speed * Math.min(dt, 0.05) * 60; target = Math.floor(T) + 1;
            if (target - n > 4) { target = n + 4; T = target - 1; }
            while (n < target) step(p);
            exKey = ""; drawLive(rr, p);
          } else drawExposure(rr, p);
        },
        redraw: function () { exKey = ""; }
      });
      r.paused = !S.live;
      return {
        /* le seed et le nombre d'oiseaux redémarrent la simulation : on attend 120 ms sans changement (curseur en cours de glissement) */
        update: function (S) {
          var k = S.seed + "|" + S.p.birds;
          if (S.live !== cur.live) warmShown = false;
          cur = S; r.paused = !S.live; r.dirty = true;
          if (k === activeKey) { if (tm) { clearTimeout(tm); tm = 0; } pendKey = k; }
          else if (k !== pendKey) { pendKey = k; clearTimeout(tm); tm = setTimeout(function () { tm = 0; init(r); r.dirty = true; }, 120); }
        },
        destroy: function () { clearTimeout(tm); tm = 0; r.destroy(); },
        recolor: function () { r.redraw(); },
        png: function () { return r.cv; }
      };
    },
    code: function (S) { return JSON.stringify({ systeme: "murmuration", planche: 11, seed: S.seed, params: S.p }); }
  });
})();

/* ---- gen-types/bodies.js */
/* Corps et foules : la planche 12 du kit, des corps mous (jellies) portés en canevas plein cadre.
   Chaque corps est un anneau de points reliés par des ressorts, gonflé par une pression qui garde son aire.
   Presque sans pesanteur, ils se rencontrent doucement et repartent. La simulation tourne dans l'espace du kit (600 x 750),
   agrandi à la taille de l'écran par une échelle uniforme : le nombre de corps suit la surface. */
(function () {
  "use strict";
  var A = BgGen.api, TAU = A.TAU, clamp = A.clamp;
  var range = BgGen.range;

  var KAREA = 600 * 750;     /* surface de référence du kit */
  var KICK = 1;              /* impulsion d'une pichenette */
  var SWIRL = 0.016;         /* remous du bruit, en unités du kit par pas */
  var PRINT = 270;           /* pas de simulation avant l'image figée (exposition multiple) */
  var SNAP_EVERY = 9, SNAP_N = 30;   /* une pose tous les 9 pas, les 30 dernières gardées */
  var MAX_BODIES = 72;
  var SIZE_MAX = 1.2;        /* taille maximale des corps : au delà, ils se tassent et se recouvrent */
  var FILL_MAX = 0.4;        /* part du cadre couverte par les corps au plus, à la taille maximale */
  var STYLES = ["rings", "solid", "hatch", "dots", "double"];

  /* ------------------------------------------------------------ formes du kit */
  function circ(r) { return function (a) { return [r * Math.cos(a), r * Math.sin(a)]; }; }
  function ell(rx, ry) { return function (a) { return [rx * Math.cos(a), ry * Math.sin(a)]; }; }
  function star(r, k, amp) { return function (a) { var q = r * (1 + amp * Math.cos(k * a)); return [q * Math.cos(a), q * Math.sin(a)]; }; }
  function bean(r, bend) { return function (a) { var u = Math.cos(a), x = r * 1.4 * u, y = r * 0.7 * Math.sin(a); return [x, y + bend * r * (0.55 - u * u)]; }; }
  /* r : rayon, N : points (pair), k1 k2 k3 : raideurs, p : pression, a0 : gonflement de l'aire de repos */
  var BASE = [
    { r: 64, N: 34, pt: circ(64), k1: 0.28, k2: 0.15, k3: 0.02, p: 0.28, a0: 1.02, style: "rings" },
    { r: 46, N: 30, pt: bean(46, 0.5), k1: 0.2, k2: 0.1, k3: 0.01, p: 0.22, a0: 1.02, style: "solid" },
    { r: 42, N: 28, pt: bean(42, -0.45), k1: 0.2, k2: 0.1, k3: 0.01, p: 0.22, a0: 1.02, style: "hatch" },
    { r: 38, N: 28, pt: bean(38, 0.55), k1: 0.22, k2: 0.11, k3: 0.01, p: 0.24, a0: 1.03, style: "rings" },
    { r: 34, N: 24, pt: bean(34, 0.4), k1: 0.22, k2: 0.11, k3: 0.01, p: 0.24, a0: 1.02, style: "solid" },
    { r: 44, N: 30, pt: bean(44, -0.5), k1: 0.18, k2: 0.09, k3: 0.01, p: 0.2, a0: 1.02, style: "double" },
    { r: 32, N: 24, pt: bean(32, 0.45), k1: 0.22, k2: 0.11, k3: 0.01, p: 0.24, a0: 1.02, style: "hatch" },
    { r: 36, N: 26, pt: bean(36, -0.4), k1: 0.2, k2: 0.1, k3: 0.01, p: 0.22, a0: 1.02, style: "solid" },
    { r: 50, N: 30, pt: ell(1.35 * 50, 0.65 * 50), k1: 0.34, k2: 0.18, k3: 0.03, p: 0.32, a0: 1.02, style: "hatch" },
    { r: 46, N: 40, pt: star(46, 5, 0.24), k1: 0.38, k2: 0.2, k3: 0.04, p: 0.3, a0: 1.03, style: "dots" },
    { r: 28, N: 20, pt: circ(28), k1: 0.6, k2: 0.4, k3: 0.08, p: 0.6, a0: 1.08, style: "solid" },
    { r: 30, N: 22, pt: circ(30), k1: 0.2, k2: 0.1, k3: 0.01, p: 0.2, a0: 1.0, style: "double" },
    { r: 30, N: 24, pt: bean(30, 0.5), k1: 0.2, k2: 0.1, k3: 0.01, p: 0.22, a0: 1.02, style: "double" },
    { r: 26, N: 22, pt: bean(26, -0.45), k1: 0.22, k2: 0.11, k3: 0.01, p: 0.24, a0: 1.02, style: "solid" },
    { r: 20, N: 16, pt: circ(20), k1: 0.55, k2: 0.35, k3: 0.06, p: 0.55, a0: 1.06, style: "solid" },
    { r: 22, N: 16, pt: circ(22), k1: 0.5, k2: 0.3, k3: 0.05, p: 0.5, a0: 1.06, style: "rings" }
  ];
  /* les 38 variantes du kit : trois échelles pour les rangs pairs, deux pour les autres, avec un style qui tourne */
  var VARIANTS = (function () {
    var out = [];
    BASE.forEach(function (sp, idx) {
      [0.85, 0.72].concat(idx % 2 === 0 ? [0.6] : []).forEach(function (sc, v) {
        out.push({ sp: sp, sc: sc, style: v === 0 ? sp.style : STYLES[(STYLES.indexOf(sp.style) + v + (idx % 2)) % STYLES.length] });
      });
    });
    return out;
  })();

  /* ------------------------------------------------------------- construction */
  function areaOf(X, Y, N) { var i, nt, s = 0; for (i = 0; i < N; i++) { nt = (i + 1) % N; s += X[i] * Y[nt] - X[nt] * Y[i]; } return s * 0.5; }
  /* aire moyenne d'un corps à la taille 1, en unités du kit au carré (sert à borner le nombre de corps) */
  var MEAN_AREA = (function () {
    var s = 0;
    VARIANTS.forEach(function (v) {
      var N = v.sp.N, X = [], Y = [], i, q;
      for (i = 0; i < N; i++) { q = v.sp.pt(i / N * TAU); X.push(q[0] * v.sc); Y.push(q[1] * v.sc); }
      s += Math.abs(areaOf(X, Y, N));
    });
    return s / VARIANTS.length;
  })();

  /* phase de la cible qui se promène : au départ la cible est là où le corps a été posé, pour que le cadre soit rempli dès la première image */
  function phase(rand, v) { var a = clamp((v - 0.5) / 0.4, -1, 1) * Math.PI / 2; return rand() < 0.5 ? a : Math.PI - a; }
  /* onde triangulaire (de -1 à 1) : la cible passe autant de temps partout, donc les corps se répartissent sur tout le cadre */
  function tri(a) { return Math.asin(Math.sin(a)) * 0.6366197723675814; }

  function makeBody(spec, sz, x, y, rand, Wk, Hk) {
    var sp = spec.sp, N = sp.N, s = spec.s, i, a, pp, sx = new Float32Array(N), sy = new Float32Array(N), sp2, ang;
    var b = { N: N, sp: sp, style: spec.style, r0: sp.r * s, X: new Float32Array(N), Y: new Float32Array(N), PX: new Float32Array(N), PY: new Float32Array(N), L0: new Float32Array(N), L2: new Float32Array(N), LO: new Float32Array(N / 2) };
    for (i = 0; i < N; i++) { a = i / N * TAU; pp = sp.pt(a); sx[i] = pp[0] * s; sy[i] = pp[1] * s; }
    sp2 = 0.5 + rand() * 0.7; ang = rand() * TAU;
    for (i = 0; i < N; i++) {
      b.X[i] = x + sx[i] * sz; b.Y[i] = y + sy[i] * sz;
      b.PX[i] = b.X[i] - Math.cos(ang) * sp2; b.PY[i] = b.Y[i] - Math.sin(ang) * sp2;
    }
    /* longueurs de repos à la taille 1 : la simulation les multiplie par le réglage de taille à chaque pas */
    for (i = 0; i < N; i++) {
      b.L0[i] = Math.hypot(sx[(i + 1) % N] - sx[i], sy[(i + 1) % N] - sy[i]);
      b.L2[i] = Math.hypot(sx[(i + 2) % N] - sx[i], sy[(i + 2) % N] - sy[i]);
    }
    for (i = 0; i < N / 2; i++) b.LO[i] = Math.hypot(sx[i + N / 2] - sx[i], sy[i + N / 2] - sy[i]);
    b.A0 = Math.abs(areaOf(sx, sy, N)) * sp.a0;
    b.f1 = 0.05 + rand() * 0.09; b.f2 = 0.05 + rand() * 0.09; b.p1 = phase(rand, x / Wk); b.p2 = phase(rand, y / Hk);
    return b;
  }

  /* nombre de corps réel : le réglage vaut pour la surface du kit, il grandit avec l'écran jusqu'au plafond ;
     il est aussi borné pour que, à la taille maximale, les corps ne couvrent pas plus de FILL_MAX du cadre (sinon ils se tassent en paquet).
     Le plafond ne dépend pas de la taille courante : changer la taille ne reconstruit jamais le monde. */
  function bodiesFor(count, Wk, Hk) {
    var wanted = count * (Wk * Hk) / KAREA, room = FILL_MAX * Wk * Hk / (MEAN_AREA * SIZE_MAX * SIZE_MAX);
    return clamp(Math.round(Math.min(wanted, room)), 4, MAX_BODIES);
  }

  /* Wk, Hk : taille du monde en unités du kit ; u : pixels CSS par unité du kit */
  function build(seed, Wk, Hk, count, sz, u) {
    var rand = A.rng(seed + "|corps"), n = bodiesFor(count, Wk, Hk), V = VARIANTS.length;
    var perm = [], i, j, t, list = [], wrap, jit, v, bodies = [], placed = [], r, x, y, ok, tries, M = Math.min(18, Wk * 0.2, Hk * 0.2), w, total = 0, off = [];
    for (i = 0; i < V; i++) perm.push(i);
    for (i = V - 1; i > 0; i--) { j = (rand() * (i + 1)) | 0; t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
    for (i = 0; i < n; i++) {
      v = VARIANTS[perm[i % V]]; wrap = (i / V) | 0; jit = wrap ? 0.88 + 0.24 * rand() : 1;
      list.push({ sp: v.sp, s: v.sc * jit, style: wrap ? STYLES[(STYLES.indexOf(v.style) + wrap) % STYLES.length] : v.style });
    }
    /* les gros d'abord : ils trouvent plus facilement une place sans recouvrement */
    list.sort(function (a, b) { return b.sp.r * b.s - a.sp.r * a.s; });
    for (i = 0; i < n; i++) {
      r = list[i].sp.r * list[i].s * sz * 1.45;
      for (tries = 0; tries < 400; tries++) {
        x = M + r + rand() * Math.max(0, Wk - 2 * M - 2 * r); y = M + r + rand() * Math.max(0, Hk - 2 * M - 2 * r); ok = true;
        for (j = 0; j < placed.length; j++) if (Math.hypot(x - placed[j][0], y - placed[j][1]) < r + placed[j][2] + 4) { ok = false; break; }
        if (ok) break;
      }
      placed.push([x, y, r]);
      bodies.push(makeBody(list[i], sz, x, y, rand, Wk, Hk));
    }
    /* l'ordre de dessin ne suit pas la taille : on mélange pour que les petits passent parfois devant */
    for (i = bodies.length - 1; i > 0; i--) { j = (rand() * (i + 1)) | 0; t = bodies[i]; bodies[i] = bodies[j]; bodies[j] = t; }
    for (i = 0; i < bodies.length; i++) { off.push(total); total += bodies[i].N * 2; }
    w = {
      B: bodies, n: bodies.length, u: u, Wk: Wk, Hk: Hk, wl: M, wr: Wk - M, wt: M, wb: Hk - M, t: 0, steps: 0, acc: 0, kickIn: 120, rand: rand, noise: A.noise(seed + "|bruit"),
      cx: new Float64Array(bodies.length), cy: new Float64Array(bodies.length), cr: new Float64Array(bodies.length), bb: new Float64Array(bodies.length * 4),
      off: off, snaps: [], head: 0, count: 0
    };
    for (i = 0; i < SNAP_N; i++) w.snaps.push(new Float32Array(total));
    return w;
  }

  /* la fenêtre change de taille mais pas le reste : chaque corps garde sa place relative dans le cadre au lieu de repartir de zéro */
  function rescale(w, Wk, Hk, u) {
    var fx = Wk / w.Wk, fy = Hk / w.Hk, M = Math.min(18, Wk * 0.2, Hk * 0.2), bi, b, i, mx, my, dx, dy, m;
    for (bi = 0; bi < w.n; bi++) {
      b = w.B[bi]; mx = 0; my = 0;
      for (i = 0; i < b.N; i++) { mx += b.X[i]; my += b.Y[i]; }
      mx /= b.N; my /= b.N; m = b.r0 * 1.3;
      dx = clamp(mx * fx, M + m, Math.max(M + m, Wk - M - m)) - mx; dy = clamp(my * fy, M + m, Math.max(M + m, Hk - M - m)) - my;
      for (i = 0; i < b.N; i++) { b.X[i] += dx; b.PX[i] += dx; b.Y[i] += dy; b.PY[i] += dy; }
    }
    w.Wk = Wk; w.Hk = Hk; w.u = u; w.wl = M; w.wr = Wk - M; w.wt = M; w.wb = Hk - M;
    w.count = 0; w.steps = 0;   /* les poses gardées ne correspondent plus à la nouvelle taille */
  }

  /* ---------------------------------------------------------------- physique */
  function pull(X, Y, i, j, rest, k) {
    var dx = X[j] - X[i], dy = Y[j] - Y[i], d = Math.sqrt(dx * dx + dy * dy) || 1e-6, df = (d - rest) / d * 0.5 * k;
    X[i] += dx * df; Y[i] += dy * df; X[j] -= dx * df; Y[j] -= dy * df;
  }
  /* centre, rayon moyen et boîte englobante de chaque corps */
  function measure(w) {
    var B = w.B, bi, b, i, N, X, Y, mx, my, r, dx, dy, x0, x1, y0, y1;
    for (bi = 0; bi < B.length; bi++) {
      b = B[bi]; N = b.N; X = b.X; Y = b.Y; mx = 0; my = 0; x0 = 1e9; x1 = -1e9; y0 = 1e9; y1 = -1e9;
      for (i = 0; i < N; i++) { mx += X[i]; my += Y[i]; if (X[i] < x0) x0 = X[i]; if (X[i] > x1) x1 = X[i]; if (Y[i] < y0) y0 = Y[i]; if (Y[i] > y1) y1 = Y[i]; }
      mx /= N; my /= N; r = 0;
      for (i = 0; i < N; i++) { dx = X[i] - mx; dy = Y[i] - my; r += Math.sqrt(dx * dx + dy * dy); }
      w.cx[bi] = mx; w.cy[bi] = my; w.cr[bi] = r / N; w.bb[bi * 4] = x0; w.bb[bi * 4 + 1] = y0; w.bb[bi * 4 + 2] = x1; w.bb[bi * 4 + 3] = y1;
    }
  }
  /* les points de a qui sont entrés dans b sont repoussés vers le bord le plus proche de b */
  function collide(a, b, x0, y0, x1, y1) {
    var N = a.N, M = b.N, aX = a.X, aY = a.Y, bX = b.X, bY = b.Y, i, j, jj, k, px, py, inside, best, bj, cx, cy, ex, ey, el, tt, dx, dy, d2, qx, qy;
    for (i = 0; i < N; i++) {
      px = aX[i]; py = aY[i];
      if (px < x0 || px > x1 || py < y0 || py > y1) continue;
      inside = false;
      for (j = 0, jj = M - 1; j < M; jj = j++) if (((bY[j] > py) !== (bY[jj] > py)) && (px < (bX[jj] - bX[j]) * (py - bY[j]) / (bY[jj] - bY[j]) + bX[j])) inside = !inside;
      if (!inside) continue;
      best = 1e18; bj = 0; cx = 0; cy = 0;
      for (j = 0; j < M; j++) {
        k = j + 1 === M ? 0 : j + 1; ex = bX[k] - bX[j]; ey = bY[k] - bY[j]; el = ex * ex + ey * ey || 1e-6;
        tt = ((px - bX[j]) * ex + (py - bY[j]) * ey) / el; tt = tt < 0 ? 0 : tt > 1 ? 1 : tt; qx = bX[j] + ex * tt; qy = bY[j] + ey * tt;
        dx = qx - px; dy = qy - py; d2 = dx * dx + dy * dy;
        if (d2 < best) { best = d2; bj = j; cx = qx; cy = qy; }
      }
      dx = (cx - px) * 1.08; dy = (cy - py) * 1.08; k = bj + 1 === M ? 0 : bj + 1;
      aX[i] += dx * 0.5; aY[i] += dy * 0.5;
      bX[bj] -= dx * 0.25; bY[bj] -= dy * 0.25; bX[k] -= dx * 0.25; bY[k] -= dy * 0.25;
    }
  }
  /* un pas de simulation (1/60 s), avec les réglages courants : tous sont lus ici, à chaque pas */
  function stepWorld(w, p) {
    var B = w.B, n = w.n, t = w.t, noise = w.noise, sz = clamp(p.size, 0.6, SIZE_MAX), sz2 = sz * sz, stiff = p.soft, cap = p.speed, wan = p.wander, pl = p.pull * 1e-5, Wk = w.Wk, Hk = w.Hk;
    var wl = w.wl, wr = w.wr, wt = w.wt, wb = w.wb, cx = w.cx, cy = w.cy, cr = w.cr, bb = w.bb, bi, bj, b, i, it, N, X, Y, PX, PY, vx, vy, sp, ax, ay, mx, my;
    var area, per, pr, nt, pv, nx, ny, nl, dx, dy, lim, k1, k2, k3, L0, L2, LO, half, kick, a, bd;
    /* intégration de Verlet : amortissement, plafond de vitesse, rappel vers une cible lente, un peu de bruit */
    for (bi = 0; bi < n; bi++) {
      b = B[bi]; N = b.N; X = b.X; Y = b.Y; PX = b.PX; PY = b.PY; mx = 0; my = 0;
      for (i = 0; i < N; i++) { mx += X[i]; my += Y[i]; }
      mx /= N; my /= N;
      ax = (Wk * (0.5 + wan * tri(t * b.f1 + b.p1)) - mx) * pl; ay = (Hk * (0.5 + wan * tri(t * b.f2 + b.p2)) - my) * pl;
      for (i = 0; i < N; i++) {
        vx = (X[i] - PX[i]) * 0.9985; vy = (Y[i] - PY[i]) * 0.9985; sp = Math.sqrt(vx * vx + vy * vy);
        if (sp > cap) { vx *= cap / sp; vy *= cap / sp; }
        PX[i] = X[i]; PY[i] = Y[i];
        X[i] += vx + ax + noise(X[i] * 0.005 + t * 0.06, Y[i] * 0.005) * SWIRL;
        Y[i] += vy + ay + noise(X[i] * 0.005 + 20, Y[i] * 0.005 + t * 0.06) * SWIRL;
      }
    }
    for (it = 0; it < 6; it++) {
      for (bi = 0; bi < n; bi++) {
        b = B[bi]; N = b.N; half = N >> 1; X = b.X; Y = b.Y; L0 = b.L0; L2 = b.L2; LO = b.LO; sp = b.sp;
        k1 = Math.min(sp.k1 * stiff, 0.9); k2 = Math.min(sp.k2 * stiff, 0.9); k3 = Math.min(sp.k3 * stiff, 0.9);
        for (i = 0; i < N; i++) { pull(X, Y, i, i + 1 === N ? 0 : i + 1, L0[i] * sz, k1); pull(X, Y, i, (i + 2) % N, L2[i] * sz, k2); }
        for (i = 0; i < half; i++) pull(X, Y, i, i + half, LO[i] * sz, k3);
        area = 0; per = 0;
        for (i = 0; i < N; i++) { nt = i + 1 === N ? 0 : i + 1; area += X[i] * Y[nt] - X[nt] * Y[i]; dx = X[nt] - X[i]; dy = Y[nt] - Y[i]; per += Math.sqrt(dx * dx + dy * dy); }
        pr = (b.A0 * sz2 - area * 0.5) / (per || 1) * sp.p;
        for (i = 0; i < N; i++) {
          pv = i === 0 ? N - 1 : i - 1; nt = i + 1 === N ? 0 : i + 1; nx = Y[nt] - Y[pv]; ny = -(X[nt] - X[pv]); nl = Math.sqrt(nx * nx + ny * ny) || 1;
          X[i] += nx / nl * pr; Y[i] += ny / nl * pr;
        }
      }
      measure(w);
      for (bi = 0; bi < n - 1; bi++) for (bj = bi + 1; bj < n; bj++) {
        dx = cx[bi] - cx[bj]; dy = cy[bi] - cy[bj]; lim = (cr[bi] + cr[bj]) * 1.9;
        if (dx * dx + dy * dy > lim * lim) continue;
        collide(B[bi], B[bj], bb[bj * 4], bb[bj * 4 + 1], bb[bj * 4 + 2], bb[bj * 4 + 3]);
        collide(B[bj], B[bi], bb[bi * 4], bb[bi * 4 + 1], bb[bi * 4 + 2], bb[bi * 4 + 3]);
      }
      for (bi = 0; bi < n; bi++) {
        b = B[bi]; X = b.X; Y = b.Y;
        for (i = 0; i < b.N; i++) { X[i] = clamp(X[i], wl, wr); Y[i] = clamp(Y[i], wt, wb); }
      }
    }
    /* rebond sur les parois : la vitesse qui y entre est renvoyée à 75 % */
    for (bi = 0; bi < n; bi++) {
      b = B[bi]; X = b.X; Y = b.Y; PX = b.PX; PY = b.PY;
      for (i = 0; i < b.N; i++) {
        vx = X[i] - PX[i]; vy = Y[i] - PY[i];
        if (X[i] <= wl + 1e-3 && vx < 0) PX[i] = X[i] + vx * 0.75;
        if (X[i] >= wr - 1e-3 && vx > 0) PX[i] = X[i] + vx * 0.75;
        if (Y[i] <= wt + 1e-3 && vy < 0) PY[i] = Y[i] + vy * 0.75;
        if (Y[i] >= wb - 1e-3 && vy > 0) PY[i] = Y[i] + vy * 0.75;
      }
    }
    /* de temps en temps, un corps reçoit une pichenette dans une direction au hasard (plus souvent s'il y en a beaucoup) */
    w.kickIn -= 1;
    if (w.kickIn <= 0) {
      w.kickIn += clamp(200 * 38 / n, 45, 400); kick = KICK; bd = B[(w.rand() * n) | 0]; a = w.rand() * TAU;
      for (i = 0; i < bd.N; i++) { bd.PX[i] -= Math.cos(a) * kick; bd.PY[i] -= Math.sin(a) * kick; }
    }
    w.t += 1 / 60;
  }
  function snap(w) {
    var s = w.snaps[w.head], bi, b, o;
    for (bi = 0; bi < w.n; bi++) { b = w.B[bi]; o = w.off[bi]; s.set(b.X, o); s.set(b.Y, o + b.N); }
    w.head = (w.head + 1) % SNAP_N; if (w.count < SNAP_N) w.count++;
  }
  function nowMs() { return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now(); }
  function advance(w, p, n) {
    while (n-- > 0) { stepWorld(w, p); w.steps++; if (w.steps % SNAP_EVERY === 0) snap(w); }
  }
  /* faux si un point est sorti du monde ou n'est plus un nombre : on repart de zéro plutôt que de dessiner n'importe quoi */
  function healthy(w) {
    var bi, b;
    for (bi = 0; bi < w.n; bi++) { b = w.B[bi]; if (!(Math.abs(b.X[0]) < 1e5 && Math.abs(b.Y[0]) < 1e5)) return false; }
    return true;
  }

  /* ------------------------------------------------------------------ dessin */
  /* contour lissé d'un corps : courbes quadratiques passant par les milieux des segments, à l'échelle sc autour de (cx, cy) */
  function trace(ctx, X, ox, Y, oy, N, sc, cx, cy) {
    var i, a, xi, yi;
    ctx.moveTo(cx + ((X[ox + N - 1] + X[ox]) / 2 - cx) * sc, cy + ((Y[oy + N - 1] + Y[oy]) / 2 - cy) * sc);
    for (i = 0; i < N; i++) {
      a = i + 1 === N ? 0 : i + 1; xi = X[ox + i]; yi = Y[oy + i];
      ctx.quadraticCurveTo(cx + (xi - cx) * sc, cy + (yi - cy) * sc, cx + ((xi + X[ox + a]) / 2 - cx) * sc, cy + ((yi + Y[oy + a]) / 2 - cy) * sc);
    }
    ctx.closePath();
  }
  function outline(ctx, b, sc, cx, cy) { ctx.beginPath(); trace(ctx, b.X, 0, b.Y, 0, b.N, sc, cx, cy); }

  /* les poses passées en traits très pâles, des plus anciennes aux plus récentes : l'exposition multiple de la planche imprimée */
  function ghosts(ctx, w, wt) {
    var s, bi, idx, S, o, b, frac, cnt = w.count;
    ctx.lineWidth = 0.9 * wt;
    for (s = 0; s < cnt; s++) {
      idx = (w.head - cnt + s + SNAP_N * 2) % SNAP_N; S = w.snaps[idx]; frac = (s + 1) / cnt;
      ctx.globalAlpha = 0.03 + 0.08 * frac; ctx.beginPath();
      for (bi = 0; bi < w.n; bi++) { b = w.B[bi]; o = w.off[bi]; trace(ctx, S, o, S, o + b.N, b.N, 1, w.cx[bi], w.cy[bi]); }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function paint(rr, w, p, print) {
    var ctx = rr.ctx, ink = A.inkCss(1), wt = p.weight, fill = p.fill, B = w.B, bi, b, N, X, Y, i, k, mx, my, x0, y0, x1, y1, st, h0, hx, hy, pts = [-2, -1, 0, 1, 2], kx, sc;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, rr.cv.width, rr.cv.height);
    ctx.setTransform(rr.k * w.u, 0, 0, rr.k * w.u, 0, 0);
    ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.strokeStyle = ink; ctx.fillStyle = ink;
    measure(w);
    if (print && w.count > 1) ghosts(ctx, w, wt);
    for (bi = 0; bi < B.length; bi++) {
      b = B[bi]; N = b.N; X = b.X; Y = b.Y; mx = w.cx[bi]; my = w.cy[bi]; st = b.style;
      if (st === "rings") {
        outline(ctx, b, 1, mx, my); ctx.globalAlpha = 0.12 * fill; ctx.fill();
        for (k = 0; k < 5; k++) { outline(ctx, b, 1 - 0.15 * k, mx, my); ctx.globalAlpha = 0.9 - 0.15 * k; ctx.lineWidth = (2 - 0.3 * k) * wt; ctx.stroke(); }
      } else if (st === "solid") {
        outline(ctx, b, 1, mx, my); ctx.globalAlpha = 0.9 * fill; ctx.fill(); ctx.globalAlpha = 0.9; ctx.lineWidth = 1.6 * wt; ctx.stroke();
      } else if (st === "hatch") {
        x0 = w.bb[bi * 4]; y0 = w.bb[bi * 4 + 1]; x1 = w.bb[bi * 4 + 2]; y1 = w.bb[bi * 4 + 3];
        ctx.save(); outline(ctx, b, 1, mx, my); ctx.clip();
        ctx.globalAlpha = 0.55; ctx.lineWidth = wt; ctx.beginPath();
        for (kx = -(y1 - y0); kx < x1 - x0; kx += 6) { ctx.moveTo(x0 + kx, y0); ctx.lineTo(x0 + kx + (y1 - y0), y1); }
        ctx.stroke(); ctx.restore();
        outline(ctx, b, 1, mx, my); ctx.globalAlpha = 0.9; ctx.lineWidth = 1.7 * wt; ctx.stroke();
      } else if (st === "dots") {
        outline(ctx, b, 1, mx, my); ctx.globalAlpha = 0.9; ctx.lineWidth = 3.2 * wt; ctx.setLineDash([0.1, 7]); ctx.stroke(); ctx.setLineDash([]);
        outline(ctx, b, 0.66, mx, my); ctx.lineWidth = 1.2 * wt; ctx.stroke();
      } else {
        outline(ctx, b, 1, mx, my); ctx.globalAlpha = 0.9; ctx.lineWidth = 1.8 * wt; ctx.stroke(); outline(ctx, b, 0.84, mx, my); ctx.lineWidth = 0.9 * wt; ctx.stroke();
        ctx.beginPath(); ctx.arc(mx, my, 2.6, 0, TAU); ctx.fill();
      }
      /* un reflet découpé dans l'encre */
      if (st === "rings" || st === "solid") {
        ctx.globalCompositeOperation = "destination-out"; ctx.globalAlpha = 0.95; ctx.strokeStyle = "#000";
        ctx.lineWidth = (b.r0 > 60 ? 4 : b.r0 > 28 ? 3 : 2) * wt; ctx.beginPath(); h0 = Math.round(N * 0.6);
        for (k = 0; k < pts.length; k++) { i = (h0 + pts[k] + N) % N; hx = mx + (X[i] - mx) * 0.72; hy = my + (Y[i] - my) * 0.72; if (k === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy); }
        ctx.stroke(); ctx.globalCompositeOperation = "source-over"; ctx.strokeStyle = ink;
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ------------------------------------------------------------ enregistrement */
  BgGen.register({
    id: "jellies", kit: "12", group: "Corps et foules", label: "Corps mous", int: 0.7,
    note: "Une quarantaine de corps mous, presque sans pesanteur, qui se rencontrent doucement et repartent. La planche 12.",
    params: [
      range("count", "Nombre de corps", 8, 60, 2, 40, "", false), range("size", "Taille des corps", 0.6, SIZE_MAX, 0.05, 1), range("soft", "Fermeté des ressorts", 0.5, 1.6, 0.05, 1),
      /* brassage : la valeur du kit est 4 (4e-5) ; 12 répartit mieux les corps sur tout le cadre (mesuré sur 6 graines et 2 minutes) */
      range("speed", "Vitesse maximale", 0.3, 2.2, 0.05, 1.1), range("wander", "Étendue de la dérive", 0, 0.45, 0.01, 0.4), range("pull", "Brassage", 0, 60, 1, 12),
      range("weight", "Épaisseur du trait", 0.5, 2.2, 0.05, 1), range("fill", "Corps pleins", 0, 1, 0.05, 0.45)
    ],
    mount: function (S, api) {
      var cur = S, world = null, key = "", seedKey = "", r;
      /* le monde est refait si le seed ou le nombre de corps changent ; si seule la taille de l'écran change (sans écart de plus d'un cinquième sur le nombre de corps), les corps sont replacés */
      function ensure(rr) {
        var p = cur.p, W = rr.w, H = rr.h, k = [cur.seed, p.count, W, H].join("|"), sk = cur.seed + "|" + p.count, u, Wk, Hk;
        if (world && k === key) return world;
        u = clamp(Math.pow(Math.sqrt(W * H / KAREA), 0.75), 0.8, 2.6); Wk = W / u; Hk = H / u;
        if (world && sk === seedKey && Math.abs(bodiesFor(p.count, Wk, Hk) - world.n) <= Math.max(3, world.n * 0.2)) rescale(world, Wk, Hk, u);
        else world = build(String(cur.seed), Wk, Hk, p.count, clamp(p.size, 0.6, SIZE_MAX), u);
        key = k; seedKey = sk;
        return world;
      }
      r = api.runner(api.host, {
        maxDpr: 1.25,
        resize: function (rr) { ensure(rr); },
        frame: function (rr, dt) {
          var p = cur.p, w = ensure(rr), n, t0, warm = false;
          if (cur.live) {
            w.acc += Math.min(dt, 0.1) * 60; n = Math.min(Math.floor(w.acc), 3); w.acc -= Math.floor(w.acc);
            advance(w, p, n);
          } else if (w.steps < PRINT) {
            /* image figée : la simulation est avancée par petits paquets (au plus 16 pas et environ 6 ms par image), pour ne jamais bloquer une image,
               puis on s'arrête sur l'exposition multiple. Le total reste de PRINT pas. */
            t0 = nowMs(); n = 0;
            do { advance(w, p, Math.min(2, PRINT - w.steps)); n += 2; } while (w.steps < PRINT && n < 16 && nowMs() - t0 < 6);
            if (w.steps < PRINT) { rr.dirty = true; warm = true; }
          }
          if (!healthy(w)) { world = null; w = ensure(rr); }
          /* pendant le préchauffage on ne trace pas l'exposition multiple (coûteuse) : elle apparaît à la dernière image */
          paint(rr, w, p, !cur.live && !warm);
        }
      });
      r.paused = !S.live; r.dirty = true;   /* démarrage en pause : une image figée, sans boucle d'animation */
      return {
        update: function (S) { cur = S; r.paused = !S.live; r.dirty = true; },
        destroy: r.destroy,
        recolor: function () { r.redraw(); },
        png: function () { return r.cv; }
      };
    },
    code: function (S) { return JSON.stringify({ systeme: "corps-mous", planche: 12, seed: S.seed, params: S.p }); }
  });
})();

/* ---- gen-types/metaballs.js */
/* Métaballes : la planche 13 en contours (marching squares sur une grille réduite, boules ombrées au crayon)
   et la planche 27 en aplats d'encre très pâles, pensés pour rester derrière du texte.
   Les deux entrées partagent le même champ : chaque boule ajoute (1 - d²)² à la feuille, le total est seuillé. */
(function () {
  "use strict";
  var A = BgGen.api, TAU = A.TAU, clamp = A.clamp, smooth = A.smooth, css = A.css, doc = document;
  var range = BgGen.range, toggle = BgGen.toggle;

  /* niveaux de contour du kit (hauteurs du champ) ; le trait fort est le troisième */
  var LEVELS = [0.07, 0.13, 0.25, 0.4, 0.58, 0.8, 1.06, 1.4, 1.8], NL = LEVELS.length, OUT = 2;
  /* quelles boules sont ombrées au crayon : 1, 4 et 6 d'abord, comme dans le kit */
  var SHADE_ORDER = [1, 4, 6, 3, 0, 7, 2, 5, 8, 9, 10, 11, 12, 13, 14, 15];

  /* une unité du kit (planche de 600 x 750) en pixels : échelle uniforme, à surface égale, donc jamais d'étirement */
  function unit(w, h) { return Math.sqrt(w * h / 450000); }

  /* ------------------------------------------------------------------ boules */
  /* positions en fractions de l'écran, rayons en unités du kit : le dessin remplit tous les formats.
     Chaque centre est le meilleur de sept tirages (le plus loin des boules déjà placées) : le cadre est couvert sans amas ni grand trou,
     et ajouter une boule ne déplace pas les précédentes. */
  function makeBlobs(seed, n, big) {
    var q = A.rng(seed), B = [], i, k, j, x, y, d, bd, bx, by, dx, dy;
    for (i = 0; i < n; i++) {
      bd = -1; bx = 0; by = 0;
      for (k = 0; k < 7; k++) {
        x = q(); y = q(); d = 9;
        /* distance sur un tore : sinon le meilleur tirage file toujours vers les bords et le centre reste vide */
        for (j = 0; j < i; j++) { dx = Math.abs(x - 0.5 - B[j].fx); dy = Math.abs(y - 0.5 - B[j].fy); if (dx > 0.5) dx = 1 - dx; if (dy > 0.5) dy = 1 - dy; d = Math.min(d, Math.hypot(dx, dy)); }
        if (d > bd) { bd = d; bx = x - 0.5; by = y - 0.5; }
      }
      if (big) B.push({ fx: bx, fy: by, ax: (40 + q() * 70) / 600, ay: (50 + q() * 90) / 750, w1: 0.07 + q() * 0.08, w2: 0.06 + q() * 0.08, p1: q() * TAU, p2: q() * TAU, R: 120 + q() * 70, pw: 0, pp: 0, pa: 0, x: 0, y: 0, r: 0 });
      else B.push({ fx: bx, fy: by, ax: (50 + q() * 60) / 600, ay: (60 + q() * 80) / 750, w1: 0.1 + q() * 0.14, w2: 0.09 + q() * 0.14, p1: q() * TAU, p2: q() * TAU, R: 88 + q() * 44, pw: 0.3 + q() * 0.3, pp: q() * TAU, pa: 0.08, x: 0, y: 0, r: 0 });
    }
    return B;
  }

  /* place les boules à l'instant tm. Tout est continu en size, spread et reach : aucune boule ne saute quand on les change. */
  function moveBlobs(B, n, tm, W, H, u, size, spread, reach) {
    var k, b;
    for (k = 0; k < n; k++) {
      b = B[k];
      b.x = W / 2 + b.fx * W * spread + b.ax * W * reach * Math.sin(tm * b.w1 + b.p1);
      b.y = H / 2 + b.fy * H * spread + b.ay * H * reach * Math.cos(tm * b.w2 + b.p2);
      b.r = b.R * u * size * (1 + b.pa * Math.sin(tm * b.pw + b.pp));
    }
  }

  /* somme des champs (1 - d²)² sur la grille ; off = 0,5 place l'échantillon au centre du pixel */
  function accumulate(f, gw, gh, cs, B, n, off) {
    var k, b, r, inv, x0, x1, y0, y1, i, j, qx, qy, d2, q, row;
    f.fill(0);
    for (k = 0; k < n; k++) {
      b = B[k]; r = b.r; inv = 1 / (r * r);
      x0 = Math.max(0, Math.floor((b.x - r) / cs - off)); x1 = Math.min(gw - 1, Math.ceil((b.x + r) / cs - off));
      y0 = Math.max(0, Math.floor((b.y - r) / cs - off)); y1 = Math.min(gh - 1, Math.ceil((b.y + r) / cs - off));
      for (j = y0; j <= y1; j++) {
        qy = (j + off) * cs - b.y; qy *= qy; row = j * gw;
        for (i = x0; i <= x1; i++) {
          qx = (i + off) * cs - b.x; d2 = (qx * qx + qy) * inv;
          if (d2 < 1) { q = 1 - d2; f[row + i] += q * q; }
        }
      }
    }
  }

  /* encre : relue au montage et à chaque changement de thème (recolor) */
  function rgbNow() { var c = A.ink(); return [c[0], c[1], c[2]]; }

  /* ------------------------------------------------------- 13 : contours */
  /* segments des contours : un tampon par niveau, réutilisé d'une image à l'autre (aucune allocation dans la boucle) */
  var SEGS = [], CNT = new Int32Array(NL), CAP = 11000 * 4, E8 = new Float32Array(8), i0;
  for (i0 = 0; i0 < NL; i0++) SEGS.push(new Float32Array(2048));
  function put(k, x1, y1, x2, y2) {
    var a = SEGS[k], n = CNT[k], b;
    if (n + 4 > a.length) {
      if (n + 4 > CAP) return;
      b = new Float32Array(Math.min(CAP, a.length * 2)); b.set(a); SEGS[k] = a = b;
    }
    a[n] = x1; a[n + 1] = y1; a[n + 2] = x2; a[n + 3] = y2; CNT[k] = n + 4;
  }

  /* marching squares : la table de cas de la planche, une paire de segments par cellule au plus (deux dans le cas ambigu) */
  function march(f, gw, gh, cs, lv) {
    var i, j, k, a, b, c, d, mn, mx, L, idx, x, y, row, e = E8, s1, s2, s3, s4, l0 = lv[0];
    for (k = 0; k < NL; k++) CNT[k] = 0;
    for (j = 0; j < gh - 1; j++) {
      row = j * gw; y = j * cs;
      for (i = 0; i < gw - 1; i++) {
        a = f[row + i]; b = f[row + i + 1]; c = f[row + gw + i + 1]; d = f[row + gw + i];
        mx = a > b ? a : b; if (c > mx) mx = c; if (d > mx) mx = d;
        if (mx < l0) continue;
        mn = a < b ? a : b; if (c < mn) mn = c; if (d < mn) mn = d;
        x = i * cs;
        for (k = 0; k < NL; k++) {
          L = lv[k]; if (L > mx) break; if (L < mn) continue;
          idx = (a > L ? 8 : 0) | (b > L ? 4 : 0) | (c > L ? 2 : 0) | (d > L ? 1 : 0);
          if (idx === 0 || idx === 15) continue;
          e[0] = x + cs * (L - a) / (b - a); e[1] = y; e[2] = x + cs; e[3] = y + cs * (L - b) / (c - b);
          e[4] = x + cs * (L - d) / (c - d); e[5] = y + cs; e[6] = x; e[7] = y + cs * (L - a) / (d - a);
          s1 = -1; s2 = -1; s3 = -1; s4 = -1;
          switch (idx) {
            case 1: case 14: s1 = 3; s2 = 2; break;
            case 2: case 13: s1 = 2; s2 = 1; break;
            case 3: case 12: s1 = 3; s2 = 1; break;
            case 4: case 11: s1 = 0; s2 = 1; break;
            case 5: s1 = 0; s2 = 3; s3 = 2; s4 = 1; break;
            case 6: case 9: s1 = 0; s2 = 2; break;
            case 7: case 8: s1 = 0; s2 = 3; break;
            case 10: s1 = 0; s2 = 1; s3 = 3; s4 = 2; break;
          }
          put(k, e[s1 * 2], e[s1 * 2 + 1], e[s2 * 2], e[s2 * 2 + 1]);
          if (s3 >= 0) put(k, e[s3 * 2], e[s3 * 2 + 1], e[s4 * 2], e[s4 * 2 + 1]);
        }
      }
    }
  }

  /* une boule pleine au crayon : efface ce qui est derrière, lavis côté ombre, hachures dans l'ombre la plus profonde */
  function ball(ctx, x, y, r, s, wt, rgb, dark) {
    var g, sp, k, hz;
    if (r < 1.2) return;
    ctx.save();
    ctx.globalCompositeOperation = "destination-out"; ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    g = ctx.createRadialGradient(x - 0.42 * r, y - 0.5 * r, r * 0.1, x - 0.15 * r, y - 0.18 * r, r * 1.35);
    /* sur papier clair le lavis est côté ombre ; sur fond sombre l'encre est de la lumière, elle se met côté éclairé */
    if (dark) { g.addColorStop(0, css(rgb, 0.3)); g.addColorStop(0.4, css(rgb, 0.17)); g.addColorStop(0.7, css(rgb, 0.04)); g.addColorStop(1, css(rgb, 0)); }
    else { g.addColorStop(0, css(rgb, 0)); g.addColorStop(0.4, css(rgb, 0.02)); g.addColorStop(0.7, css(rgb, 0.17)); g.addColorStop(1, css(rgb, 0.42)); }
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    hz = smooth(7, 11, r);
    if (hz > 0.01) {
      ctx.save();
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.clip();
      ctx.beginPath(); ctx.rect(x - 2 * r, y - 2 * r, 4 * r, 4 * r); ctx.arc(x - 0.24 * r, y - 0.3 * r, r * 1.04, 0, TAU); ctx.clip("evenodd");
      sp = Math.max(2.6 * s, r / 8);
      ctx.strokeStyle = css(rgb, 0.6 * hz); ctx.lineWidth = 0.6 * s * wt; ctx.beginPath();
      for (k = 0.5 * r; k < 1.5 * r; k += sp) { ctx.moveTo(x + k / 2 - 1.2 * r, y + k / 2 + 1.2 * r); ctx.lineTo(x + k / 2 + 1.2 * r, y + k / 2 - 1.2 * r); }
      ctx.stroke();
      ctx.restore();
    }
    ctx.strokeStyle = css(rgb, 0.92); ctx.lineWidth = 1.1 * s * wt; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    ctx.strokeStyle = css(rgb, 0.3); ctx.lineWidth = 0.5 * s * wt; ctx.beginPath(); ctx.arc(x + 0.5, y + 0.4, Math.max(0.5, r - 0.3), 0, TAU); ctx.stroke();
    ctx.restore();
  }

  /* chaîne des segments en polylignes (export vectoriel seulement : les extrémités communes se retrouvent par leurs coordonnées) */
  function chain(a, n) {
    var ns = n >> 2, ends = new Map(), used = new Uint8Array(ns), lines = [], s, e, k, l, L, R, id, o, last;
    function key(x, y) { return Math.round(x * 10) * 100003 + Math.round(y * 10); }
    function take(x, y) {
      var li = ends.get(key(x, y)), q;
      if (!li) return -1;
      for (q = 0; q < li.length; q++) if (!used[li[q] >> 1]) return li[q];
      return -1;
    }
    for (s = 0; s < ns; s++) for (e = 0; e < 2; e++) { k = key(a[s * 4 + e * 2], a[s * 4 + e * 2 + 1]); l = ends.get(k); if (!l) ends.set(k, l = []); l.push(s * 2 + e); }
    for (s = 0; s < ns; s++) {
      if (used[s]) continue; used[s] = 1;
      L = [[a[s * 4], a[s * 4 + 1]], [a[s * 4 + 2], a[s * 4 + 3]]]; R = [];
      for (;;) { last = L[L.length - 1]; id = take(last[0], last[1]); if (id < 0) break; used[id >> 1] = 1; o = (id & 1) ^ 1; L.push([a[(id >> 1) * 4 + o * 2], a[(id >> 1) * 4 + o * 2 + 1]]); }
      for (;;) { last = R.length ? R[R.length - 1] : L[0]; id = take(last[0], last[1]); if (id < 0) break; used[id >> 1] = 1; o = (id & 1) ^ 1; R.push([a[(id >> 1) * 4 + o * 2], a[(id >> 1) * 4 + o * 2 + 1]]); }
      lines.push(R.length ? R.reverse().concat(L) : L);
    }
    return lines;
  }

  function linesType(id, kit, label, note, intensity, p) {
    return {
      id: id, kit: kit, group: "Formes et lumière", label: label, note: note, int: intensity,
      params: [
        range("blobs", "Nombre de boules", 3, 14, 1, p.blobs, "", false),
        range("size", "Taille des boules", 0.6, 1.6, 0.05, p.size),
        range("spread", "Étalement", 0.3, 1.3, 0.05, p.spread),
        range("reach", "Amplitude du mouvement", 0, 2, 0.05, p.reach),
        range("speed", "Vitesse", 0, 3, 0.05, p.speed),
        range("gap", "Écart des contours", 0.6, 1.8, 0.05, p.gap),
        range("weight", "Épaisseur du trait", 0.4, 2.5, 0.05, p.weight),
        range("balls", "Boules ombrées", 0, 6, 1, p.balls, "", false)
      ],
      mount: function (S, api) {
        var cur = S, r, B = null, bkey = "", rgb = rgbNow(), dark = A.isDark(), tm = 9, lastT = 0, W = 2, H = 2, u = 1, cs = 4, gw = 2, gh = 2, f = new Float32Array(4), lv = new Float64Array(NL), shaded = new Uint8Array(16);
        function setup(rr) {
          W = rr.w; H = rr.h; u = unit(W, H); cs = clamp(u * 2.6, 4, 8);
          gw = Math.ceil(W / cs) + 1; gh = Math.ceil(H / cs) + 1; f = new Float32Array(gw * gh);
        }
        /* calcule les segments à l'instant courant : sert à l'image et à l'export vectoriel */
        function build() {
          var q = cur.p, n = Math.round(q.blobs), k, nb = Math.round(q.balls), key = String(cur.seed) + "|" + n;
          if (key !== bkey) { B = makeBlobs(cur.seed, n, false); bkey = key; }
          moveBlobs(B, n, tm, W, H, u * 1.3, q.size, q.spread, q.reach);
          accumulate(f, gw, gh, cs, B, n, 0);
          for (k = 0; k < NL; k++) lv[k] = LEVELS[k] * q.gap;
          march(f, gw, gh, cs, lv);
          for (k = 0; k < 16; k++) shaded[k] = 0;
          for (k = 0; k < SHADE_ORDER.length && nb > 0; k++) if (SHADE_ORDER[k] < n) { shaded[SHADE_ORDER[k]] = 1; if (--nb === 0) break; }
        }
        function lineScale() { return clamp(0.6 + 0.45 * u, 1, 2); }
        r = api.runner(api.host, {
          maxDpr: 1.5, resize: setup,
          frame: function (rr) {
            var q = cur.p, ctx = rr.ctx, s = lineScale(), wt = q.weight, n = Math.round(q.blobs), k, j, a, m, b, c;
            tm += (rr.t - lastT) * q.speed; lastT = rr.t;
            build();
            ctx.setTransform(rr.k, 0, 0, rr.k, 0, 0); ctx.clearRect(0, 0, rr.w, rr.h);
            ctx.lineCap = "round"; ctx.lineJoin = "round";
            for (k = 0; k < NL; k++) {
              m = CNT[k]; if (!m) continue; a = SEGS[k];
              ctx.lineWidth = (k === OUT ? 1.5 : k < OUT ? 0.6 : 0.7) * s * wt;
              ctx.strokeStyle = css(rgb, k === OUT ? 0.95 : k < OUT ? 0.22 + 0.12 * k : 0.62);
              ctx.beginPath();
              for (j = 0; j < m; j += 4) { ctx.moveTo(a[j], a[j + 1]); ctx.lineTo(a[j + 2], a[j + 3]); }
              ctx.stroke();
            }
            for (k = 0; k < n; k++) {
              b = B[k];
              if (shaded[k]) ball(ctx, b.x, b.y, b.r * 0.26, s, wt, rgb, dark);
              else { c = 3 * s; ctx.strokeStyle = css(rgb, 0.6); ctx.lineWidth = 0.7 * s * wt; ctx.beginPath(); ctx.moveTo(b.x - c, b.y); ctx.lineTo(b.x + c, b.y); ctx.moveTo(b.x, b.y - c); ctx.lineTo(b.x, b.y + c); ctx.stroke(); }
            }
          }
        });
        r.paused = !S.live;
        return {
          update: function (S) { cur = S; r.paused = !S.live; r.dirty = true; },
          destroy: r.destroy, png: function () { return r.cv; },
          recolor: function () { rgb = rgbNow(); dark = A.isDark(); r.redraw(); },
          toSVG: function () {
            var q = cur.p, s = lineScale(), wt = q.weight, n = Math.round(q.blobs), k, b, d = "", balls = "", crosses = "", holes = "", c = 3 * s, pd = api.EP.svg.pathD;
            build();
            for (k = 0; k < n; k++) {
              b = B[k];
              if (shaded[k]) { holes += '<circle cx="' + b.x.toFixed(1) + '" cy="' + b.y.toFixed(1) + '" r="' + (b.r * 0.26).toFixed(1) + '" fill="#000"/>'; balls += '<circle cx="' + b.x.toFixed(1) + '" cy="' + b.y.toFixed(1) + '" r="' + (b.r * 0.26).toFixed(1) + '" fill="none" stroke="currentColor" stroke-opacity="0.92" stroke-width="' + (1.1 * s * wt).toFixed(2) + '"/>'; }
              else crosses += "M" + (b.x - c).toFixed(1) + " " + b.y.toFixed(1) + "L" + (b.x + c).toFixed(1) + " " + b.y.toFixed(1) + "M" + b.x.toFixed(1) + " " + (b.y - c).toFixed(1) + "L" + b.x.toFixed(1) + " " + (b.y + c).toFixed(1);
            }
            for (k = 0; k < NL; k++) d += '<path d="' + pd(chain(SEGS[k], CNT[k])) + '" fill="none" stroke="currentColor" stroke-opacity="' + (k === OUT ? 0.95 : k < OUT ? 0.22 + 0.12 * k : 0.62) + '" stroke-width="' + ((k === OUT ? 1.5 : k < OUT ? 0.6 : 0.7) * s * wt).toFixed(2) + '" stroke-linecap="round" stroke-linejoin="round"/>';
            return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + r.w + " " + r.h + '" role="img" aria-label="Métaballes">'
              + '<defs><mask id="mbm"><rect width="' + r.w + '" height="' + r.h + '" fill="#fff"/>' + holes + "</mask></defs>"
              + '<g mask="url(#mbm)">' + d + "</g>" + balls + (crosses ? '<path d="' + crosses + '" fill="none" stroke="currentColor" stroke-opacity="0.6" stroke-width="' + (0.7 * s * wt).toFixed(2) + '"/>' : "") + "</svg>";
          }
        };
      },
      code: function (S) { return JSON.stringify({ systeme: id, planche: +kit, seed: S.seed, params: S.p }); }
    };
  }

  /* ------------------------------------------------- 27 : fond de page */
  /* le champ devient une masse douce : de l'encre très pâle là où il monte, un bord éclairé par le haut à gauche.
     Le champ est calculé sur une petite grille, mise à l'échelle avec lissage : doux, léger, sans bruit de grille. */
  function toneType(id, kit, label, note, intensity, p) {
    return {
      id: id, kit: kit, group: "Formes et lumière", label: label, note: note, int: intensity,
      params: [
        range("blobs", "Nombre de masses", 3, 12, 1, p.blobs, "", false),
        range("size", "Taille des masses", 0.6, 1.6, 0.05, p.size),
        range("reach", "Amplitude du mouvement", 0, 2, 0.05, p.reach),
        range("speed", "Vitesse", 0, 3, 0.05, p.speed),
        range("strength", "Densité de l'encre", 0.3, 3, 0.05, p.strength),
        range("soft", "Douceur des bords", 0.5, 2.5, 0.05, p.soft),
        range("light", "Relief et lumière", 0, 2.5, 0.05, p.light),
        range("angle", "Direction de la lumière", 0, 6.28, 0.05, p.angle)
      ],
      mount: function (S, api) {
        var cur = S, r, B = null, bkey = "", rgb = rgbNow(), flip = A.isDark() ? -1 : 1, rgbDirty = true, dn = null, tm = 9, lastT = 0, W = 2, H = 2, u = 1, cs = 4, gw = 2, gh = 2, f = new Float32Array(4), off = null, octx = null, img = null, px = null;
        function setup(rr) {
          W = rr.w; H = rr.h; u = unit(W, H); cs = clamp(Math.max(W, H) / 320, 3.5, 12);
          gw = Math.ceil(W / cs) + 2; gh = Math.ceil(H / cs) + 2; f = new Float32Array(gw * gh);
          off = doc.createElement("canvas"); off.width = gw; off.height = gh; octx = off.getContext("2d"); img = octx.createImageData(gw, gh); px = img.data; rgbDirty = true;
          /* tramage fixe : l'alpha est faible, sans lui on verrait des anneaux de quantification dans les dégradés */
          var dr = A.rng("metaballs-dither"), z; dn = new Float32Array(gw * gh); for (z = 0; z < dn.length; z++) dn[z] = dr();
        }
        r = api.runner(api.host, {
          maxDpr: 1, resize: setup,
          frame: function (rr) {
            var q = cur.p, ctx = rr.ctx, n = Math.round(q.blobs), key = String(cur.seed) + "|" + n, i, j, idx, pi, v, lo, hi, t, e, sm, gx, gy, lit, rim, al, cx, cy, kg, st = q.strength, lg = q.light;
            tm += (rr.t - lastT) * q.speed; lastT = rr.t;
            if (key !== bkey) { B = makeBlobs(cur.seed, n, true); bkey = key; }
            moveBlobs(B, n, tm, W, H, u, q.size, 0.95, q.reach);
            accumulate(f, gw, gh, cs, B, n, 0.5);
            if (rgbDirty) { for (i = 0; i < gw * gh; i++) { px[i * 4] = rgb[0]; px[i * 4 + 1] = rgb[1]; px[i * 4 + 2] = rgb[2]; } rgbDirty = false; }
            lo = 0.12; hi = lo + 0.22 * q.soft; cx = Math.cos(q.angle); cy = Math.sin(q.angle); kg = 46 * u / (2 * cs);
            for (j = 0; j < gh; j++) for (i = 0; i < gw; i++) {
              idx = j * gw + i; pi = idx * 4 + 3; v = f[idx];
              if (v <= lo) { px[pi] = 0; continue; }
              t = (v - lo) / (hi - lo); e = t >= 1 ? 1 : t * t * (3 - 2 * t);
              sm = smooth(0.3, 1.1, v);
              al = 0.116 * e + 0.054 * sm;
              if (lg > 0 && i > 0 && j > 0 && i < gw - 1 && j < gh - 1) {
                lit = kg * (cx * (f[idx + 1] - f[idx - 1]) + cy * (f[idx + gw] - f[idx - gw]));
                rim = lit > 0 ? -0.0112 * (lit > 1 ? 1 : lit) : 0.0268 * (lit < -1 ? 1 : -lit);
                al += flip * rim * e * lg;
              }
              al *= st; px[pi] = al <= 0 ? 0 : al >= 1 ? 255 : (al * 255 + dn[idx]) | 0;
            }
            octx.putImageData(img, 0, 0);
            ctx.setTransform(rr.k, 0, 0, rr.k, 0, 0); ctx.clearRect(0, 0, rr.w, rr.h);
            ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
            ctx.drawImage(off, 0, 0, gw * cs, gh * cs);
          }
        });
        r.paused = !S.live;
        return {
          update: function (S) { cur = S; r.paused = !S.live; r.dirty = true; },
          destroy: r.destroy, png: function () { return r.cv; },
          recolor: function () { rgb = rgbNow(); flip = A.isDark() ? -1 : 1; rgbDirty = true; r.redraw(); }
        };
      },
      code: function (S) { return JSON.stringify({ systeme: id, planche: +kit, seed: S.seed, params: S.p }); }
    };
  }

  BgGen.register(linesType("metaballs", "13", "Métaballes", "Chaque boule ajoute un champ doux à la feuille ; les lignes marquent où le total atteint une hauteur choisie, si bien que deux boules proches fusionnent puis se séparent. La planche 13.", 0.7,
    { blobs: 8, size: 1, spread: 0.95, reach: 1, speed: 1, gap: 1, weight: 1, balls: 3 }));

  var page = toneType("metaballs-page", "27", "Métaballes en fond de page", "Le même champ en grandes masses d'encre très pâle, avec un bord éclairé, pour rester derrière un texte. La planche 27.", 0.9,
    { blobs: 7, size: 1, reach: 1, speed: 1, strength: 1, soft: 1, light: 1, angle: 0.93 });
  BgGen.register(page);
})();

/* ---- gen-types/raymarch.js */
/* Raymarching (planche 14 du kit, « chrome ») : un anneau et des gouttes de métal fusionnés, lus par un shader WebGL plein cadre.
   Le canevas est créé ici (le runner ouvre un contexte 2D, incompatible avec WebGL). Repli : un message discret en 2D. */
(function () {
  "use strict";
  var A = BgGen.api, TAU = A.TAU, clamp = A.clamp, range = BgGen.range, doc = document;

  /* ------------------------------------------------------------------ shader */
  var VSRC = "attribute vec2 p;\nvoid main(){gl_Position=vec4(p,0.0,1.0);}";
  var FSRC = [
    "#ifdef GL_FRAGMENT_PRECISION_HIGH",
    "precision highp float;",
    "#else",
    "precision mediump float;",
    "#endif",
    "uniform vec3 uCam;",
    "uniform mat3 uM;",
    "uniform vec3 uS[6];",
    "uniform float uSr[6];",
    "uniform float uRoom;",
    "uniform float uBob;",
    "uniform float uK;",
    "uniform float uTube;",
    "uniform vec3 uHi;",
    "uniform vec3 uLo;",
    "uniform vec3 uSh;",
    "uniform float uRim;",
    "float smin(float a,float b,float k){float h=max(k-abs(a-b),0.0)/k;return min(a,b)-h*h*k*0.25;}",
    "float map(vec3 p){",
    " vec3 l=uM*p;",
    " float q=length(l.xz)-1.05;",
    " float d=length(vec2(q,l.y))-uTube;",
    " for(int i=0;i<6;i++){",
    "  float s=length(l-uS[i])-uSr[i];",
    "  if(i<3){d=smin(d,s,uK);}else{d=min(d,s);}",
    " }",
    " return d;",
    "}",
    "float bx(float x,float a,float b,float s){return smoothstep(a-s,a+s,x)*(1.0-smoothstep(b-s,b+s,x));}",
    "float room(vec3 d){",
    " float L;",
    " if(d.y>=0.0){",
    "  float e=d.y/0.045;",
    "  L=0.04+0.85*pow(smoothstep(0.0,1.0,d.y),1.4)+0.7*exp(-e*e);",
    "  float az=atan(d.z,d.x+0.00001)-uRoom;",
    "  az=mod(az+3.14159265,6.2831853)-3.14159265;",
    "  L+=1.9*bx(az,0.3,1.2,0.07)*bx(d.y,0.22,0.85,0.1);",
    "  L+=1.1*bx(az,-2.35,-2.1,0.04)*bx(d.y,0.05,1.0,0.1);",
    "  L+=0.9*bx(az,2.4,2.62,0.05)*bx(d.y,0.1,0.8,0.1);",
    " }else{",
    "  L=0.1+0.62*smoothstep(0.0,0.7,-d.y);",
    " }",
    " return L;",
    "}",
    "void main(){",
    " vec2 s=(gl_FragCoord.xy-uCam.xy)/uCam.z;",
    " vec3 rd=normalize(vec3(s*0.36,1.0));",
    " vec3 ro=vec3(0.0,-uBob,-5.0);",
    " float b=dot(ro,rd);",
    " float cc=dot(ro,ro)-4.41;",
    " float disc=b*b-cc;",
    " float sx=s.x/0.62;",
    " float sy=(s.y+0.75)/0.0875;",
    " float shd=(0.34-uBob*0.7)*exp(-(sx*sx+sy*sy)*1.2);",
    " vec4 col=vec4(uSh*shd,shd);",
    " if(disc>0.0){",
    "  float t=-b-sqrt(disc);",
    "  float md=9.0;",
    "  float tm=t;",
    "  bool hit=false;",
    "  vec3 p=ro;",
    "  for(int i=0;i<72;i++){",
    "   p=ro+rd*t;",
    "   float d=map(p);",
    "   if(d<0.0015){hit=true;break;}",
    "   float ang=d/t;",
    "   if(ang<md){md=ang;tm=t;}",
    "   t+=d*0.92;",
    "   if(t>8.0){break;}",
    "  }",
    "  float px=0.36/uCam.z;",
    "  if(hit||md<0.5*px){",
    "   if(!hit){p=ro+rd*tm;}",
    "   float cov=hit?1.0:clamp(0.5-md/px,0.0,0.5);",
    "   float e=0.0015;",
    "   vec3 n=normalize(vec3(1.0,-1.0,-1.0)*map(p+vec3(e,-e,-e))+vec3(-1.0,-1.0,1.0)*map(p+vec3(-e,-e,e))+vec3(-1.0,1.0,-1.0)*map(p+vec3(-e,e,-e))+vec3(1.0,1.0,1.0)*map(p+vec3(e,e,e)));",
    "   float dt=dot(rd,n);",
    "   vec3 r=rd-2.0*dt*n;",
    "   float L=room(r)*0.94;",
    "   float fr=pow(clamp(1.0-abs(dt),0.0,1.0),4.0);",
    "   L=clamp(L*(1.0-0.3*fr)+uRim*fr,0.0,1.0);",
    "   vec3 c=mix(uLo,uHi,L);",
    "   col=vec4(c*cov,cov)+col*(1.0-cov);",
    "  }",
    " }",
    " gl_FragColor=col;",
    "}"
  ].join("\n");

  /* ------------------------------------------------------------------ outils */
  var MAXPX = 700000, SCALE = 0.65;
  var RR = 1.05, BASE_TH = [0.85, 3.55, 5.3], BASE_Y = [0.02, -0.04, 0.06], BASE_R = [0.44, 0.4, 0.34];
  /* cadrage : demi-largeur à l'écran de l'ensemble (anneau, gouttes liées et libres), en moitiés du petit côté pour une échelle 1, sur toutes les phases de l'animation.
     Mesuré en WebGL sur 1 800 phases : au plus 0,62 fois le rayon englobant dans le monde (anneau RR + tube, gouttes liées RR + 1,2 fois leur rayon, gouttes libres 1,34).
     EXT_K = 0,64 garde environ 3 % de marge. */
  var EXT_K = 0.64, EXT0 = EXT_K * (RR + BASE_R[0] * 1.2);
  function reach(tube, drop) { return EXT_K * Math.max(RR + tube, RR + BASE_R[0] * 1.2 * drop, 1.34); }

  /* produit de deux matrices 3 x 3 en ligne, sans allocation : o = a * b */
  function mul3(o, a, b) {
    var i, j;
    for (i = 0; i < 3; i++) for (j = 0; j < 3; j++) o[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  }
  function num(v, d) { return typeof v === "number" && isFinite(v) ? v : d; }

  BgGen.register({
    id: "chrome", kit: "14", group: "Formes et lumière", label: "Raymarching", int: 0.75,
    note: "Un anneau et des gouttes de métal fusionnés, éclairés par une pièce qui n'existe que dans le shader. La planche 14.",
    params: [
      range("speed", "Vitesse", 0.1, 3, 0.05, 1),
      range("spin", "Rotation de l'anneau", 0, 3, 0.05, 1),
      range("size", "Taille", 0.5, 1, 0.02, 0.94),
      range("px", "Position x", 0.2, 0.8, 0.01, 0.5, "", false),
      range("py", "Position y", 0.2, 0.8, 0.01, 0.5, "", false),
      range("tube", "Épaisseur de l'anneau", 0.16, 0.46, 0.01, 0.3),
      range("drop", "Taille des gouttes", 0.4, 1.5, 0.02, 1),
      range("blend", "Fusion des gouttes", 0.03, 0.4, 0.01, 0.14)
    ],
    mount: function (S, api) {
      var host = api.host, cur = S, cv = null, gl = null, g2 = null, prog = null, U = {};
      var lost = false, dead = false, dirty = true, paused = !S.live;
      var raf = 0, last = 0, rt = 0, ro = null, w = 2, h = 2, k = 1, n = 0;
      var T = 0, Ang = 0, thj = [0, 0, 0];                 /* phases cumulées : le changement d'un réglage de vitesse ne fait jamais sauter l'image */
      var Sv = new Float32Array(18), Sr = new Float32Array(6), Mf = new Float32Array(9);
      var Rx = new Float64Array(9), Ry = new Float64Array(9), Rz = new Float64Array(9), Tm = new Float64Array(9), Mm = new Float64Array(9);
      var hi = [0.94, 0.94, 0.93], lo = [0.04, 0.04, 0.05], shc = [0, 0, 0], rim = 0;

      /* couleurs : reflets clairs et creux sombres tirés de l'encre et du papier du thème (sur Papier, le papier éclairci fait les reflets).
         Sur Noir, les creux descendent sous le papier comme les noirs profonds du kit ; un liseré clair (reflet de bord, terme de Fresnel) garde la silhouette lisible. */
      function colors() {
        var ink = api.ink(), paper = api.paper(), dark = api.isDark(), i, I, P;
        for (i = 0; i < 3; i++) {
          I = ink[i] / 255; P = paper[i] / 255;
          if (dark) { hi[i] = I; lo[i] = P * 0.4; shc[i] = 0; }
          else { hi[i] = P + (1 - P) * 0.55; lo[i] = I; shc[i] = I; }
        }
        rim = dark ? 0.35 : 0;
      }
      /* le seed décale la phase de départ : orientation de l'anneau, place des gouttes, azimut des lumières */
      function reseed() {
        var q = api.rng(cur.seed);
        T = 4 + q() * 56; Ang = q() * 31.4; thj[0] = (q() - 0.5) * 1.4; thj[1] = (q() - 0.5) * 1.4; thj[2] = (q() - 0.5) * 1.4;
      }
      function mkCanvas() { var c = doc.createElement("canvas"); c.className = "gen__cv"; host.appendChild(c); return c; }

      /* ------------------------------------------------------------- WebGL */
      function compile(type, src) {
        var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { if (window.console && console.warn) console.warn("Raymarching : " + gl.getShaderInfoLog(s)); return null; }
        return s;
      }
      function build() {
        var vs = compile(gl.VERTEX_SHADER, VSRC), fs = compile(gl.FRAGMENT_SHADER, FSRC), buf, loc;
        if (!vs || !fs) return false;
        prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
        gl.useProgram(prog);
        buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        loc = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        U.cam = gl.getUniformLocation(prog, "uCam"); U.m = gl.getUniformLocation(prog, "uM"); U.s = gl.getUniformLocation(prog, "uS[0]"); U.sr = gl.getUniformLocation(prog, "uSr[0]");
        U.room = gl.getUniformLocation(prog, "uRoom"); U.bob = gl.getUniformLocation(prog, "uBob"); U.k = gl.getUniformLocation(prog, "uK"); U.tube = gl.getUniformLocation(prog, "uTube");
        U.hi = gl.getUniformLocation(prog, "uHi"); U.lo = gl.getUniformLocation(prog, "uLo"); U.sh = gl.getUniformLocation(prog, "uSh"); U.rim = gl.getUniformLocation(prog, "uRim");
        return true;
      }
      function render() {
        var p = cur.p, W = cv.width, H = cv.height, t = T, drop = clamp(num(p.drop, 1), 0.2, 2), tube = clamp(num(p.tube, 0.3), 0.05, 0.6), i, th, sc;
        /* Taille 1 : l'ensemble touche le cadre (petit côté) à son pire instant. Quand les gouttes ou le tube grossissent, l'échelle recule d'autant pour que rien ne sorte,
           sans saut : c'est un minimum de fonctions continues. */
        sc = Math.min(clamp(num(p.size, 0.94), 0.2, 4) / EXT0, 1 / reach(tube, drop));
        var ax = 1.0 + 0.22 * Math.sin(t * 0.33), ay = Ang * 0.2, az = 0.5 + 0.2 * Math.sin(t * 0.21);
        var cx = Math.cos(ax), sx = Math.sin(ax), cy = Math.cos(ay), sy = Math.sin(ay), cz = Math.cos(az), sz = Math.sin(az);
        Rx[0] = 1; Rx[1] = 0; Rx[2] = 0; Rx[3] = 0; Rx[4] = cx; Rx[5] = -sx; Rx[6] = 0; Rx[7] = sx; Rx[8] = cx;
        Ry[0] = cy; Ry[1] = 0; Ry[2] = sy; Ry[3] = 0; Ry[4] = 1; Ry[5] = 0; Ry[6] = -sy; Ry[7] = 0; Ry[8] = cy;
        Rz[0] = cz; Rz[1] = -sz; Rz[2] = 0; Rz[3] = sz; Rz[4] = cz; Rz[5] = 0; Rz[6] = 0; Rz[7] = 0; Rz[8] = 1;
        mul3(Tm, Rx, Ry); mul3(Mm, Rz, Tm);
        for (i = 0; i < 9; i++) Mf[i] = Mm[i];
        /* trois gouttes sur l'anneau, fusionnées avec lui */
        for (i = 0; i < 3; i++) {
          th = BASE_TH[i] + thj[i] + t * (0.28 + 0.09 * i);
          Sv[i * 3] = RR * Math.cos(th); Sv[i * 3 + 1] = BASE_Y[i] + 0.05 * Math.sin(t + i); Sv[i * 3 + 2] = RR * Math.sin(th);
          Sr[i] = BASE_R[i] * (1 + 0.2 * Math.sin(t * 0.9 + i * 2.1)) * drop;
        }
        /* trois autres, libres : une au centre, une au-dessus, une en dessous */
        Sv[9] = 0.05 + 0.25 * Math.sin(t * 0.7); Sv[10] = 0.12 + 0.15 * Math.sin(t * 0.9); Sv[11] = 0.05 + 0.25 * Math.cos(t * 0.6); Sr[3] = 0.3 * (1 + 0.1 * Math.sin(t * 1.1)) * drop;
        Sv[12] = 0.15 + 0.45 * Math.sin(t * 0.5); Sv[13] = 1.02 + 0.15 * Math.sin(t * 0.8); Sv[14] = 0.3 + 0.35 * Math.cos(t * 0.5); Sr[4] = 0.17 * drop;
        Sv[15] = -0.72 + 0.15 * Math.sin(t * 0.6); Sv[16] = -0.95 + 0.1 * Math.cos(t * 0.7); Sv[17] = 0.2 + 0.2 * Math.sin(t * 0.4); Sr[5] = 0.1 * drop;
        gl.useProgram(prog);
        gl.uniform3f(U.cam, W * clamp(num(p.px, 0.5), 0, 1), H * (1 - clamp(num(p.py, 0.5), 0, 1)), Math.min(W, H) * 0.5 * sc);
        gl.uniformMatrix3fv(U.m, false, Mf); gl.uniform3fv(U.s, Sv); gl.uniform1fv(U.sr, Sr);
        gl.uniform1f(U.room, (t * 0.12) % TAU); gl.uniform1f(U.bob, 0.07 * Math.sin(t * 0.8));
        gl.uniform1f(U.k, clamp(num(p.blend, 0.14), 0.01, 1)); gl.uniform1f(U.tube, tube);
        gl.uniform3f(U.hi, hi[0], hi[1], hi[2]); gl.uniform3f(U.lo, lo[0], lo[1], lo[2]); gl.uniform3f(U.sh, shc[0], shc[1], shc[2]); gl.uniform1f(U.rim, rim);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      /* ------------------------------------------------- repli : message 2D */
      function drawFallback() {
        var c = g2; if (!c) return;
        c.setTransform(k, 0, 0, k, 0, 0); c.clearRect(0, 0, w, h);
        c.fillStyle = api.inkCss(0.5); c.font = "12px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
        c.fillText("WebGL indisponible", w / 2, Math.max(12, h - 36));
      }

      /* ------------------------------------------------------- taille et boucle */
      function size() {
        var b = host.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
        w = Math.max(2, Math.round(b.width)); h = Math.max(2, Math.round(b.height));
        k = gl ? Math.min(SCALE * Math.min(dpr, 1.25), Math.sqrt(MAXPX / (w * h))) : Math.min(dpr, 1.5);
        cv.width = Math.max(2, Math.round(w * k)); cv.height = Math.max(2, Math.round(h * k));
        if (gl && !lost) gl.viewport(0, 0, cv.width, cv.height);
        dirty = true;
      }
      function loop(now) {
        if (dead) return;
        raf = requestAnimationFrame(loop);
        var dt = Math.min(0.1, (now - last) / 1000), sp;
        last = now;
        if (doc.hidden) return;
        if (!gl) { if (dirty) { dirty = false; drawFallback(); } return; }
        if (paused && !dirty) return;
        if (!paused) { sp = clamp(num(cur.p.speed, 1), 0, 6); T += dt * sp; Ang += dt * sp * clamp(num(cur.p.spin, 1), 0, 6); }
        dirty = false;
        if (lost) return;
        if (paused || (n++ & 15) === 0) colors();
        render();
      }

      /* ------------------------------------------------------------- montage */
      reseed(); colors();
      cv = mkCanvas();
      try { gl = cv.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true, powerPreference: "low-power" }) || cv.getContext("experimental-webgl"); } catch (e) { gl = null; }
      if (gl && !build()) gl = null;
      if (!gl) {
        /* un canevas qui a tenté WebGL n'est pas sûr de donner un contexte 2D : on en prend un neuf */
        cv.remove(); cv = mkCanvas(); try { g2 = cv.getContext("2d"); } catch (e2) { g2 = null; }
      } else if (cv.addEventListener) {
        cv.addEventListener("webglcontextlost", function (e) { if (e.preventDefault) e.preventDefault(); lost = true; });
        cv.addEventListener("webglcontextrestored", function () { if (dead) return; lost = false; if (build()) { gl.viewport(0, 0, cv.width, cv.height); dirty = true; } else lost = true; });
      }
      size();
      if (typeof ResizeObserver !== "undefined") { ro = new ResizeObserver(function () { clearTimeout(rt); rt = setTimeout(size, 120); }); ro.observe(host); }
      raf = requestAnimationFrame(function (t0) { last = t0; loop(t0); });

      return {
        update: function (S2) { var changed = S2.seed !== cur.seed; cur = S2; paused = !S2.live; dirty = true; if (changed) reseed(); },
        destroy: function () {
          dead = true; cancelAnimationFrame(raf); clearTimeout(rt); if (ro) ro.disconnect();
          if (gl) { try { var x = gl.getExtension("WEBGL_lose_context"); if (x && x.loseContext) x.loseContext(); } catch (e) { /* rien */ } }
          cv.remove(); gl = null; g2 = null;
        },
        recolor: function () { colors(); dirty = true; },
        png: function () { if (gl && !lost) { colors(); render(); } return cv; }
      };
    },
    code: function (S) { return JSON.stringify({ systeme: "chrome", planche: 14, seed: S.seed, params: S.p }); }
  });
})();

/* ---- gen-types/surfaces3d.js */
/* Surfaces en 3D du Systems Kit portées en canevas plein cadre : bande torsadée (15), sections en loft (16), ruban de Möbius (17).
   Les trois partagent un petit noyau : une caméra (rotation, perspective, lumière), un maillage trié par profondeur (chaque facette efface
   ce qui est derrière elle, puis reçoit un lavis, des hachures et des arêtes) et un cadrage qui place l'objet au centre sans jamais le couper. */
(function () {
  "use strict";
  var A = BgGen.api, TAU = A.TAU, PI = Math.PI, clamp = A.clamp, smooth = A.smooth, inkCss = A.inkCss, runner = A.runner;
  var range = BgGen.range, toggle = BgGen.toggle;
  var HP = Math.PI / 2, sin = Math.sin, cos = Math.cos, sqrt = Math.sqrt, pow = Math.pow, abs = Math.abs, FILL = 0.92;

  /* ------------------------------------------------------------------ caméra */
  /* rotation autour de y (lacet) puis de x (inclinaison), perspective de distance d, lumière unitaire (lx, ly, lz) */
  function Cam(d) {
    var c = { d: d, ca: 1, sa: 0, cxa: 1, sxa: 0, cr: 1, sr: 0, cx: 0, cy: 0, sc: 1, wx: 0, wy: 0, wz: 0, sx: 0, sy: 0, lx: 0, ly: 0, lz: 0 };
    c.set = function (ay, ax) { c.ca = cos(ay); c.sa = sin(ay); c.cxa = cos(ax); c.sxa = sin(ax); };
    /* projette (x, y, z) : coordonnées caméra dans wx, wy, wz, position à l'écran dans sx, sy */
    c.go = function (x, y, z) {
      var x1 = x * c.ca + z * c.sa, z1 = -x * c.sa + z * c.ca, y2 = y * c.cxa - z1 * c.sxa, z2 = y * c.sxa + z1 * c.cxa, kf = c.d / (c.d + z2), X = x1 * kf, Y = -y2 * kf;
      c.wx = x1; c.wy = y2; c.wz = z2; c.sx = c.cx + (X * c.cr - Y * c.sr) * c.sc; c.sy = c.cy + (X * c.sr + Y * c.cr) * c.sc;
    };
    /* roulis de l'image : en portrait, un anneau est couché dans le sens de la hauteur (0 en paysage, un quart de tour sur un téléphone) */
    c.roll = function (w, h) { var a = HP * smooth(0.1, 0.65, -clamp(Math.log(w / h) / Math.log(1.8), -1, 1)); c.cr = cos(a); c.sr = sin(a); };
    /* direction de la lumière : azimut dans le plan de l'image, composante z fixe */
    c.light = function (az, lz) { var q = sqrt(1 - lz * lz); c.lx = cos(az) * q; c.ly = sin(az) * q; c.lz = lz; };
    /* part d'ombre de 0 à 1 pour une normale unitaire qui regarde le spectateur */
    c.shade = function (nx, ny, nz) { return 1 - smooth(-0.15, 0.95, nx * c.lx + ny * c.ly + nz * c.lz); };
    /* cadre : e = étendue de l'objet pour sc = 1, centrée sur l'écran et réduite à FILL du côté le plus contraint */
    c.fit = function (e, w, h, fill) {
      var sc = (fill || FILL) * Math.min(w / (e.x1 - e.x0), h / (e.y1 - e.y0));
      c.sc = sc; c.cx = w / 2 - sc * (e.x0 + e.x1) / 2; c.cy = h / 2 - sc * (e.y0 + e.y1) / 2;
    };
    return c;
  }

  /* étendue d'un anneau (bande torsadée, Möbius) : la bande reste dans un tore de rayon R et de section rho, donc le lacet n'y change rien ;
     on balaie l'inclinaison de ax0 à ax1 pour que l'objet ne dépasse jamais pendant que la caméra respire */
  var RN1 = 48, RN2 = 14, rcp = new Float32Array(RN1), rsp = new Float32Array(RN1), rct = new Float32Array(RN2), rst = new Float32Array(RN2);
  (function () { var i; for (i = 0; i < RN1; i++) { rcp[i] = cos(i / RN1 * TAU); rsp[i] = sin(i / RN1 * TAU); } for (i = 0; i < RN2; i++) { rct[i] = cos(i / RN2 * TAU); rst[i] = sin(i / RN2 * TAU); } })();
  function ringExtent(R, rho, ax0, ax1, dist, cr, sr, e) {
    var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, m, ax, cxa, sxa, i, j, rr, y, x, z, y2, z2, kf, X, Y, U, V;
    for (m = 0; m < 3; m++) {
      ax = ax0 + (ax1 - ax0) * m / 2; cxa = cos(ax); sxa = sin(ax);
      for (j = 0; j < RN2; j++) {
        rr = R + rho * rct[j]; y = rho * rst[j];
        for (i = 0; i < RN1; i++) {
          x = rr * rcp[i]; z = rr * rsp[i]; y2 = y * cxa - z * sxa; z2 = y * sxa + z * cxa; kf = dist / (dist + z2); U = x * kf; V = -y2 * kf; X = U * cr - V * sr; Y = U * sr + V * cr;
          if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
        }
      }
    }
    e.x0 = x0; e.x1 = x1; e.y0 = y0; e.y1 = y1;
  }

  /* ------------------------------------------------------------------ maillage */
  /* Facettes quadrilatères triées de l'arrière vers l'avant (tri par seaux, sans allocation). Chacune efface ce qui est derrière elle
     (destination-out : le fond reste transparent), puis reçoit un lavis d'encre dont la force suit l'ombre, des hachures, des lignes fines et des arêtes.
     add(x0, y0, … x3, y3, z, ombre, arêtes, lignes) : sommets dans l'ordre a, b, d, e ; arêtes et lignes sont des masques de 4 bits (bit i : sommet i vers i + 1). */
  function Mesh(ctx, n) {
    var X = new Float32Array(n * 4), Y = new Float32Array(n * 4), Z = new Float32Array(n), S = new Float32Array(n), E = new Uint8Array(n), Lm = new Uint8Array(n);
    var NB = 2048, bc = new Int32Array(NB), key = new Uint16Array(n), ord = new Uint16Array(n), cnt = 0, ga = -1, lw = -1;
    var GB = 16, HT = [0.62, 0.76, 0.9], HF = [[0.5], [0.25, 0.75], [0.125, 0.375, 0.625, 0.875]];
    function setA(v) { if (v !== ga) { ga = v; ctx.globalAlpha = v; } }
    function setW(v) { if (v !== lw) { lw = v; ctx.lineWidth = v; } }
    function order() {
      var zmin = 1e9, zmax = -1e9, k, b, sc, acc, c;
      for (k = 0; k < cnt; k++) { if (Z[k] < zmin) zmin = Z[k]; if (Z[k] > zmax) zmax = Z[k]; }
      sc = (NB - 1) / ((zmax - zmin) || 1);
      bc.fill(0);
      for (k = 0; k < cnt; k++) { b = ((Z[k] - zmin) * sc) | 0; key[k] = b; bc[b]++; }
      acc = 0;
      for (b = NB - 1; b >= 0; b--) { c = bc[b]; bc[b] = acc; acc += c; }
      for (k = 0; k < cnt; k++) ord[bc[key[k]]++] = k;
    }
    /* les lignes d'un niveau de hachures, parallèles à l'arête 0 vers 1 (hd = 0) ou en travers (hd = 1) */
    function hatch(o, m, hd, P) {
      var fs = HF[m], f, a, ax, ay, bx, by;
      for (f = 0; f < fs.length; f++) {
        a = fs[f];
        if (hd === 0) { ax = X[o] + (X[o + 3] - X[o]) * a; ay = Y[o] + (Y[o + 3] - Y[o]) * a; bx = X[o + 1] + (X[o + 2] - X[o + 1]) * a; by = Y[o + 1] + (Y[o + 2] - Y[o + 1]) * a; }
        else { ax = X[o] + (X[o + 1] - X[o]) * a; ay = Y[o] + (Y[o + 1] - Y[o]) * a; bx = X[o + 3] + (X[o + 2] - X[o + 3]) * a; by = Y[o + 3] + (Y[o + 2] - Y[o + 3]) * a; }
        P.moveTo(ax, ay); P.lineTo(bx, by);
      }
    }
    function sides(o, mask, P) {
      var i, j;
      /* les quatre côtés : un seul contour fermé, moins coûteux à tracer que quatre segments */
      if (mask === 15) { P.moveTo(X[o], Y[o]); P.lineTo(X[o + 1], Y[o + 1]); P.lineTo(X[o + 2], Y[o + 2]); P.lineTo(X[o + 3], Y[o + 3]); P.closePath(); return; }
      for (i = 0; i < 4; i++) if (mask & (1 << i)) { j = (i + 1) & 3; P.moveTo(X[o + i], Y[o + i]); P.lineTo(X[o + j], Y[o + j]); }
    }
    /* le point : une réserve transparente autour d'un disque d'encre */
    function drawDot(d, lu) {
      ctx.globalCompositeOperation = "destination-out"; ctx.globalAlpha = 1; ga = 1; ctx.beginPath(); ctx.arc(d.x, d.y, d.r + 1.6 * lu, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 0.95; ga = 0.95; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, TAU); ctx.fill();
    }
    return {
      reset: function () { cnt = 0; },
      count: function () { return cnt; },
      add: function (x0, y0, x1, y1, x2, y2, x3, y3, z, s, e, l) {
        if (cnt >= n) return;
        var k = cnt++, o = k * 4;
        X[o] = x0; Y[o] = y0; X[o + 1] = x1; Y[o + 1] = y1; X[o + 2] = x2; Y[o + 2] = y2; X[o + 3] = x3; Y[o + 3] = y3;
        Z[k] = z; S[k] = s; E[k] = e; Lm[k] = l;
      },
      /* ink : encre en "rgba(r,g,b,1)" ; lu : unité de trait (taille de l'objet) ; sw : épaisseur des arêtes ; hd : sens des hachures ;
         flow : deux lignes guides dans la facette ; inv : sur fond sombre l'encre marque la lumière, pas l'ombre ; dot : { x, y, z, r } ou null */
      flush: function (ink, lu, sw, hd, flow, inv, dot) {
        var q, k, o, s, i, m, a, l, e, nf, nfull, am, ux, uy, ul, vx, vy, vl, ar, wU, wV, wd, hw = 0.6 * lu, h0 = 1.4 * hw, h1 = 2.6 * hw, done = !dot, gc = 0, lp = null, nl = 0;
        /* Lignes fines groupées : celles de GB facettes consécutives (donc à peu près à la même profondeur) partent en un seul tracé. Une ligne à 20 % d'opacité
           qui déborde sur une facette voisine du même groupe ne se voit pas ; les hachures et les arêtes, plus marquées, restent tracées facette par facette. */
        function drain() { if (nl) { setA(0.2); setW(0.5 * lu); ctx.stroke(lp); nl = 0; } gc = 0; }
        order(); ga = -1; lw = -1;
        ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.fillStyle = ink; ctx.strokeStyle = ink;
        for (q = 0; q < cnt; q++) {
          k = ord[q]; o = k * 4; s = S[k]; if (inv) s = 1 - s;
          if (!done && Z[k] < dot.z) { drain(); drawDot(dot, lu); done = true; }
          /* la facette est élargie d'un demi-pixel pour qu'aucune fente ne laisse voir ce qui est derrière ;
             wU et wV : largeur réelle à l'écran de la facette entre ses côtés, perpendiculairement à l'autre direction (une facette vue de biais est étroite) */
          ux = (X[o + 1] - X[o] + X[o + 2] - X[o + 3]) / 2; uy = (Y[o + 1] - Y[o] + Y[o + 2] - Y[o + 3]) / 2; vx = (X[o + 3] - X[o] + X[o + 2] - X[o + 1]) / 2; vy = (Y[o + 3] - Y[o] + Y[o + 2] - Y[o + 1]) / 2;
          ul = sqrt(ux * ux + uy * uy) || 1; vl = sqrt(vx * vx + vy * vy) || 1; ar = abs(ux * vy - uy * vx); wU = ar / vl; wV = ar / ul;
          ux = ux / ul * 0.5; uy = uy / ul * 0.5; vx = vx / vl * 0.5; vy = vy / vl * 0.5;
          ctx.beginPath();
          ctx.moveTo(X[o] - ux - vx, Y[o] - uy - vy); ctx.lineTo(X[o + 1] + ux - vx, Y[o + 1] + uy - vy); ctx.lineTo(X[o + 2] + ux + vx, Y[o + 2] + uy + vy); ctx.lineTo(X[o + 3] - ux + vx, Y[o + 3] - uy + vy);
          ctx.closePath();
          ctx.globalCompositeOperation = "destination-out"; ctx.globalAlpha = 1; ga = 1; ctx.fill();
          ctx.globalCompositeOperation = "source-over"; ga = 0.02 + 0.34 * pow(s, 1.25); ctx.globalAlpha = ga; ctx.fill();
          if (flow) {
            setA(0.2); setW(0.5 * lu); ctx.beginPath();
            for (m = 1; m < 3; m++) { a = m / 3; ctx.moveTo(X[o] + (X[o + 3] - X[o]) * a, Y[o] + (Y[o + 3] - Y[o]) * a); ctx.lineTo(X[o + 1] + (X[o + 2] - X[o + 1]) * a, Y[o + 1] + (Y[o + 2] - Y[o + 1]) * a); }
            ctx.stroke();
          }
          /* hachures : trois niveaux qui apparaissent en fondu quand l'ombre dépasse 0,62, 0,76 puis 0,9. Un niveau n'est tracé que si ses lignes restent
             distinctes à l'écran (écart au moins 1,4 à 2,6 fois leur épaisseur) : sur une facette étroite, des lignes plus serrées feraient un aplat clair */
          if (s > 0.57) {
            nf = s >= 0.95 ? 3 : s >= 0.81 ? 2 : s >= 0.67 ? 1 : 0;
            wd = hd === 0 ? wV : wU;
            for (nfull = 0; nfull < nf && wd / (2 << nfull) >= h1; nfull++);
            if (nfull > 0) { setA(0.62); setW(hw); ctx.beginPath(); for (m = 0; m < nfull; m++) hatch(o, m, hd, ctx); ctx.stroke(); }
            if (nfull < 3) {
              am = nfull < nf ? 0.62 : 0.62 * smooth(HT[nf] - 0.05, HT[nf] + 0.05, s);
              if (am > 0.02) { am *= smooth(h0, h1, wd / (2 << nfull)); if (am > 0.02) { setA(am); setW(hw); ctx.beginPath(); hatch(o, nfull, hd, ctx); ctx.stroke(); } }
            }
          }
          /* lignes fines : elles s'effacent quand la facette devient plus étroite qu'environ 2 px */
          l = Lm[k];
          if (l) {
            am = 0.2 * smooth(0.8, 2.4, Math.min(wU, wV));
            if (am >= 0.199) { if (!nl) lp = new Path2D(); sides(o, l, lp); nl++; }
            else if (am > 0.02) { setA(am); setW(0.5 * lu); ctx.beginPath(); sides(o, l, ctx); ctx.stroke(); }
          }
          e = E[k];
          if (e) { setA(0.9); setW(sw * lu); ctx.beginPath(); sides(o, e, ctx); ctx.stroke(); }
          if (++gc >= GB) drain();
        }
        drain();
        if (!done) drawDot(dot, lu);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
      }
    };
  }

  /* début d'image commun : efface (transparent) et renvoie l'encre */
  function begin(rr) { var ctx = rr.ctx; ctx.setTransform(rr.k, 0, 0, rr.k, 0, 0); ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1; ctx.clearRect(0, 0, rr.w, rr.h); return inkCss(1); }

  /* ------------------------------------------------------- 15 : bande torsadée */
  /* Un ruban large refermé en anneau avec un nombre entier de demi-tours. Pour changer ce nombre, l'anneau est coupé (l'ouverture s'élargit),
     tordu, puis recollé : la suite 2, 3, 4, 3, 2, 1 du kit. Tous les temps passent par des phases cumulées, donc aucun réglage ne fait sauter l'image. */
  var HSEQ = [2, 3, 4, 3, 2, 1], HA = 3.5 / 12, HB = 5 / 12, HC = 8 / 12, HD = 9.5 / 12;
  BgGen.register({
    id: "helix", kit: "15", group: "Formes et lumière", label: "Bande torsadée",
    note: "Un large ruban refermé en anneau, avec un nombre entier de demi-tours, tracé en hachures. La planche 15.",
    int: 0.75,
    params: [
      range("width", "Largeur du ruban", 0.2, 0.8, 0.01, 0.46),
      range("twists", "Demi-tours (0 : enchaînés)", 0, 6, 1, 0, "", false),
      range("period", "Durée d'une torsion", 6, 24, 0.5, 12, " s"),
      range("spin", "Rotation", 0, 1.2, 0.01, 0.3),
      range("tilt", "Inclinaison", 0.3, 1.4, 0.01, 0.78),
      range("light", "Direction de la lumière", 0, 6.28, 0.05, 2.45),
      range("weight", "Épaisseur du trait", 0.4, 2.5, 0.05, 1),
      toggle("dot", "Point sur la ligne médiane", true)
    ],
    mount: function (S, api) {
      var cur = S, r, NU = 240, cam = Cam(5), mesh = null, ext = { x0: 0, x1: 0, y0: 0, y1: 0 }, dot = { x: 0, y: 0, z: 0, r: 4 }, gapV = 0, nV = 2;
      var pxa = new Float32Array((NU + 1) * 2), pya = new Float32Array((NU + 1) * 2), pza = new Float32Array((NU + 1) * 2), sx = new Float32Array((NU + 1) * 2), sy = new Float32Array((NU + 1) * 2);
      var shd = new Float32Array(NU), shd2 = new Float32Array(NU), AY, TT, F, K, hand, dotU;
      /* le seed règle le lacet de départ, la position dans la suite des torsions, le sens de la torsion et le point de départ */
      function reseed() { var q = api.rng(cur.seed); AY = q() * TAU; TT = q() * 40; F = 0.917; K = (q() * 6) | 0; hand = q() < 0.5 ? -1 : 1; dotU = q(); }
      reseed();
      function stage(f, a, b) {
        if (f < HA) { gapV = 0; nV = a; }
        else if (f < HB) { gapV = smooth(HA, HB, f); nV = a; }
        else if (f < HC) { gapV = 1; nV = a + (b - a) * smooth(HB, HC, f); }
        else if (f < HD) { gapV = 1 - smooth(HC, HD, f); nV = b; }
        else { gapV = 0; nV = b; }
      }
      r = runner(api.host, {
        maxDpr: 1.5,
        frame: function (rr, dt) {
          var p = cur.p, ctx = rr.ctx, i, j, k, a, b, e, u, ph, cp, sp, v, rad, g, n, ax, cu, su, ud, lu, HW = p.width, sg, nl, nx, ny, nz, ux, uy, uz, wx, wy, wz, tx, ty, tz, em, ink, wrap, pass;
          if (!mesh) mesh = Mesh(ctx, NU);
          if (!rr.paused) {
            AY += dt * p.spin; TT += dt; dotU = (dotU + dt * 0.055) % 1;
            if (p.twists < 0.5) { F += dt / p.period; if (F >= 1) { F -= 1; K++; } }
          }
          if (p.twists < 0.5) stage(F, HSEQ[K % 6], HSEQ[(K + 1) % 6]); else { gapV = 0; nV = Math.round(p.twists); }
          g = gapV * 0.4; n = nV * hand; ax = p.tilt + 0.12 * sin(TT * 0.23);
          cam.roll(rr.w, rr.h); ringExtent(1, HW, p.tilt - 0.12, p.tilt + 0.12, cam.d, cam.cr, cam.sr, ext); cam.fit(ext, rr.w, rr.h);
          cam.set(AY, ax); cam.light(p.light, -0.3925);
          for (i = 0; i <= NU; i++) {
            u = g + (TAU - 2 * g) * i / NU; ph = n * (u - PI) / 2; cp = cos(ph); sp = sin(ph); cu = cos(u); su = sin(u);
            for (j = 0; j < 2; j++) {
              v = j ? HW : -HW; rad = 1 + v * cp;
              cam.go(rad * cu, v * sp, rad * su);
              k = i * 2 + j; pxa[k] = cam.wx; pya[k] = cam.wy; pza[k] = cam.wz; sx[k] = cam.sx; sy[k] = cam.sy;
            }
          }
          /* ombre de chaque facette : la normale est tournée vers le spectateur, puis lissée avec ses voisines (une facette vue par la tranche change de côté) */
          for (i = 0; i < NU; i++) {
            a = i * 2; b = a + 2; e = a + 1;
            ux = pxa[b] - pxa[a]; uy = pya[b] - pya[a]; uz = pza[b] - pza[a]; wx = pxa[e] - pxa[a]; wy = pya[e] - pya[a]; wz = pza[e] - pza[a];
            nx = uy * wz - uz * wy; ny = uz * wx - ux * wz; nz = ux * wy - uy * wx; nl = sqrt(nx * nx + ny * ny + nz * nz) || 1; nx /= nl; ny /= nl; nz /= nl;
            tx = -pxa[a]; ty = -pya[a]; tz = -cam.d - pza[a];
            sg = (nx * tx + ny * ty + nz * tz) < 0 ? -1 : 1;
            shd[i] = cam.shade(nx * sg, ny * sg, nz * sg);
          }
          wrap = g < 0.001;
          for (pass = 0; pass < 3; pass++) {
            for (i = 0; i < NU; i++) shd2[i] = (shd[i > 0 ? i - 1 : wrap ? NU - 1 : 0] + shd[i] * 2 + shd[i < NU - 1 ? i + 1 : wrap ? 0 : NU - 1]) / 4;
            for (i = 0; i < NU; i++) shd[i] = shd2[i];
          }
          mesh.reset();
          for (i = 0; i < NU; i++) {
            a = i * 2; b = a + 2; e = a + 1; em = 5;
            if (g > 0.001) { if (i === 0) em |= 8; if (i === NU - 1) em |= 2; }
            mesh.add(sx[a], sy[a], sx[b], sy[b], sx[b + 1], sy[b + 1], sx[e], sy[e], (pza[a] + pza[b + 1]) / 2, shd[i], em, 0);
          }
          lu = clamp(cam.sc / 176, 0.8, 2.2);
          if (p.dot) {
            ud = g + (TAU - 2 * g) * dotU; cam.go(cos(ud), 0, sin(ud)); dot.x = cam.sx; dot.y = cam.sy; dot.z = cam.wz - 0.1; dot.r = 4.6 * lu;
          }
          ink = begin(rr);
          mesh.flush(ink, lu, 1.2 * p.weight, 0, true, api.isDark(), p.dot ? dot : null);
        }
      });
      r.paused = !S.live;
      return {
        update: function (S) { var changed = S.seed !== cur.seed; cur = S; if (changed) reseed(); r.paused = !S.live; r.dirty = true; },
        destroy: r.destroy, recolor: function () { r.redraw(); }, png: function () { return r.cv; }
      };
    },
    code: function (S) { return JSON.stringify({ systeme: "helix", planche: 15, seed: S.seed, params: S.p }); }
  });

  /* ------------------------------------------------------ 16 : sections en loft */
  /* Des courbes fermées empilées le long d'un axe courbe, comme la coque d'un navire. Leur forme passe du cercle au carré arrondi puis aux lobes
     (une onde qui voyage le long de l'axe) ; le temps est une phase cumulée, donc la vitesse peut varier sans saut. */
  var LNR = 32, LNT = 64;
  var LSPW = new Float32Array(LNR), LCT = new Float32Array(LNT), LST = new Float32Array(LNT);
  (function () { var i; for (i = 0; i < LNR; i++) LSPW[i] = pow(sin(PI * i / (LNR - 1)), 0.8); for (i = 0; i < LNT; i++) { LCT[i] = cos(i / LNT * TAU); LST[i] = sin(i / LNT * TAU); } })();
  /* étendue : des sphères le long de l'axe (rayon maximal des sections), vues sous tous les lacets et toutes les inclinaisons du balancement */
  function loftExtent(cam, span, rt, size, yaw0, swing, ax0, ax1, e) {
    var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, i, m, w, a, s, px, py, X, Y, rad, cy, sy, cr = cos(rt), sr = sin(rt), ay, ax, ca, sa, cxa, sxa, x1c, z1, y2, z2, kf, rr;
    for (i = 0; i < LNR; i++) {
      s = i / (LNR - 1); a = (s - 0.5) * span; px = 1.5 * sin(a); py = 1.25 * cos(a) - 0.8; X = px * cr - py * sr; Y = px * sr + py * cr;
      rad = (0.4 + 0.288 * LSPW[i]) * size * 1.45 + 0.1;
      for (w = 0; w < 5; w++) {
        ay = yaw0 - swing + 2 * swing * w / 4; ca = cos(ay); sa = sin(ay);
        for (m = 0; m < 2; m++) {
          ax = m ? ax1 : ax0; cxa = cos(ax); sxa = sin(ax);
          x1c = X * ca; z1 = -X * sa; y2 = Y * cxa - z1 * sxa; z2 = Y * sxa + z1 * cxa; kf = cam.d / (cam.d + z2); rr = rad * kf * 1.04;
          cy = x1c * kf; sy = -y2 * kf;
          if (cy - rr < x0) x0 = cy - rr; if (cy + rr > x1) x1 = cy + rr; if (sy - rr < y0) y0 = sy - rr; if (sy + rr > y1) y1 = sy + rr;
        }
      }
    }
    e.x0 = x0; e.x1 = x1; e.y0 = y0; e.y1 = y1;
  }
  BgGen.register({
    id: "loft", kit: "16", group: "Formes et lumière", label: "Sections en loft",
    note: "Des courbes fermées empilées le long d'un axe courbe, comme la coque d'un navire : du cercle aux lobes. La planche 16.",
    int: 0.6,
    params: [
      range("bend", "Courbure de l'axe", 1.2, 3.6, 0.05, 2.5),
      range("size", "Épaisseur des sections", 0.5, 1.3, 0.02, 1),
      range("lobes", "Lobes (entier)", 2, 8, 1, 5, "", false),
      range("twist", "Vrille des lobes", 0, 4, 0.05, 1.3),
      range("swing", "Balancement", 0, 1.4, 0.02, 0.35),
      range("speed", "Vitesse", 0, 2.5, 0.05, 1),
      range("light", "Direction de la lumière", 0, 6.28, 0.05, 2.45),
      range("weight", "Épaisseur du trait", 0.4, 2.5, 0.05, 1)
    ],
    mount: function (S, api) {
      var cur = S, r, NR = LNR, NT = LNT, nq = (NR - 1) * NT, nv = NR * NT, cam = Cam(5), mesh = null, ext = { x0: 0, x1: 0, y0: 0, y1: 0 };
      var wx = new Float32Array(nv), wy = new Float32Array(nv), wz = new Float32Array(nv), sx = new Float32Array(nv), sy = new Float32Array(nv);
      var rcx = new Float32Array(NR), rcy = new Float32Array(NR), rcz = new Float32Array(NR), vnx = new Float32Array(nv), vny = new Float32Array(nv), vnz = new Float32Array(nv), vsh = new Float32Array(nv);
      var fac = new Uint8Array(nq), nxs = new Float32Array(nq), nys = new Float32Array(nq), nzs = new Float32Array(nq), cL = new Float32Array(NT), sL = new Float32Array(NT), nl0 = -1;
      var TT, ph1, ph2, rt0;
      function reseed() { var q = api.rng(cur.seed); TT = 7.5 + q() * 30; ph1 = q() * TAU; ph2 = q() * TAU; rt0 = 0.8 + (q() < 0.5 ? 0 : PI) + (q() - 0.5) * 0.4; }
      reseed();
      r = runner(api.host, {
        maxDpr: 1.5,
        frame: function (rr, dt) {
          var p = cur.p, ctx = rr.ctx, i, j, k, a, b, dd, e, jn, q, s, th, sa_, tx, ty, tl, n2x, n2y, wS, rp, ne, amp, rot, cro, sro, sup, rad, x, y, z, ct, st, lob, lu, em, lm, sh, inner, front, sg;
          var span = p.bend, size = p.size, NL = Math.round(p.lobes), yaw, ax, rt, ar, y0, rb, cr, sr, pxs, pys, p0x, p0y, dpx, dpy, ux, uy, uz, vx, vy, vz, nx, ny, nz, nlen, qx, qy, qz, ink;
          if (!mesh) mesh = Mesh(ctx, nq);
          if (!rr.paused) TT += dt * p.speed;
          if (NL !== nl0) { nl0 = NL; for (j = 0; j < NT; j++) { cL[j] = cos(NL * j / NT * TAU); sL[j] = sin(NL * j / NT * TAU); } }
          /* l'axe se couche dans le sens de la plus grande dimension : en paysage il est presque horizontal, en portrait presque vertical, le carré garde l'angle du kit */
          ar = clamp(Math.log(rr.w / rr.h) / Math.log(1.8), -1, 1); y0 = 0.8 - 0.2 * Math.max(ar, 0); rb = rt0 - (ar > 0 ? 1.1 : 0.77) * ar;
          yaw = y0 + p.swing * sin(0.21 * TT + ph1); ax = 0.5 + 0.08 * sin(0.17 * TT + ph2); rt = rb + 0.05 * sin(0.15 * TT);
          loftExtent(cam, span, rb, size, y0, p.swing, 0.42, 0.58, ext); cam.fit(ext, rr.w, rr.h, 0.98);
          cam.set(yaw, ax); cam.light(p.light, -0.3925);
          cr = cos(rt); sr = sin(rt); wS = sin(0.3 * TT); sa_ = 0.95 * wS;
          for (i = 0; i < NR; i++) {
            s = i / (NR - 1); a = (s - 0.5) * span;
            pxs = 1.5 * sin(a); pys = 1.25 * cos(a) - 0.8; p0x = pxs * cr - pys * sr; p0y = pxs * sr + pys * cr;
            dpx = 1.5 * cos(a) * span; dpy = -1.25 * sin(a) * span; tx = dpx * cr - dpy * sr; ty = dpx * sr + dpy * cr; tl = sqrt(tx * tx + ty * ty) || 1; n2x = ty / tl; n2y = -tx / tl;
            th = clamp(s * 2.5 - 0.35 + sa_, 0, 2);
            rp = (0.4 + 0.24 * LSPW[i] * (1 + 0.2 * sin(0.3 * TT + s * 5))) * size;
            ne = 2 + 3.4 * smooth(0.1, 1, th) * (1 - smooth(1, 1.9, th)); amp = 0.42 * smooth(1.05, 1.9, th); rot = p.twist * s + 0.2 * TT; cro = cos(rot); sro = sin(rot);
            for (j = 0; j < NT; j++) {
              ct = LCT[j]; st = LST[j];
              sup = ne < 2.0001 ? 1 : pow(pow(abs(ct), ne) + pow(abs(st), ne), -1 / ne);
              lob = cL[j] * cro - sL[j] * sro; rad = rp * sup * (1 + amp * lob);
              cam.go(p0x + rad * st * n2x, p0y + rad * st * n2y, rad * ct);
              k = i * NT + j; wx[k] = cam.wx; wy[k] = cam.wy; wz[k] = cam.wz; sx[k] = cam.sx; sy[k] = cam.sy;
            }
            cam.go(p0x, p0y, 0); rcx[i] = cam.wx; rcy[i] = cam.wy; rcz[i] = cam.wz;
          }
          mesh.reset();
          for (k = 0; k < nv; k++) { vnx[k] = 0; vny[k] = 0; vnz[k] = 0; }
          q = 0;
          for (i = 0; i < NR - 1; i++) {
            for (j = 0; j < NT; j++) {
              jn = (j + 1) % NT; a = i * NT + j; b = i * NT + jn; dd = (i + 1) * NT + jn; e = (i + 1) * NT + j;
              ux = wx[b] - wx[a]; uy = wy[b] - wy[a]; uz = wz[b] - wz[a]; vx = wx[e] - wx[a]; vy = wy[e] - wy[a]; vz = wz[e] - wz[a];
              nx = uy * vz - uz * vy; ny = uz * vx - ux * vz; nz = ux * vy - uy * vx; nlen = sqrt(nx * nx + ny * ny + nz * nz) || 1; nx /= nlen; ny /= nlen; nz /= nlen;
              qx = wx[a] - rcx[i]; qy = wy[a] - rcy[i]; qz = wz[a] - rcz[i];
              if (nx * qx + ny * qy + nz * qz < 0) { nx = -nx; ny = -ny; nz = -nz; }
              front = (nx * -wx[a] + ny * -wy[a] + nz * (-cam.d - wz[a])) > 0;
              nxs[q] = nx; nys[q] = ny; nzs[q] = nz; fac[q] = front ? 1 : 0; q++;
              vnx[a] += nx; vny[a] += ny; vnz[a] += nz; vnx[b] += nx; vny[b] += ny; vnz[b] += nz; vnx[dd] += nx; vny[dd] += ny; vnz[dd] += nz; vnx[e] += nx; vny[e] += ny; vnz[e] += nz;
            }
          }
          for (k = 0; k < nv; k++) { nlen = sqrt(vnx[k] * vnx[k] + vny[k] * vny[k] + vnz[k] * vnz[k]) || 1; vsh[k] = cam.shade(vnx[k] / nlen, vny[k] / nlen, vnz[k] / nlen); }
          q = 0;
          for (i = 0; i < NR - 1; i++) {
            for (j = 0; j < NT; j++, q++) {
              inner = !fac[q] && (i < 3 || i > NR - 5);
              if (!fac[q] && !inner) continue;
              jn = (j + 1) % NT; a = i * NT + j; b = i * NT + jn; dd = (i + 1) * NT + jn; e = (i + 1) * NT + j;
              sh = inner ? Math.min(1, cam.shade(-nxs[q], -nys[q], -nzs[q]) * 0.8 + 0.25) : (vsh[a] + vsh[b] + vsh[dd] + vsh[e]) / 4;
              em = 1; lm = (j % 4 === 0) ? 8 : 0;
              if (i === NR - 2) em |= 4;
              if (!fac[i * NT + (j + NT - 1) % NT]) em |= 8;
              if (!fac[i * NT + jn]) em |= 2;
              if (i > 0 && !fac[q - NT]) em |= 1;
              if (i < NR - 2 && !fac[q + NT]) em |= 4;
              mesh.add(sx[a], sy[a], sx[b], sy[b], sx[dd], sy[dd], sx[e], sy[e], (wz[a] + wz[dd]) / 2, sh, em, lm);
            }
          }
          lu = clamp(cam.sc / 122, 0.8, 2.2);
          ink = begin(rr);
          /* les deux extrémités ouvertes sont tracées entières d'abord : les parois de devant cachent ensuite la moitié du fond */
          ctx.strokeStyle = ink; ctx.lineWidth = 1.1 * lu * p.weight; ctx.globalAlpha = 0.9; ctx.lineJoin = "round";
          for (k = 0; k < 2; k++) {
            i = k ? NR - 1 : 0; ctx.beginPath();
            for (j = 0; j <= NT; j++) { a = i * NT + (j % NT); if (j) ctx.lineTo(sx[a], sy[a]); else ctx.moveTo(sx[a], sy[a]); }
            ctx.stroke();
          }
          mesh.flush(ink, lu, 0.95 * p.weight, 1, false, api.isDark(), null);
        }
      });
      r.paused = !S.live;
      return {
        update: function (S) { var changed = S.seed !== cur.seed; cur = S; if (changed) reseed(); r.paused = !S.live; r.dirty = true; },
        destroy: r.destroy, recolor: function () { r.redraw(); }, png: function () { return r.cv; }
      };
    },
    code: function (S) { return JSON.stringify({ systeme: "loft", planche: 16, seed: S.seed, params: S.p }); }
  });

  /* ------------------------------------------------------ 17 : ruban de Möbius */
  /* Une bande qui fait un seul demi-tour : une face, un bord. Un point parcourt la ligne médiane et revient de l'autre côté sans franchir de bord.
     Deux faces d'un même ruban se distinguent par le ton ; à la couture, le ton change d'un coup, c'est la marque d'une surface sans envers. */
  BgGen.register({
    id: "mobius", kit: "17", group: "Formes et lumière", label: "Ruban de Möbius",
    note: "Une bande à un seul demi-tour : une face, un bord, et un point qui la parcourt sans franchir d'arête. La planche 17.",
    int: 0.75,
    params: [
      range("width", "Largeur du ruban", 0.2, 0.75, 0.01, 0.44),
      range("half", "Demi-tours (1, 3 ou 5)", 1, 5, 2, 1, "", false),
      range("spin", "Rotation", 0, 2, 0.01, 0.75),
      range("tilt", "Inclinaison", 0.4, 1.5, 0.01, 1.02),
      range("light", "Direction de la lumière", 0, 6.28, 0.05, 2.14),
      range("weight", "Épaisseur du trait", 0.4, 2.5, 0.05, 1),
      toggle("dot", "Point sur la ligne médiane", true)
    ],
    mount: function (S, api) {
      var cur = S, r, NUM = 180, NV = 8, cam = Cam(4.8), mesh = null, ext = { x0: 0, x1: 0, y0: 0, y1: 0 }, dot = { x: 0, y: 0, z: 0, r: 5 };
      var N = (NUM + 1) * (NV + 1), pxa = new Float32Array(N), pya = new Float32Array(N), pza = new Float32Array(N), sx = new Float32Array(N), sy = new Float32Array(N), AY, TT, DA, dir;
      function reseed() { var q = api.rng(cur.seed); AY = q() * TAU; TT = q() * 40; DA = q() * TAU; dir = q() < 0.5 ? -1 : 1; }
      reseed();
      r = runner(api.host, {
        maxDpr: 1.5,
        frame: function (rr, dt) {
          var p = cur.p, ctx = rr.ctx, h = Math.round(p.half), NU = NUM, HW = p.width, i, j, k, a, b, d, e, u, v, rad, cu, su, ch, sh, ax, lu, em, lm, ink, tone, lam, g;
          var ux, uy, uz, wx, wy, wz, nx, ny, nz, nl;
          if (!mesh) mesh = Mesh(ctx, NUM * NV);
          if (!rr.paused) { AY += dt * p.spin * dir; TT += dt; DA += dt * 1.1; }
          ax = p.tilt + 0.16 * sin(TT * 0.3);
          cam.roll(rr.w, rr.h); ringExtent(1, HW, p.tilt - 0.16, p.tilt + 0.16, cam.d, cam.cr, cam.sr, ext); cam.fit(ext, rr.w, rr.h);
          cam.set(AY, ax); cam.light(p.light, -0.755);
          for (i = 0; i <= NU; i++) {
            u = i / NU * TAU; cu = cos(u); su = sin(u); ch = cos(h * u / 2); sh = sin(h * u / 2);
            for (j = 0; j <= NV; j++) {
              v = (j / NV * 2 - 1) * HW; rad = 1 + v * ch;
              cam.go(rad * cu, v * sh, rad * su);
              k = i * (NV + 1) + j; pxa[k] = cam.wx; pya[k] = cam.wy; pza[k] = cam.wz; sx[k] = cam.sx; sy[k] = cam.sy;
            }
          }
          mesh.reset();
          for (i = 0; i < NU; i++) {
            for (j = 0; j < NV; j++) {
              a = i * (NV + 1) + j; b = (i + 1) * (NV + 1) + j; d = b + 1; e = a + 1;
              ux = pxa[b] - pxa[a]; uy = pya[b] - pya[a]; uz = pza[b] - pza[a]; wx = pxa[e] - pxa[a]; wy = pya[e] - pya[a]; wz = pza[e] - pza[a];
              nx = uy * wz - uz * wy; ny = uz * wx - ux * wz; nz = ux * wy - uy * wx; nl = sqrt(nx * nx + ny * ny + nz * nz) || 1;
              /* ton du kit : une face plus claire que l'autre, plus sombre quand elle tourne le dos à la lumière */
              lam = abs((nx * cam.lx + ny * cam.ly + nz * cam.lz) / nl);
              g = 196 + 48 * smooth(-0.2, 0.2, nz / nl) - 78 * (1 - lam); tone = clamp((246 - g) / 130, 0, 1);
              em = (j === 0 ? 1 : 0) | (j === NV - 1 ? 4 : 0);
              mesh.add(sx[a], sy[a], sx[b], sy[b], sx[d], sy[d], sx[e], sy[e], (pza[a] + pza[d]) / 2, tone, em, 15);
            }
          }
          lu = clamp(cam.sc / 200, 0.8, 2.2);
          if (p.dot) { cam.go(cos(DA), 0, sin(DA)); dot.x = cam.sx; dot.y = cam.sy; dot.z = cam.wz - 0.2; dot.r = 5.5 * lu; }
          ink = begin(rr);
          mesh.flush(ink, lu, 1.3 * p.weight, 0, false, api.isDark(), p.dot ? dot : null);
        }
      });
      r.paused = !S.live;
      return {
        update: function (S) { var changed = S.seed !== cur.seed; cur = S; if (changed) reseed(); r.paused = !S.live; r.dirty = true; },
        destroy: r.destroy, recolor: function () { r.redraw(); }, png: function () { return r.cv; }
      };
    },
    code: function (S) { return JSON.stringify({ systeme: "mobius", planche: 17, seed: S.seed, params: S.p }); }
  });
})();

/* ---- gen-types/tiling.js */
/* Planche 22 du kit : pavage génératif de glyphes.
   Une grille de cellules carrées, centrée sur le cadre et rognée aux bords, remplie de petits symboles tracés à l'encre.
   Quelques blocs doubles (2 x 2), des tuiles qui en contiennent quatre minuscules ; chaque bloc se remplace en fondu,
   et toute la donne est renouvelée par une vague de fondus toutes les douze secondes. */
(function () {
  "use strict";
  var A = BgGen.api, TAU = A.TAU, clamp = A.clamp;
  var range = BgGen.range, select = BgGen.select;
  var PI = Math.PI, sin = Math.sin, cos = Math.cos;

  /* nombre de segments d'un tracé en polyligne : proportionnel au rayon (k par pixel), borné */
  function segs(r, k, lo, hi) { var n = Math.round(r * k); return n < lo ? lo : n > hi ? hi : n; }

  /* ---------------------------------------------------------------- les trente-deux symboles
     Chacun se dessine autour de l'origine, dans un disque de rayon r (un peu plus, au plus 1,1 r) : la tuile n'a donc pas besoin
     d'être découpée. Le contexte arrive déjà placé et à l'échelle ; ceux qui tournent le font sur une transformation propre à la tuile. */
  var GLY = [
    /* 0 : cercles concentriques qui respirent */
    function (x, r, t) { var i, a; x.beginPath(); for (i = 0; i < 4; i++) { a = r * (0.28 + 0.24 * i) * (1 + 0.05 * sin(t * 2 + i)); x.moveTo(a, 0); x.arc(0, 0, a, 0, TAU); } x.stroke(); },
    /* 1 : disque plein */
    function (x, r) { x.beginPath(); x.arc(0, 0, r * 0.55, 0, TAU); x.fill(); },
    /* 2 : cercle et point */
    function (x, r) { x.beginPath(); x.arc(0, 0, r, 0, TAU); x.stroke(); x.beginPath(); x.arc(0, 0, r * 0.3, 0, TAU); x.fill(); },
    /* 3 : croix */
    function (x, r) { x.beginPath(); x.moveTo(-r, 0); x.lineTo(r, 0); x.moveTo(0, -r); x.lineTo(0, r); x.stroke(); },
    /* 4 : croix en X */
    function (x, r) { var d = r * 0.75; x.beginPath(); x.moveTo(-d, -d); x.lineTo(d, d); x.moveTo(d, -d); x.lineTo(-d, d); x.stroke(); },
    /* 5 : demi-disque plein au-dessus, demi-cercle au-dessous */
    function (x, r) { x.beginPath(); x.arc(0, 0, r * 0.9, PI, TAU); x.closePath(); x.fill(); x.beginPath(); x.arc(0, 0, r * 0.9, 0, PI); x.stroke(); },
    /* 6 : trois quarts de cercle emboîtés dans un coin */
    function (x, r) { var i, q; x.beginPath(); for (i = 0; i < 3; i++) { q = r * (0.5 + 0.45 * i); x.moveTo(-r, r - q); x.arc(-r, r, q, -PI / 2, 0); } x.stroke(); },
    /* 7 : spirale (le nombre de segments suit le rayon : inutile d'en tracer 90 sur une petite tuile) */
    function (x, r) { var i, a, q, n = segs(r, 2.2, 24, 90); x.beginPath(); for (i = 0; i <= n; i++) { a = i / n * TAU * 2.6; q = r * 0.08 + r * 0.92 * i / n; if (i === 0) x.moveTo(cos(a) * q, sin(a) * q); else x.lineTo(cos(a) * q, sin(a) * q); } x.stroke(); },
    /* 8 : rayons qui tournent */
    function (x, r, t) { var i, a; x.rotate(t * 0.25); x.beginPath(); for (i = 0; i < 16; i++) { a = i / 16 * TAU; x.moveTo(cos(a) * r * 0.35, sin(a) * r * 0.35); x.lineTo(cos(a) * r, sin(a) * r); } x.stroke(); },
    /* 9 : œil */
    function (x, r) { x.beginPath(); x.moveTo(-r, 0); x.quadraticCurveTo(0, -r * 0.95, r, 0); x.quadraticCurveTo(0, r * 0.95, -r, 0); x.stroke(); x.beginPath(); x.arc(0, 0, r * 0.38, 0, TAU); x.stroke(); x.beginPath(); x.arc(0, 0, r * 0.15, 0, TAU); x.fill(); },
    /* 10 : triangle qui tourne */
    function (x, r, t) { x.rotate(-t * 0.3); x.beginPath(); x.moveTo(0, -r); x.lineTo(r * 0.87, r * 0.5); x.lineTo(-r * 0.87, r * 0.5); x.closePath(); x.stroke(); },
    /* 11 : trois carrés emboîtés qui tournent à des vitesses différentes (resserrés pour tenir dans la tuile sans découpe) */
    function (x, r, t) { var i, d, a, prev = 0; for (i = 0; i < 3; i++) { a = PI / 4 + t * 0.15 * (i - 1); x.rotate(a - prev); prev = a; d = r * (0.3 + 0.2 * i); x.strokeRect(-d, -d, 2 * d, 2 * d); } },
    /* 12 : trois vagues */
    function (x, r, t) { var i, s, px, py, n = segs(r, 0.7, 12, 24); for (i = 0; i < 3; i++) { x.beginPath(); for (s = 0; s <= n; s++) { px = -r + s / n * 2 * r; py = (i - 1) * r * 0.55 + sin(s / n * TAU * 1.5 + t * 2 + i) * r * 0.2; if (s === 0) x.moveTo(px, py); else x.lineTo(px, py); } x.stroke(); } },
    /* 13 : neuf points qui pulsent */
    function (x, r, t) { var i, j, q, cx, cy; x.beginPath(); for (j = -1; j <= 1; j++) for (i = -1; i <= 1; i++) { q = r * (0.08 + 0.1 * (1 + sin(t * 1.5 + i * 1.3 + j * 0.9))) + r * 0.03; cx = i * r * 0.62; cy = j * r * 0.62; x.moveTo(cx + q, cy); x.arc(cx, cy, q, 0, TAU); } x.fill(); },
    /* 14 : demi-cercles empilés */
    function (x, r) { var i, q; x.beginPath(); for (i = 0; i < 4; i++) { q = r * (0.3 + 0.22 * i); x.moveTo(-q, r * 0.4); x.arc(0, r * 0.4, q, PI, TAU); } x.stroke(); },
    /* 15 : croissant */
    function (x, r) { x.beginPath(); x.arc(0, 0, r * 0.85, 0, TAU); x.arc(r * 0.22, -r * 0.05, r * 0.62, 0, TAU, true); x.fill(); },
    /* 16 : étoile à cinq branches qui tourne */
    function (x, r, t) { var i, a, q; x.rotate(t * 0.2); x.beginPath(); for (i = 0; i < 10; i++) { a = i / 10 * TAU - PI / 2; q = i % 2 ? r * 0.42 : r; if (i === 0) x.moveTo(cos(a) * q, sin(a) * q); else x.lineTo(cos(a) * q, sin(a) * q); } x.closePath(); x.stroke(); },
    /* 17 : carré rayé */
    function (x, r) { var i, d = r * 0.85; x.strokeRect(-d, -d, 2 * d, 2 * d); x.beginPath(); for (i = -3; i <= 3; i++) { x.moveTo(-d, i * d / 3.5); x.lineTo(d, i * d / 3.5); } x.stroke(); },
    /* 18 : damier de deux cases */
    function (x, r) { var d = r * 0.85; x.fillRect(-d, -d, d, d); x.fillRect(0, 0, d, d); x.strokeRect(-d, -d, 2 * d, 2 * d); },
    /* 19 : trois chevrons */
    function (x, r) { var i, o; x.beginPath(); for (i = 0; i < 3; i++) { o = r * (0.4 * (i - 1) + 0.3); x.moveTo(-r * 0.8, o + r * 0.15); x.lineTo(0, o - r * 0.25); x.lineTo(r * 0.8, o + r * 0.15); } x.stroke(); },
    /* 20 : six cercles autour d'un centre, qui tournent (une fleur) */
    function (x, r, t) { var i, a, cx, cy; x.rotate(t * 0.18); x.beginPath(); for (i = 0; i < 6; i++) { a = i / 6 * TAU; cx = cos(a) * r * 0.5; cy = sin(a) * r * 0.5; x.moveTo(cx + r * 0.5, cy); x.arc(cx, cy, r * 0.5, 0, TAU); } x.stroke(); },
    /* 21 : cible en croix */
    function (x, r) { x.beginPath(); x.arc(0, 0, r * 0.35, 0, TAU); x.moveTo(r * 0.7, 0); x.arc(0, 0, r * 0.7, 0, TAU); x.moveTo(-r, 0); x.lineTo(r, 0); x.moveTo(0, -r); x.lineTo(0, r); x.stroke(); },
    /* 22 : globe à rayures horizontales */
    function (x, r) { var i, h, y; x.beginPath(); x.arc(0, 0, r, 0, TAU); for (i = -3; i <= 3; i++) { y = i * r / 3.6; h = Math.sqrt(Math.max(0, r * r - y * y)); x.moveTo(-h, y); x.lineTo(h, y); } x.stroke(); },
    /* 23 : carrés emboîtés */
    function (x, r) { var i, d; for (i = 0; i < 4; i++) { d = r * (0.28 + 0.24 * i); x.strokeRect(-d, -d, 2 * d, 2 * d); } },
    /* 24 : camembert qui se remplit et se vide */
    function (x, r, t) { var a = (0.5 + 0.5 * sin(t * 0.9)) * TAU * 0.75 + 0.6; x.beginPath(); x.arc(0, 0, r * 0.9, 0, TAU); x.stroke(); x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, r * 0.9, -PI / 2, -PI / 2 + a); x.closePath(); x.fill(); },
    /* 25 : couronne de douze points qui tourne */
    function (x, r, t) { var i, a, cx, cy, q = r * 0.11; x.rotate(t * 0.12); x.beginPath(); for (i = 0; i < 12; i++) { a = i / 12 * TAU; cx = cos(a) * r * 0.85; cy = sin(a) * r * 0.85; x.moveTo(cx + q, cy); x.arc(cx, cy, q, 0, TAU); } x.fill(); },
    /* 26 : cinq barres qui montent et descendent */
    function (x, r, t) { var i, h; for (i = 0; i < 5; i++) { h = r * (0.3 + 0.65 * (0.5 + 0.5 * sin(t * 2.2 + i * 1.1))); x.fillRect(-r * 0.85 + i * r * 0.36, -h, r * 0.24, 2 * h); } },
    /* 27 : galet qui ondule */
    function (x, r, t) { var i, a, q, n = segs(r, 2.2, 28, 90); x.beginPath(); for (i = 0; i <= n; i++) { a = i / n * TAU; q = r * (0.8 + 0.12 * sin(a * 5 + t * 1.6)); if (i === 0) x.moveTo(cos(a) * q, sin(a) * q); else x.lineTo(cos(a) * q, sin(a) * q); } x.closePath(); x.stroke(); },
    /* 28 : deux cercles qui se recouvrent */
    function (x, r) { x.beginPath(); x.arc(-r * 0.32, 0, r * 0.62, 0, TAU); x.stroke(); x.beginPath(); x.arc(r * 0.32, 0, r * 0.62, 0, TAU); x.stroke(); },
    /* 29 : huit rayons qui tournent lentement */
    function (x, r, t) { var i, a; x.rotate(t * 0.1); x.beginPath(); for (i = 0; i < 8; i++) { a = i / 8 * TAU; x.moveTo(0, 0); x.lineTo(cos(a) * r, sin(a) * r); } x.stroke(); },
    /* 30 : trois arcs concentriques qui tournent */
    function (x, r, t) { var i, q, a; x.rotate(t * 0.3); x.beginPath(); for (i = 0; i < 3; i++) { q = r * (0.35 + 0.28 * i); a = i * 1.1; x.moveTo(cos(a) * q, sin(a) * q); x.arc(0, 0, q, a, a + TAU * 0.72); } x.stroke(); },
    /* 31 : cinq points de plus en plus gros */
    function (x, r) { var i, q, cx; x.beginPath(); for (i = 0; i < 5; i++) { q = r * (0.06 + 0.055 * i); cx = -r * 0.8 + i * r * 0.4; x.moveTo(cx + q, 0); x.arc(cx, 0, q, 0, TAU); } x.fill(); }
  ];

  /* familles de symboles, avec les pondérations du kit (les doublons rendent un symbole plus fréquent) */
  var GLY_CIRC = [0, 1, 2, 5, 14, 15, 20, 21, 22, 24, 25, 27, 28, 30, 0, 0, 21, 14, 30];
  var GLY_LINE = [3, 4, 7, 8, 12, 17, 19, 23, 26, 29, 10, 11, 16, 18, 6, 9, 13, 31];
  var GLY_MIX = [], THEMES, THEME_ORDER = [2, 0, 1, 2, 0, 2, 1];
  (function () { var i; for (i = 0; i < GLY.length; i++) GLY_MIX.push(i); GLY_MIX = GLY_MIX.concat([0, 0, 21, 14, 30]); THEMES = [GLY_CIRC, GLY_LINE, GLY_MIX]; })();

  var CMIN = 60;       /* plus petite cellule : sert aussi à dimensionner la grille virtuelle (qui couvre le cadre à cette taille) */
  var TILES = 360;     /* nombre de tuiles visibles au plus : au-delà, la cellule grandit (le coût du tracé suit le nombre de tuiles) */
  var DUR = 1.1;       /* durée d'apparition ou de disparition d'un bloc, en secondes de simulation */
  var FADE = 0.65;     /* durée du fondu d'un symbole vers le suivant */
  var LIFE = 12;       /* durée d'une donne avant son renouvellement par une vague */
  var BASE = 0.9;      /* opacité de base de l'encre */
  var SETTLE = 250;    /* ms sans changement d'un réglage de disposition avant d'en tenir compte */
  var EPS = 0.015;     /* écart d'un réglage de disposition (Tuiles pleines, Grands blocs, Tuiles de quatre) qui justifie une nouvelle disposition */
  var STEP = 0.004;    /* écart d'un réglage entre deux mises à jour au-delà duquel c'est une main sur le curseur (un cran fait 0,01), pas la dérive de la variation automatique (moins de 0,002 par image) */

  function ease(p) { p = p < 0 ? 0 : p > 1 ? 1 : p; return p * p * (3 - 2 * p); }
  function evenCeil(v) { return 2 * Math.ceil(v / 2); }
  /* taille de cellule effective : le réglage, mais jamais sous CMIN ni sous la taille qui donnerait plus de TILES tuiles dans le cadre.
     Continue en la taille du cadre et en le réglage : aucune coupure, la variation automatique reste fluide. */
  function cellSize(p, w, h) { var f = Math.sqrt(w * h / TILES), c = p.cell > CMIN ? p.cell : CMIN; return c > f ? c : f; }
  /* taille de l'écran physique (0 si inconnue) : la grille virtuelle est allouée pour lui, pour qu'un redimensionnement de la fenêtre ne la reconstruise pas */
  function screenSize() { var s = typeof screen !== "undefined" ? screen : null; return [s && s.width > 0 ? s.width : 0, s && s.height > 0 ? s.height : 0]; }

  BgGen.register({
    id: "glyphs",
    kit: "22",
    group: "Motifs et ondes",
    label: "Pavage de glyphes",
    note: "Trente-deux petits symboles collés bord à bord, quelques blocs doubles et des tuiles de quatre, que chaque bloc remplace en fondu. La planche 22.",
    int: 0.55,
    params: [
      range("cell", "Taille des cellules", CMIN, 220, 2, 96, "px", false),
      range("weight", "Épaisseur du trait", 0.5, 2.2, 0.05, 1),
      range("speed", "Vitesse", 0.2, 3, 0.05, 1),
      range("swap", "Rythme des échanges", 0.1, 3, 0.05, 1),
      range("inv", "Tuiles pleines", 0, 0.5, 0.01, 0.17),
      range("big", "Grands blocs", 0, 0.4, 0.01, 0.22),
      range("quad", "Tuiles de quatre", 0, 0.5, 0.01, 0.2),
      select("family", "Symboles", [["auto", "Alternés (kit)"], ["mix", "Tous"], ["circ", "Cercles"], ["line", "Traits"]], "auto")
    ],
    mount: function (S, api) {
      var cur = S, r, rand, cs = 96, W = 2, H = 2, gc = 2, gr = 2, K = 1, OX = 0, OY = 0, LW = 2, INKC = "", PAPC = "", col = -1, c = null;
      var curL = [], old = null, oldEnd = 0, last = 0, deals = 0, themeIx = 0;
      /* réglages qui décident de la disposition, tels qu'ils étaient à la dernière donne (lay), tels que vus à la dernière mise à jour (seen) ;
         want : une nouvelle donne est demandée ; pend : un réglage de disposition a bougé depuis le dernier calme ; tm : minuteur du calme */
      var lay = { big: 0, quad: 0, inv: 0, family: "" }, seen = { big: 0, quad: 0, inv: 0 }, want = false, pend = false, tm = 0;

      /* ----- couleur : 0 encre, 1 papier (pour le symbole « découpé » d'une tuile pleine) */
      function setCol(i) { if (col !== i) { col = i; c.fillStyle = c.strokeStyle = i ? PAPC : INKC; } }

      /* ----- tirages */
      function pickG() { var f = cur.p.family, q = f === "circ" ? GLY_CIRC : f === "line" ? GLY_LINE : f === "mix" ? GLY_MIX : THEMES[THEME_ORDER[themeIx % THEME_ORDER.length]]; return q[(rand() * q.length) | 0]; }
      function invP(size) { return clamp(cur.p.inv * (size === 2 ? 1.4 : 1), 0, 1); }
      function swapK() { var s = cur.p.swap; return s > 0.05 ? s : 0.05; }
      function gap() { return (0.8 + rand() * 2.2) / swapK(); }
      function quadSet() { return [pickG(), pickG(), pickG(), pickG()]; }
      function quadInv() { var p = invP(1); return [rand() < p, rand() < p, rand() < p, rand() < p]; }

      function mkBlock(gx, gy, size, start, t0) {
        var b = {
          gx: gx, gy: gy, size: size, g: pickG(), inv: rand() < invP(size), ac: size === 1 && rand() < 0.4 ? 1 + ((rand() * 3) | 0) : 0,
          ng: -1, ninv: false, fs: 0, nt: Math.max(start, t0) + (0.3 + rand() * 3) / swapK(), start: start, out: 0, ph: rand() * 6,
          quad: size === 1 && rand() < cur.p.quad, q: null, qi: null, nq: null, nqi: null
        };
        if (b.quad) { b.q = quadSet(); b.qi = quadInv(); b.ac = 0; }
        return b;
      }

      /* la grille virtuelle gc x gr est centrée sur le cadre : la partie visible dépend de la taille de cellule, sans jamais bouger le dessin */
      function makeLayout(t0, instant, ox, oy, k) {
        var N = gc * gr, occ = new Uint8Array(N), order = new Int32Array(N), nBig, tries = 0, maxTries, big = 0, i, j, tmp, x, y, gx, gy, blocks = [];
        for (i = 0; i < N; i++) order[i] = i;
        for (i = N - 1; i > 0; i--) { j = (rand() * (i + 1)) | 0; tmp = order[i]; order[i] = order[j]; order[j] = tmp; }
        nBig = Math.round(N * cur.p.big / 4 * (0.75 + 0.5 * rand())); maxTries = nBig * 25 + 20;
        while (big < nBig && tries++ < maxTries) {
          gx = (rand() * (gc - 1)) | 0; gy = (rand() * (gr - 1)) | 0;
          if (occ[gy * gc + gx] || occ[gy * gc + gx + 1] || occ[(gy + 1) * gc + gx] || occ[(gy + 1) * gc + gx + 1]) continue;
          occ[gy * gc + gx] = occ[gy * gc + gx + 1] = occ[(gy + 1) * gc + gx] = occ[(gy + 1) * gc + gx + 1] = 1;
          big++;
          blocks.push(mkBlock(gx, gy, 2, instant ? -1e9 : t0 + Math.hypot(gx + 1 - ox, gy + 1 - oy) * k + rand() * 0.2, t0));
        }
        for (i = 0; i < N; i++) {
          x = order[i] % gc; y = (order[i] / gc) | 0;
          if (occ[y * gc + x]) continue;
          occ[y * gc + x] = 1;
          blocks.push(mkBlock(x, y, 1, instant ? -1e9 : t0 + Math.hypot(x + 0.5 - ox, y + 0.5 - oy) * k + rand() * 0.2, t0));
        }
        return blocks;
      }

      /* une donne : l'ancienne disposition se retire par une vague partie d'un point du cadre, la nouvelle arrive derrière */
      function deal(t, instant) {
        var vc = W / cs, vr = H / cs, ox = gc / 2 + (rand() * 2 - 1) * vc / 2, oy = gr / 2 + (rand() * 2 - 1) * vr / 2;
        var k = clamp(0.8 / Math.hypot(vc, vr), 0.015, 0.06), i, b, mx = 0;
        themeIx = deals;
        if (instant) old = null;
        else {
          old = curL;
          for (i = 0; i < old.length; i++) { b = old[i]; b.out = t + Math.hypot(b.gx + b.size / 2 - ox, b.gy + b.size / 2 - oy) * k + rand() * 0.2; if (b.out > mx) mx = b.out; }
          oldEnd = mx + DUR;
        }
        curL = makeLayout(t, instant, ox, oy, k); deals++; last = t; want = false;
        lay.big = cur.p.big; lay.quad = cur.p.quad; lay.inv = cur.p.inv; lay.family = cur.p.family;
      }

      /* repart du seed : disposition déterministe, instantanée (c'est aussi l'image figée d'un réglage de disposition changé en pause) */
      function reset(rr) {
        clearTimeout(tm); tm = 0; pend = false;
        rand = api.rng(cur.seed); deals = 0; old = null; W = rr.w; H = rr.h; cs = cellSize(cur.p, W, H);
        deal(rr.t, true);
      }

      /* un réglage de disposition (Tuiles pleines, Grands blocs, Tuiles de quatre) a changé puis s'est calmé. En image figée, on recompose la
         planche depuis le seed pour que le réglage se voie ; en direct, on demande une donne (une vague), sauf pour Tuiles pleines, qui agit
         déjà à chaque échange. La variation automatique n'arme jamais ce minuteur (voir update). */
      function settle() {
        var p = cur.p, dB, dQ, dI;
        tm = 0;
        if (!pend) return;
        pend = false;
        dB = Math.abs(p.big - lay.big) > EPS; dQ = Math.abs(p.quad - lay.quad) > EPS; dI = Math.abs(p.inv - lay.inv) > EPS;
        if (r.paused) { if (dB || dQ || dI) { reset(r); r.dirty = true; } }
        else if (dB || dQ) want = true;
      }

      /* ----- dessin d'un symbole dans une tuile (sc : échelle d'apparition) */
      function tile(b, g, inv, alpha, sc, t) {
        var half = cs * b.size / 2, rad = cs * 0.44 * b.size * 0.98, ins = cs * 0.0267, ac = b.ac, w1 = LW * (b.size === 2 ? 1.7 : 1);
        c.setTransform(K * sc, 0, 0, K * sc, K * (OX + (b.gx + b.size / 2) * cs), K * (OY + (b.gy + b.size / 2) * cs));
        c.globalAlpha = alpha * BASE; c.lineWidth = w1;
        if (inv) { setCol(0); c.fillRect(-half + ins, -half + ins, 2 * (half - ins), 2 * (half - ins)); setCol(1); } else setCol(0);
        if (ac === 1) { c.beginPath(); c.arc(-half + cs * 0.12, -half + cs * 0.12, cs * 0.04, 0, TAU); c.fill(); }
        else if (ac === 2) { c.lineWidth = LW * 0.52; c.strokeRect(-half + cs * 0.067, -half + cs * 0.067, 2 * half - cs * 0.134, 2 * half - cs * 0.134); c.lineWidth = w1; }
        else if (ac === 3) { c.lineWidth = LW * 0.6; c.beginPath(); c.arc(half - cs * 0.027, half - cs * 0.027, half * 0.42, PI, PI * 1.5); c.stroke(); c.lineWidth = w1; }
        GLY[g](c, rad, t + b.ph);
      }

      function quad(b, q, qi, alpha, sc, t) {
        var k, sx, sy, h = cs / 4, ins = cs * 0.02, cx = OX + (b.gx + 0.5) * cs, cy = OY + (b.gy + 0.5) * cs, rad = cs * 0.22;
        c.globalAlpha = alpha * BASE; c.lineWidth = LW * 0.65;
        for (k = 0; k < 4; k++) {
          sx = (k & 1 ? 1 : -1) * h; sy = (k & 2 ? 1 : -1) * h;
          c.setTransform(K * sc, 0, 0, K * sc, K * (cx + sx * sc), K * (cy + sy * sc));
          if (qi[k]) { setCol(0); c.fillRect(-h + ins, -h + ins, 2 * (h - ins), 2 * (h - ins)); setCol(1); } else setCol(0);
          GLY[q[k]](c, rad, t + b.ph + k);
        }
      }

      /* un bloc : fondu d'un symbole vers le suivant, puis nouvelle échéance. En image figée, le symbole d'arrivée s'affiche, sans rien faire avancer. */
      function block(b, alpha, sc, t, still) {
        var p;
        if (b.quad) {
          if (still) { if (b.nq) quad(b, b.nq, b.nqi, alpha, sc, t); else quad(b, b.q, b.qi, alpha, sc, t); return; }
          if (b.nq) {
            p = ease((t - b.fs) / FADE);
            if (p >= 1) { b.q = b.nq; b.qi = b.nqi; b.nq = null; b.nt = t + gap(); quad(b, b.q, b.qi, alpha, sc, t); return; }
            quad(b, b.q, b.qi, alpha * (1 - p), sc, t); quad(b, b.nq, b.nqi, alpha * p, sc, t);
          } else {
            if (t >= b.nt) { b.nq = quadSet(); b.nqi = quadInv(); b.fs = t; }
            quad(b, b.q, b.qi, alpha, sc, t);
          }
          return;
        }
        if (still) { if (b.ng >= 0) tile(b, b.ng, b.ninv, alpha, sc, t); else tile(b, b.g, b.inv, alpha, sc, t); return; }
        if (b.ng >= 0) {
          p = ease((t - b.fs) / FADE);
          if (p >= 1) { b.g = b.ng; b.inv = b.ninv; b.ng = -1; b.nt = t + gap(); tile(b, b.g, b.inv, alpha, sc, t); return; }
          tile(b, b.g, b.inv, alpha * (1 - p), sc, t); tile(b, b.ng, b.ninv, alpha * p, sc, t);
        } else {
          if (t >= b.nt) { b.ng = pickG(); b.ninv = rand() < invP(b.size); b.fs = t; }
          tile(b, b.g, b.inv, alpha, sc, t);
        }
      }

      function visible(b) {
        var hs = b.size * cs / 2 + 2, cx = OX + (b.gx + b.size / 2) * cs, cy = OY + (b.gy + b.size / 2) * cs;
        return cx + hs > 0 && cx - hs < W && cy + hs > 0 && cy - hs < H;
      }

      r = api.runner(api.host, {
        maxDpr: 1.5,
        /* la grille virtuelle est allouée pour le plus grand de la fenêtre et de l'écran, et ne se reconstruit que si le cadre sort de ce qu'elle couvre
           (à la plus petite cellule) : un redimensionnement léger (barre d'adresse mobile, fenêtre) ne recompose rien, la grille reste centrée sur le cadre */
        resize: function (rr) {
          var sc = screenSize();
          W = rr.w; H = rr.h;
          if (gc < evenCeil(Math.ceil(W / CMIN) + 2) || gr < evenCeil(Math.ceil(H / CMIN) + 2)) {
            gc = Math.max(gc, evenCeil(Math.ceil(Math.max(W, sc[0]) / CMIN) + 2)); gr = Math.max(gr, evenCeil(Math.ceil(Math.max(H, sc[1]) / CMIN) + 2));
            reset(rr);
          }
        },
        frame: function (rr) {
          var p = cur.p, t = rr.t, still = rr.paused, i, b, pp;
          c = rr.ctx; K = rr.k; W = rr.w; H = rr.h; cs = cellSize(p, W, H);
          OX = W / 2 - gc * cs / 2; OY = H / 2 - gr * cs / 2; LW = cs * 0.0307 * p.weight;
          c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, rr.cv.width, rr.cv.height);
          c.lineCap = "round"; c.lineJoin = "round";
          INKC = api.inkCss(1); PAPC = api.paperCss(1); col = -1; setCol(0);
          if (!still) {
            if (old && t > oldEnd) old = null;
            if (!old && (want || t - last > LIFE)) deal(t, false);
            if (old) for (i = 0; i < old.length; i++) { b = old[i]; pp = ease((t - b.out) / DUR); if (pp < 0.998 && visible(b)) block(b, 1 - pp, 1, t, false); }
          }
          for (i = 0; i < curL.length; i++) {
            b = curL[i]; pp = still ? 1 : ease((t - b.start) / DUR);
            if (pp > 0.002 && visible(b)) block(b, pp, 0.95 + 0.05 * pp, t, still);
          }
          c.globalAlpha = 1; c.setTransform(1, 0, 0, 1, 0, 0);
        }
      });
      r.speed = cur.p.speed > 0 ? cur.p.speed : 1;
      r.paused = !S.live;
      seen.big = S.p.big; seen.quad = S.p.quad; seen.inv = S.p.inv;

      return {
        update: function (S) {
          var p = S.p, seedChanged = S.seed !== cur.seed;
          cur = S; r.paused = !S.live; r.dirty = true; r.speed = p.speed > 0 ? p.speed : 1;
          if (seedChanged) reset(r);
          /* Symboles est une liste, jamais variée : le changement est net, on le prend tout de suite (en direct : une donne ; en pause : on recompose) */
          else if (p.family !== lay.family) { if (r.paused) reset(r); else want = true; }
          /* les réglages numériques de disposition : un saut net (la main sur le curseur) arme un minuteur, qu'un nouveau saut repousse ; la dérive
             lente de la variation automatique n'arme rien, donc elle ne recompose jamais, ni en direct, ni en pause, ni quand elle s'arrête */
          if (Math.abs(p.big - seen.big) > STEP || Math.abs(p.quad - seen.quad) > STEP || Math.abs(p.inv - seen.inv) > STEP) { pend = true; clearTimeout(tm); tm = setTimeout(settle, SETTLE); }
          seen.big = p.big; seen.quad = p.quad; seen.inv = p.inv;
        },
        destroy: function () { clearTimeout(tm); tm = 0; r.destroy(); },
        recolor: function () { r.redraw(); },
        png: function () { return r.cv; }
      };
    },
    code: function (S) { return JSON.stringify({ systeme: "glyphes", planche: 22, seed: S.seed, params: S.p }); }
  });
})();

/* ---- gen-types/noise.js */
/* Déformation par le bruit : planches 23 (anneaux), 24 (papier découpé) et 25 (crêtes) du kit.
   Même idée trois fois : un bruit lisse, glissé très lentement dans l'espace, pousse une forme vers l'avant ou l'arrière
   (un cercle pour les anneaux et le papier découpé, un terrain pour les crêtes). Rien n'est redessiné : seul le bruit glisse. */
(function () {
  "use strict";
  var A = BgGen.api, TAU = A.TAU, clamp = A.clamp, inkRgb = A.ink, isDark = A.isDark;
  var range = BgGen.range, toggle = BgGen.toggle;

  /* couleur [r, g, b] et opacité en texte CSS (la couleur de l'encre se lit une fois par image, pas une fois par tracé) */
  function css(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }

  /* l'unité du kit (un dessin de 600 x 750) ramenée à l'écran : jamais sous 1,1, plus grande sur grand écran */
  function unit(w, h) { return Math.max(1.1, Math.min(w, h) / 500); }

  /* table d'angles partagée par les deux systèmes à base de cercle */
  var NP = 384, CS = new Float32Array(NP), SN = new Float32Array(NP);
  (function () { for (var i = 0; i < NP; i++) { CS[i] = Math.cos(i / NP * TAU); SN[i] = Math.sin(i / NP * TAU); } })();

  /* Squelette commun : horloge intégrée image par image (la vitesse peut changer sans saut de phase), seed, pause, thème.
     cfg : t0 (instant de départ), scale, maxDpr, init(st, S) (bruit et tampons dépendant du seed), resize(rr, st, S), frame(rr, S, T, st). */
  function boot(S, api, cfg) {
    var cur = S, T = cfg.t0, st = {}, r;
    cfg.init(st, cur);
    r = api.runner(api.host, {
      scale: cfg.scale, maxDpr: cfg.maxDpr,
      resize: function (rr) { cfg.resize(rr, st, cur); },
      frame: function (rr, dt) { if (!rr.paused) T += dt * cur.p.speed; cfg.frame(rr, cur, T, st); }
    });
    r.paused = !cur.live;
    return {
      update: function (S) {
        var again = S.seed !== cur.seed;
        cur = S;
        if (again) { T = cfg.t0; cfg.init(st, cur); }
        r.paused = !S.live; r.dirty = true;
      },
      destroy: r.destroy,
      recolor: function () { r.redraw(); },
      png: function () { return r.cv; }
    };
  }

  /* ------------------------------------------------------------------ 23 : anneaux */
  /* Lignes de niveau de (distance au centre moins bruit) : chaque anneau est trouvé le long de chaque rayon par quelques pas de point fixe,
     en partant de l'anneau précédent. Une bande sur deux est pleine d'encre. Les anneaux continuent au-delà du disque du kit pour remplir tout le cadre. */
  function ringsFrame(rr, cur, T, st) {
    var p = cur.p, ctx = rr.ctx, w = rr.w, h = rr.h, s = unit(w, h), cx = w / 2, cy = h / 2, nz = st.nz, rad = st.rad, RF = st.rf;
    var gap = p.gap, core = p.core, LMAX = 226, sc = p.scale, k1 = 1.1 / (230 * sc), k2 = 2.4 / (230 * sc), dw = p.detail;
    /* garde-fou : au-delà d'un certain rapport amplitude / taille des ondulations, les anneaux se croisent et se replient ;
       l'amplitude réelle plafonne alors (sans saut) à ce que la pente du bruit permet, 2,25 étant sa pente haute en unités du bruit */
    var A0 = Math.min(p.amp, 1.05 / ((0.78 * 1.1 + dw * 2.4) / (230 * sc) * 2.25));
    var a = T * 0.11, b = T * 0.09, o1x = 0.9 * Math.sin(a) + 3, o1y = 0.9 * Math.cos(b), o2x = 1.2 * Math.cos(a * 1.3) + 9, o2y = -1.2 * Math.sin(b * 1.1) + 4;
    var rmax = Math.sqrt(cx * cx + cy * cy) / s + A0 + 4, J = Math.ceil(rmax / gap), tol = 0.12 / s, segMax = 7 * s, cull = A0 * s + 10 * s;
    var j, i, it, L, rho, stp, r, rn = 0, d, c, sn, amp, f, x, y, i1, len, a0, a1, m;
    /* J pair : les bandes pleines sont entre un anneau impair et le suivant, le disque central reste vide */
    if (J & 1) J++;
    if (J > 150) J = 150;
    ctx.setTransform(rr.k, 0, 0, rr.k, 0, 0); ctx.clearRect(0, 0, w, h);
    for (i = 0; i < NP; i++) rad[i] = 0;
    ctx.beginPath();
    for (j = 1; j <= J; j++) {
      L = j * gap; rho = L * s;
      stp = Math.floor(segMax * NP / (TAU * rho)); stp = stp < 1 ? 1 : stp > 10 ? 10 : stp;   /* au moins 38 points par anneau */
      for (i = 0; i < NP; i += stp) {
        c = CS[i]; sn = SN[i];
        if (rho > RF[i] + cull) rn = L;   /* bien hors du cadre : inutile de calculer le bruit */
        else {
          r = rad[i] + gap;
          for (it = 0; it < 4; it++) {
            x = r * c; y = r * sn;
            f = nz(x * k1 + o1x, y * k1 + o1y) * 0.78;
            if (dw > 0.001) f += nz(x * k2 + o2x, y * k2 + o2y) * dw;
            f = f < -1 ? -1 : f > 1 ? 1 : f;
            amp = A0 * (core + (1 - core) * (r < LMAX ? r / LMAX : 1));
            rn = L + amp * f; if (rn < 2) rn = 2;
            d = rn - r; r = rn;
            if (d < tol && d > -tol) break;
          }
        }
        rad[i] = rn;
        x = cx + rn * s * c; y = cy + rn * s * sn;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      /* les rayons sautés prennent une valeur interpolée : elle sert de départ à l'anneau suivant */
      if (stp > 1) for (i = 0; i < NP; i += stp) {
        i1 = i + stp; len = i1 > NP ? NP - i : stp; a0 = rad[i]; a1 = i1 >= NP ? rad[0] : rad[i1];
        for (m = 1; m < len; m++) rad[i + m] = a0 + (a1 - a0) * m / len;
      }
    }
    if (p.lines) { ctx.strokeStyle = css(inkRgb(), 0.8); ctx.lineWidth = p.weight * Math.max(0.8, s * 0.55); ctx.lineJoin = "round"; ctx.stroke(); }
    else { ctx.fillStyle = css(inkRgb(), 0.9); ctx.fill("evenodd"); }
  }

  BgGen.register({
    id: "noise-rings", kit: "23", group: "Déformation par le bruit", label: "Anneaux déformés", int: 0.5,
    note: "Un cercle poussé par un bruit qui glisse, dessiné en anneaux dont une bande sur deux est pleine. La planche 23.",
    params: [
      range("gap", "Écart des anneaux", 5, 16, 0.1, 8.7, "", false),
      range("amp", "Amplitude", 10, 80, 1, 60),
      range("scale", "Taille des ondulations", 0.7, 2, 0.05, 1),
      range("detail", "Détail fin", 0, 0.6, 0.01, 0.28),
      range("core", "Agitation du centre", 0, 0.6, 0.01, 0.12),
      range("speed", "Vitesse", 0, 3, 0.05, 1),
      toggle("lines", "Traits seuls", false),
      range("weight", "Épaisseur du trait", 0.6, 3, 0.05, 1.2)
    ],
    mount: function (S, api) {
      return boot(S, api, {
        t0: 7, scale: 1, maxDpr: 1.25,
        init: function (st, c) { st.nz = A.noise(c.seed + "|anneaux"); st.rad = new Float32Array(NP); },
        resize: function (rr, st) {
          var cx = rr.w / 2, cy = rr.h / 2, i, ex, ey;
          st.rf = new Float32Array(NP);
          /* distance du centre au bord du cadre, le long de chaque rayon */
          for (i = 0; i < NP; i++) { ex = Math.abs(CS[i]); ey = Math.abs(SN[i]); st.rf[i] = Math.min(ex < 1e-6 ? 1e9 : cx / ex, ey < 1e-6 ? 1e9 : cy / ey); }
        },
        frame: ringsFrame
      });
    },
    code: function (S) { return JSON.stringify({ systeme: "noise-rings", planche: 23, seed: S.seed, params: S.p }); }
  });

  /* ------------------------------------------------------------------ 24 : papier découpé */
  /* Des silhouettes empilées, chacune poussée un peu différemment par le même bruit. Chaque feuille efface ce qu'elle recouvre
     (le papier de la page se voit à travers, grain compris), puis se remplit d'encre de plus en plus dense vers le haut de la pile,
     et jette une ombre douce sur la feuille du dessous. La tranche capte un peu de lumière : de l'encre sur fond sombre, du papier sur fond clair.
     L'ombre est faite de SHN bandes autour de la silhouette, de moins en moins opaques vers l'extérieur (pas de shadowBlur, coûteux sans GPU).
     Les bandes ne se recouvrent pas : chacune porte l'opacité cumulée qu'auraient eu les couronnes emboîtées (même rendu), mais la surface
     remplie est celle d'une seule couronne, (SHN + 1) / 2 fois moins que SHN couronnes emboîtées. Le coût d'une rastérisation logicielle
     dépend surtout du nombre de tracés (SHN + 3 par feuille) et de leur hauteur en pixels, d'où SHN = 6 et un canevas à 0,6. */
  var SHN = 6;
  /* ajoute au tracé en cours le contour de la silhouette de la couche, grossi de d (pixels) le long de chaque rayon et décalé de dy vers le bas ;
     un rayon sur stp. Deux contours dans un même tracé, remplis en pair-impair, laissent la bande qui les sépare. */
  function cutContour(ctx, st, cx, cy, d, dy, stp) {
    var rv = st.rv, i, r;
    for (i = 0; i < NP; i += stp) {
      r = rv[i] + d;
      if (i) ctx.lineTo(cx + r * CS[i], cy + r * SN[i] + dy); else ctx.moveTo(cx + r * CS[i], cy + r * SN[i] + dy);
    }
    ctx.closePath();
  }

  function cutFrame(rr, cur, T, st) {
    var p = cur.p, ctx = rr.ctx, w = rr.w, h = rr.h, s = unit(w, h), cx = w / 2, cy = h / 2, nz = st.nz, N = Math.round(p.layers), rv = st.rv;
    var Rout = Math.sqrt(cx * cx + cy * cy) * 0.9, Rin = Rout * 0.17, dark = isDark(), ink = inkRgb(), paper = A.paper(), shadeRgb = dark ? [0, 0, 0] : ink;
    var sc = p.scale, k, i, j, frac, tone, R, amp, a, b, q, shA, D, dy, e, c, sn, f0, f1, tr, ax, ay, bx, by, stp, stp2;
    ctx.setTransform(rr.k, 0, 0, rr.k, 0, 0); ctx.clearRect(0, 0, w, h);
    ctx.lineJoin = "round";
    for (k = 0; k < N; k++) {
      frac = N > 1 ? k / (N - 1) : 1;
      tone = 0.04 + (p.tone - 0.04) * Math.pow(frac, 0.85);
      R = Rout + (Rin - Rout) * frac; amp = p.amp * (1 + 0.25 * frac);
      a = T * 0.1 + k * 0.55; b = T * 0.08 - k * 0.4;
      ax = 0.8 * Math.sin(a) + 5; ay = 0.8 * Math.cos(b); bx = 1.0 * Math.cos(a * 1.2) + 2; by = -1.0 * Math.sin(b * 1.3) + 7;
      /* le pas d'échantillonnage suit la taille de la feuille : jamais de segment de plus de 14 unités d'écran environ, au moins 64 points */
      stp = Math.floor(14 * s * NP / (TAU * R)); stp = stp < 1 ? 1 : stp > 6 ? 6 : stp;
      stp2 = stp * 2; if (stp2 > 12) stp2 = 12;   /* l'ombre, floue de toute façon, se contente de moins de points */
      for (i = 0; i < NP; i += stp) {
        c = CS[i]; sn = SN[i];
        q = nz(c * 1.05 * sc + ax, sn * 1.05 * sc + ay) * 0.8 + nz(c * 2.2 * sc + bx, sn * 2.2 * sc + by) * 0.25;
        q = q < -1 ? -1 : q > 1 ? 1 : q;
        rv[i] = R * (1 + amp * q);
      }
      /* 1. l'ombre portée sur ce qui est dessous : des bandes de plus en plus larges autour de la silhouette, décalées vers le bas,
            de moins en moins opaques (ce qui passerait sous la feuille sera effacé par la feuille elle-même).
            La bande j va de l'enveloppe j - 1 (ou de la feuille elle-même pour j = 0) à l'enveloppe j, qui déborde de D (j + 1) / SHN. */
      shA = (k ? 0.32 : 0.24) * p.shadow * (dark ? 1 : 1.4);
      if (shA > 0.004) {
        D = (k ? 12 : 22) * s * (0.5 + 0.5 * p.shadow); dy = (k ? 5 : 10) * s * p.shadow;
        tr = 1;
        for (j = SHN - 1; j >= 0; j--) {
          /* chute quadratique de l'opacité avec la distance au bord : l'enveloppe j ajoute shA (f0 au carré moins f1 au carré),
             et la bande j reçoit tout ce qui s'ajoute de j jusqu'à l'extérieur (composition de couches de même couleur) */
          f0 = 1 - (j + 0.5) / SHN; f1 = 1 - (j + 1.5) / SHN; f1 = f1 > 0 ? f1 * f1 : 0;
          tr *= 1 - shA * (f0 * f0 - f1);
          ctx.beginPath();
          cutContour(ctx, st, cx, cy, D * (j + 1) / SHN, dy, stp2);
          if (j) cutContour(ctx, st, cx, cy, D * j / SHN, dy, stp2); else cutContour(ctx, st, cx, cy, 0, 0, stp);
          ctx.fillStyle = css(shadeRgb, 1 - tr); ctx.fill("evenodd");
        }
      }
      /* 2. la feuille cache ce qu'elle recouvre : réserve laissant voir la page, 3. puis elle prend son encre */
      ctx.beginPath(); cutContour(ctx, st, cx, cy, 0, 0, stp);
      if (k) { ctx.globalCompositeOperation = "destination-out"; ctx.fillStyle = "#000"; ctx.fill(); ctx.globalCompositeOperation = "source-over"; }   /* la première feuille n'a rien dessous */
      ctx.fillStyle = css(ink, tone); ctx.fill();
      /* 4. la tranche qui accroche la lumière */
      if (k && p.edge > 0.01) {
        e = p.edge * (0.3 - 0.2 * frac);
        ctx.strokeStyle = css(dark ? ink : paper, e); ctx.lineWidth = Math.max(1, 0.8 * s); ctx.stroke();
      }
    }
  }

  BgGen.register({
    id: "noise-cut", kit: "24", group: "Déformation par le bruit", label: "Papier découpé", int: 0.6,
    note: "Des feuilles empilées, chacune poussée un peu autrement par le même bruit, soulevées par leur ombre. La planche 24.",
    params: [
      range("layers", "Couches", 4, 16, 1, 10, "", false),
      range("amp", "Déformation", 0.05, 0.4, 0.01, 0.2),
      range("scale", "Taille des découpes", 0.6, 2, 0.05, 1),
      range("speed", "Vitesse", 0, 3, 0.05, 1),
      range("shadow", "Ombres", 0, 2, 0.05, 1),
      range("tone", "Contraste des strates", 0.3, 1, 0.01, 0.85),
      range("edge", "Reflet des tranches", 0, 1, 0.01, 0.6)
    ],
    mount: function (S, api) {
      return boot(S, api, {
        /* 0,6 : le coût d'une rastérisation logicielle suit le nombre de lignes de pixels de chaque tracé (une centaine de tracés par image) */
        t0: 9, scale: 0.6, maxDpr: 1,
        init: function (st, c) { st.nz = A.noise(c.seed + "|decoupe"); st.rv = new Float32Array(NP); },
        resize: function () {},
        frame: cutFrame
      });
    },
    code: function (S) { return JSON.stringify({ systeme: "noise-cut", planche: 24, seed: S.seed, params: S.p }); }
  });

  /* ------------------------------------------------------------------ 25 : crêtes */
  /* bruit de valeur 3D lisse et bruit « ridged » (crêtes aiguës, vallées larges), repris du kit */
  function hh(x, y, z) { var h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177); h = Math.imul(h ^ (h >>> 13), 1103515245); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
  function vn(x, y, z) {
    var xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = x - xi, fy = y - yi, fz = z - zi;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
    var a = hh(xi, yi, zi), b = hh(xi + 1, yi, zi), c = hh(xi, yi + 1, zi), d = hh(xi + 1, yi + 1, zi);
    var e = hh(xi, yi, zi + 1), f = hh(xi + 1, yi, zi + 1), g = hh(xi, yi + 1, zi + 1), h = hh(xi + 1, yi + 1, zi + 1);
    var x1 = a + (b - a) * fx, x2 = c + (d - c) * fx, x3 = e + (f - e) * fx, x4 = g + (h - g) * fx;
    var y1 = x1 + (x2 - x1) * fy, y2 = x3 + (x4 - x3) * fy;
    return y1 + (y2 - y1) * fz;
  }
  /* det : nombre d'octaves, fractionnaire (la dernière s'estompe) pour que le réglage varie sans saut.
     La somme est ramenée à l'échelle des quatre octaves : le relief garde sa hauteur quand on retire des octaves. */
  function rf(x, y, z, det) {
    var amp = 0.5, sum = 0, norm = 0, i, n, wgt;
    for (i = 0; i < 4; i++) {
      wgt = det - i; if (wgt <= 0) break; if (wgt > 1) wgt = 1;
      n = 1 - Math.abs(vn(x, y, z) * 2 - 1); sum += amp * wgt * n * n; norm += amp * wgt;
      x = x * 2.03 + 1.7; y = y * 2.03 + 9.2; z = z * 2.03 + 3.1; amp *= 0.5;
    }
    return norm > 0 ? sum * 0.9375 / norm : 0;
  }

  /* Des rangées de terrain tracées de l'avant vers l'arrière ; l'horizon (le point le plus haut déjà tracé à chaque colonne)
     cache ce qui est derrière un relief, sans aucun remplissage : le canevas reste transparent. */
  function ridgeFrame(rr, cur, T, st) {
    var p = cur.p, ctx = rr.ctx, w = rr.w, h = rr.h, NR = Math.round(p.rows), NX = st.nx, X = st.x, UX = st.u, U2 = st.u2, y = st.y, top = st.top, dx = st.dx;
    var sc = p.scale, det = p.detail, ir = 1 / p.reach, ox = st.ox, oy = st.oy, zt = T * 0.045 + st.oz, ink = inkRgb();
    var hs = Math.min(h, 1.25 * w) / 750, amp0 = 520 * hs * p.height, ws = clamp(Math.min(w, h) / 750, 0.9, 1.6) * p.weight;
    var yb0 = 0.12 * h, yb1 = 1.02 * h, q, i, z, v, v2, vz, by, lift, rr2, t, e, yi, di, dprev = 0, inRun, tt;
    ctx.setTransform(rr.k, 0, 0, rr.k, 0, 0); ctx.clearRect(0, 0, w, h);
    ctx.lineJoin = "bevel"; ctx.lineCap = "butt";
    for (i = 0; i < NX; i++) top[i] = 1e9;
    for (q = NR - 1; q >= 0; q--) {
      z = NR > 1 ? q / (NR - 1) : 1; v = z * 2 - 1; v2 = 0.95 * v * v; vz = v * 1.35 * sc + 1.7 + oy;
      by = yb0 + z * (yb1 - yb0); lift = amp0 * (0.55 + 0.45 * z);
      for (i = 0; i < NX; i++) {
        rr2 = Math.sqrt(U2[i] + v2) * ir;
        if (rr2 >= 0.999) { y[i] = by; continue; }
        t = (1 - rr2) / 0.88; if (t > 1) t = 1;   /* palier plein au cœur du relief, comme le smooth() borné du kit */
        e = t * t * (3 - 2 * t); e = e * e * (1.5 - 0.5 * e);
        y[i] = by - e * (rf(UX[i] * 1.35 * sc + 3.1 + ox, vz, zt, det) - 0.1) * lift;
      }
      /* seules les parties au-dessus de l'horizon sont tracées, coupées exactement à son passage */
      ctx.beginPath(); inRun = false;
      for (i = 0; i < NX; i++) {
        yi = y[i]; di = top[i] - yi;
        if (i > 0) {
          if (di > 0) {
            if (inRun) ctx.lineTo(X[i], yi);
            else { tt = -dprev / (di - dprev); ctx.moveTo(X[i - 1] + tt * dx, y[i - 1] + tt * (yi - y[i - 1])); ctx.lineTo(X[i], yi); inRun = true; }
          } else if (inRun) { tt = dprev / (dprev - di); ctx.lineTo(X[i - 1] + tt * dx, y[i - 1] + tt * (yi - y[i - 1])); inRun = false; }
        } else if (di > 0) { ctx.moveTo(X[0], yi); inRun = true; }
        dprev = di;
      }
      ctx.strokeStyle = css(ink, 0.55 + 0.45 * z); ctx.lineWidth = (0.9 + 0.9 * z) * ws; ctx.stroke();
      for (i = 0; i < NX; i++) if (y[i] < top[i]) top[i] = y[i];
    }
  }

  BgGen.register({
    id: "noise-ridges", kit: "25", group: "Déformation par le bruit", label: "Crêtes", int: 0.7,
    note: "Un terrain en rangées de lignes, soulevé par un bruit en crêtes : chaque rangée cache celles de derrière. La planche 25.",
    params: [
      range("rows", "Lignes", 30, 110, 1, 62, "", false),
      range("height", "Hauteur du relief", 0.3, 1.8, 0.01, 1),
      range("scale", "Taille du relief", 0.6, 2.2, 0.05, 1),
      range("detail", "Détail (octaves)", 1, 4, 0.05, 4),
      range("reach", "Étendue du relief", 0.5, 2.2, 0.01, 1.3),
      range("speed", "Vitesse", 0, 3, 0.05, 1),
      range("weight", "Épaisseur du trait", 0.4, 2.2, 0.05, 1)
    ],
    mount: function (S, api) {
      return boot(S, api, {
        t0: 9, scale: 1, maxDpr: 1.25,
        init: function (st, c) { var q = A.rng(c.seed + "|cretes"); st.ox = q() * 400; st.oy = q() * 400; st.oz = q() * 400; },
        resize: function (rr, st) {
          /* une même grille de colonnes pour toutes les rangées : l'horizon se lit colonne par colonne */
          /* pas des colonnes : la quatrième octave (période d'environ w / 28 pixels) doit garder au moins 4 échantillons par période,
             donc w / 130 jusqu'à 6 pixels (téléphone : 3 pixels), puis w / 260 au-delà de 1560 pixels (le pas grandit avec l'écran) */
          var w = rr.w, dx = w > 1560 ? w / 260 : Math.min(6, Math.max(2.5, w / 130)), nx = Math.ceil(w / dx) + 3, Ux = 0.8 * w / 2, i;
          st.dx = dx; st.nx = nx; st.x = new Float32Array(nx); st.u = new Float32Array(nx); st.u2 = new Float32Array(nx); st.y = new Float32Array(nx); st.top = new Float32Array(nx);
          for (i = 0; i < nx; i++) { st.x[i] = (i - 1) * dx; st.u[i] = (st.x[i] - w / 2) / Ux; st.u2[i] = 0.8 * st.u[i] * st.u[i]; }
        },
        frame: ridgeFrame
      });
    },
    code: function (S) { return JSON.stringify({ systeme: "noise-ridges", planche: 25, seed: S.seed, params: S.p }); }
  });
})();

/* ---- gen-types/usage-a.js */
/* Le système en usage, première partie : la planche contact (26, « Faire beaucoup, choisir »)
   et le maillage de Voronoï en fond de page (30). Deux planches du kit portées en canevas plein cadre. */
(function () {
  "use strict";
  var A = BgGen.api, EP = A.EP, TAU = A.TAU, clamp = A.clamp, smooth = A.smooth, doc = document;
  var range = BgGen.range, toggle = BgGen.toggle, select = BgGen.select;

  function rgbStr(c) { return "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")"; }
  function clock() { return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now(); }

  /* ======================================================================= 26 : planche contact */
  /* Douze tirages d'un même champ de flux, un par seed. On les regarde tous, puis on en met trois en avant.
     Chaque case est un champ de flux du design system (flowLines) mis en cache dans un petit canevas ; l'image ne fait que les recopier. */
  var NT = 12, CYCLE = 26, START = 3, PRINT = 18;
  var FONT = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  var CHOICES = [["none", "Aucun"]];
  (function () { for (var n = 1; n <= NT; n++) CHOICES.push([String(n), "Tirage " + n]); })();

  /* ce que le tirage n donne en champ de flux plein cadre : seed, échelle, déformation et disque vide, arrondis aux pas des réglages */
  function tirage(seedBase, i) {
    var sd = seedBase + "-" + (i + 1), q = A.rng(sd + "|tirage"), sf = 0.75 + 0.85 * q(), wf = 0.8 + 0.6 * q(), hf = q() < 0.4 ? 0.14 + 0.2 * q() : 0;
    return { seed: sd, sf: Math.round(sf * 20) / 20, wf: Math.round(wf * 20) / 20, hf: Math.round(hf * 100) / 100 };
  }

  BgGen.register({
    id: "contact", kit: "26", group: "Le système en usage", label: "Faire beaucoup, choisir", heavy: true,
    note:"Douze tirages du même champ de flux, un par seed : on les regarde tous, on n'en garde que quelques-uns. La planche 26.",
    int: 0.6,
    params: [
      select("choose", "Garder un tirage", CHOICES, "none"),
      range("sep", "Écart des lignes", 3, 8, 0.2, 3.8, "", false),
      range("weight", "Épaisseur du trait", 0.5, 2.2, 0.05, 1, "", false),
      range("speed", "Vitesse du cycle", 0.2, 2.5, 0.05, 1),
      range("emph", "Mise en avant", 0, 1, 0.05, 1),
      range("wash", "Voile des cases", 0, 0.12, 0.005, 0.04),
      toggle("nums", "Numéros des tirages", true)
    ],
    mount: function (S, api) {
      var cur = S, r, handled = String(S.p.choose);
      var cols = 4, rows = 3, TW = 100, TH = 100, ox = 0, oy = 0, GAP = 8, tiles = [], infos = [], infoSeed = null, picks = [], isPick = [], i;
      for (i = 0; i < NT; i++) tiles.push({ cv: null, lines: null, lk: "", pk: "" });

      function setInfos() {
        if (infoSeed === cur.seed) return;
        infoSeed = cur.seed;
        var q = api.rng(cur.seed + "|choix"), a = [], j, t, k;
        for (j = 0; j < NT; j++) { infos[j] = tirage(cur.seed, j); a.push(j); }
        for (j = NT - 1; j > 0; j--) { k = (q() * (j + 1)) | 0; t = a[j]; a[j] = a[k]; a[k] = t; }
        picks = a.slice(0, 3);
        for (j = 0; j < NT; j++) isPick[j] = picks.indexOf(j) >= 0;
      }

      /* la grille : 4 x 3 en paysage, 3 x 4 en portrait, centrée et remplissant le cadre */
      function layout(w, h) {
        var mn = Math.min(w, h), M = clamp(mn * 0.05, 14, 56);
        GAP = clamp(mn * 0.018, 6, 20);
        cols = w >= h ? 4 : 3; rows = NT / cols;
        TW = Math.max(24, Math.floor((w - 2 * M - (cols - 1) * GAP) / cols)); TH = Math.max(24, Math.floor((h - 2 * M - (rows - 1) * GAP) / rows));
        ox = (w - cols * TW - (cols - 1) * GAP) / 2; oy = (h - rows * TH - (rows - 1) * GAP) / 2;
      }

      /* trace les lignes d'une case dans son petit canevas, à l'encre du thème */
      function paint(t, inf, k, weight, inkS) {
        var cw = Math.max(2, Math.ceil(TW * k)), ch = Math.max(2, Math.ceil(TH * k)), c, L, j, m;
        if (!t.cv) t.cv = doc.createElement("canvas");
        if (t.cv.width !== cw || t.cv.height !== ch) { t.cv.width = cw; t.cv.height = ch; }
        c = t.cv.getContext("2d"); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cw, ch);
        c.setTransform(k, 0, 0, k, 0, 0);
        c.strokeStyle = inkS; c.lineWidth = weight; c.lineCap = "round"; c.lineJoin = "round";
        c.beginPath();
        for (j = 0; j < t.lines.length; j++) { L = t.lines[j]; if (!L.length) continue; c.moveTo(L[0][0], L[0][1]); for (m = 1; m < L.length; m++) c.lineTo(L[m][0], L[m][1]); }
        c.stroke();
        if (inf.hf > 0) { c.lineWidth = weight * 1.8; c.beginPath(); c.arc(TW / 2, TH / 2, inf.hf * Math.min(TW, TH) / 2, 0, TAU); c.stroke(); }
      }

      /* fabrique les cases périmées, au plus n par image (une seule en direct, trois en pause), et on s'arrête dès que 5 ms sont écoulées
         (une case coûte de 3 à 12 ms selon la taille d'écran) : une pause, un redimensionnement ou un changement de seed
         ne bloquent donc jamais l'image, l'ancien dessin reste affiché en attendant. Renvoie le nombre de cases encore périmées.
         L'écart et l'épaisseur suivent la taille d'une case (référence : 290 px de côté moyen) pour que le dessin reste lisible de 390 px à 2560 px */
      function ensure(n, p, k, inkS) {
        var z = Math.sqrt(TW * TH) / 290, sep = p.sep * clamp(z, 0.62, 1.5), wt = p.weight * clamp(z, 0.85, 1.35);
        var lkey = cur.seed + "|" + sep.toFixed(2) + "|" + TW + "|" + TH, pkey = lkey + "|" + wt.toFixed(2) + "|" + inkS + "|" + k, ops = 0, left = 0, t0 = clock(), t;
        for (var j = 0; j < NT; j++) {
          t = tiles[j];
          if (t.lk === lkey && t.pk === pkey) continue;
          if (ops >= n || (ops > 0 && clock() - t0 > 5)) { left++; continue; }
          if (t.lk !== lkey) {
            t.lines = EP.engine.flowLines({ w: TW, h: TH, seed: infos[j].seed, sep: sep, step: 2.2, scale: 2.04 * infos[j].sf / TW, warp: infos[j].wf, hole: infos[j].hf, margin: 7, maxLen: 220, minPts: 10 });
            t.lk = lkey;
          }
          paint(t, infos[j], k, wt, inkS); t.pk = pkey; ops++;
        }
        return left;
      }

      function tile(ctx, j, alpha, sc, pk, p, inkS) {
        var col = j % cols, row = (j / cols) | 0, w = TW * sc, h = TH * sc, x = ox + col * (TW + GAP) - (w - TW) / 2, y = oy + row * (TH + GAP) - (h - TH) / 2, t = tiles[j];
        if (!t.cv) return;
        if (p.wash > 0) { ctx.globalAlpha = alpha * p.wash; ctx.fillStyle = inkS; ctx.fillRect(x, y, w, h); }
        ctx.globalAlpha = alpha; ctx.drawImage(t.cv, x, y, w, h);
        ctx.lineWidth = 1 + 1.6 * pk; ctx.strokeStyle = inkS; ctx.globalAlpha = alpha * (0.4 + 0.6 * pk);
        ctx.strokeRect(x, y, w, h);
        if (p.nums) { ctx.globalAlpha = alpha * (0.5 + 0.4 * pk); ctx.fillStyle = inkS; ctx.fillText(j < 9 ? "0" + (j + 1) : String(j + 1), x + 7, y + 6); }
      }

      r = api.runner(api.host, {
        maxDpr: 1.5,
        resize: function (rr) { layout(rr.w, rr.h); },
        frame: function (rr) {
          var p = cur.p, live = cur.live, ctx = rr.ctx, rgb = api.ink(), inkS = rgbStr(rgb), T, u, wrapped, g, pk, grow, j, q, a, sc, order = [], off;
          setInfos(); rr.speed = p.speed;
          /* en pause, tant qu'il reste des cases à fabriquer on redemande une image : la planche se complète en quelques images */
          if (ensure(live ? 1 : 3, p, rr.k, inkS) > 0) rr.dirty = true;
          T = live ? START + rr.t : PRINT; u = T % CYCLE; wrapped = T >= CYCLE; off = wrapped ? 1 : 0;
          g = 1 - smooth(CYCLE - 2.2, CYCLE, u); if (wrapped) g *= smooth(0, 1.3, u);
          pk = smooth(12, 13.6, u) * p.emph; grow = Math.min(0.045, 0.7 * GAP / Math.max(TW, TH));   /* la case grossie ne mord jamais sur sa voisine */
          ctx.setTransform(rr.k, 0, 0, rr.k, 0, 0); ctx.clearRect(0, 0, rr.w, rr.h);
          ctx.font = clamp(TW * 0.055, 9, 13).toFixed(1) + "px " + FONT; ctx.textBaseline = "top"; ctx.textAlign = "left";
          for (j = 0; j < NT; j++) if (!isPick[j]) order.push(j);
          for (j = 0; j < picks.length; j++) order.push(picks[j]);
          for (j = 0; j < order.length; j++) {
            var n = order[j];
            q = smooth(0.7 * n + off, 0.7 * n + off + 1.3, u);
            if (q <= 0.003 || g <= 0.003) continue;
            if (isPick[n]) { sc = 1 + grow * pk; tile(ctx, n, g * q, sc, pk, p, inkS); }
            else { a = q * (1 - 0.86 * pk); tile(ctx, n, g * a, 1, 0, p, inkS); }
          }
          ctx.globalAlpha = 1;
        }
      });
      r.speed = S.p.speed;
      setInfos();

      return {
        update: function (S) {
          var c = String(S.p.choose), n, inf;
          cur = S; r.paused = !S.live; r.dirty = true; r.speed = S.p.speed;
          /* un tirage choisi : on demande le champ de flux de ce seed, une seule fois ; le choix retombe sur « Aucun » */
          if (c !== handled) {
            handled = c; n = parseInt(c, 10);
            if (n >= 1 && n <= NT) {
              setInfos(); inf = infos[n - 1];
              try { S.p.choose = "none"; } catch (e) { /* réglages figés : rien à remettre */ }
              /* pendant la variation automatique, S.p est une copie : on remet aussi le choix dans les réglages du panneau, s'il les expose */
              try { if (window.BgGenerator && window.BgGenerator.store && window.BgGenerator.store[S.type]) window.BgGenerator.store[S.type].choose = "none"; } catch (e2) { /* sans panneau : rien à remettre */ }
              api.pick({ type: "field", seed: inf.seed, params: { scale: inf.sf, warp: inf.wf, hole: inf.hf } });
            }
          }
        },
        destroy: function () { r.destroy(); for (var j = 0; j < NT; j++) { tiles[j].cv = null; tiles[j].lines = null; } },
        recolor: function () { r.redraw(); },
        png: function () { return r.cv; }
      };
    },
    code: function (S) { return JSON.stringify({ systeme: "contact", planche: 26, seed: S.seed, params: S.p }); }
  });

  /* ================================================================ 30 : Voronoï en fond de page */
  /* Un maillage de Voronoï exact (découpe de polygones) dont chaque graine dérive en rond et glisse vers le centre de sa cellule.
     Les murs restent fins ; la teinte et les graines se rassemblent dans une zone calme, là où il n'y aurait pas de texte. */
  var NMAX = 96, PS = NMAX * 2 + 16;

  /* découpe un polygone convexe (suite x, y) par le demi-plan d'un côté d'une médiatrice ; renvoie le nouveau nombre de valeurs */
  function clip(src, n, dst, mx, my, nx, ny) {
    var out = 0, ax, ay, sa, k, bx, by, sb, t;
    if (n < 2) return 0;
    ax = src[n - 2]; ay = src[n - 1]; sa = (ax - mx) * nx + (ay - my) * ny;
    for (k = 0; k < n; k += 2) {
      bx = src[k]; by = src[k + 1]; sb = (bx - mx) * nx + (by - my) * ny;
      if (sb <= 0) {
        if (sa > 0) { t = sa / (sa - sb); dst[out++] = ax + (bx - ax) * t; dst[out++] = ay + (by - ay) * t; }
        dst[out++] = bx; dst[out++] = by;
      } else if (sa <= 0) { t = sa / (sa - sb); dst[out++] = ax + (bx - ax) * t; dst[out++] = ay + (by - ay) * t; }
      ax = bx; ay = by; sa = sb;
    }
    return out;
  }

  BgGen.register({
    id: "voronoi-page", kit: "30", group: "Le système en usage", label: "Voronoï en fond de page", heavy: true,
    note: "Un maillage de Voronoï qui se relaxe derrière une page : les graines dérivent, les murs restent fins, la teinte se rassemble là où il n'y a pas de texte. La planche 30.",
    int: 0.8,
    params: [
      range("cells", "Cellules (0 : auto)", 0, NMAX, 2, 0, "", false),
      range("drift", "Dérive des graines", 0, 2, 0.05, 1),
      range("relax", "Relaxation", 0, 0.15, 0.005, 0.05),
      range("tint", "Teinte des cellules", 0, 1.5, 0.05, 1),
      range("wall", "Épaisseur des murs", 0.4, 2.4, 0.05, 1),
      range("zx", "Zone calme : x", 0, 1, 0.01, 0.83),
      range("zy", "Zone calme : y", 0, 1, 0.01, 0.28),
      toggle("dots", "Afficher les graines", true)
    ],
    mount: function (S, api) {
      var cur = S, r, N = 0, builtN = 0, W = 2, H = 2, ready = false, stale = true;
      var px = new Float64Array(NMAX), py = new Float64Array(NMAX), cx = new Float64Array(NMAX), cy = new Float64Array(NMAX);
      var ph = new Float64Array(NMAX), om = new Float64Array(NMAX), hs = new Float64Array(NMAX), dd = new Float64Array(NMAX);
      var poly = new Float64Array(NMAX * PS * 2), plen = new Int32Array(NMAX), bufA = new Float64Array(PS * 2), bufB = new Float64Array(PS * 2), idx = [];
      var cmp = function (u, w) { return dd[u] - dd[w]; };

      /* cellules exactes de toutes les graines, et leurs centres de gravité */
      function compute() {
        var s, k, o2, dx, dy, d2, mr2, v, qx, qy, n, src, dst, tmp, a, ccx, ccy, cr, x0, y0, x1, y1, w, base;
        for (s = 0; s < N; s++) {
          for (k = 0; k < N; k++) { dx = px[k] - px[s]; dy = py[k] - py[s]; dd[k] = dx * dx + dy * dy; idx[k] = k; }
          idx.length = N; idx.sort(cmp);
          src = bufA; dst = bufB; src[0] = 0; src[1] = 0; src[2] = W; src[3] = 0; src[4] = W; src[5] = H; src[6] = 0; src[7] = H; n = 8; mr2 = 1e12;
          for (k = 1; k < N; k++) {
            o2 = idx[k]; d2 = dd[o2]; if (d2 > mr2) break;
            dx = px[o2] - px[s]; dy = py[o2] - py[s];
            n = clip(src, n, dst, px[s] + dx * 0.5, py[s] + dy * 0.5, dx, dy);
            tmp = src; src = dst; dst = tmp;
            if (n === 0) break;
            mr2 = 0;
            for (v = 0; v < n; v += 2) { qx = src[v] - px[s]; qy = src[v + 1] - py[s]; d2 = qx * qx + qy * qy; if (d2 > mr2) mr2 = d2; }
            mr2 *= 4;
          }
          base = s * PS * 2; for (v = 0; v < n; v++) poly[base + v] = src[v]; plen[s] = n;
          cx[s] = px[s]; cy[s] = py[s];
          if (n >= 6) {
            a = 0; ccx = 0; ccy = 0;
            for (v = 0; v < n; v += 2) { w = (v + 2) % n; x0 = src[v]; y0 = src[v + 1]; x1 = src[w]; y1 = src[w + 1]; cr = x0 * y1 - x1 * y0; a += cr; ccx += (x0 + x1) * cr; ccy += (y0 + y1) * cr; }
            if (Math.abs(a) > 1e-6) { cx[s] = ccx / (3 * a); cy[s] = ccy / (3 * a); }
          }
        }
        stale = false;
      }

      /* un pas : chaque graine glisse vers le centre de sa cellule et dérive sur un cercle lent. k : nombre d'images de 1/60 s */
      function step(t, k) {
        var p = cur.p, rate = p.relax, unit = Math.sqrt(W * H / Math.max(1, N)) / 73.2, v = 0.36 * p.drift * unit, s, a;
        for (s = 0; s < N; s++) {
          a = ph[s] + om[s] * t;
          px[s] = clamp(px[s] + ((cx[s] - px[s]) * rate + Math.cos(a) * v) * k, 4, W - 4);
          py[s] = clamp(py[s] + ((cy[s] - py[s]) * rate + Math.sin(a) * v) * k, 4, H - 4);
        }
        stale = true;
      }

      /* nombre de cellules voulu. Réglage à 0 : une densité voisine de celle du kit (environ 1 cellule pour 6 000 px²),
         donc de 55 cellules sur un téléphone à 96 sur un écran d'ordinateur (plafond). Il est relu dans les réglages, qui sont modifiés sur place par le panneau */
      function want(p) {
        var c = Math.round(p.cells);
        return c > 0 ? clamp(c, 8, NMAX) : clamp(Math.round(W * H / 6000), 16, NMAX);
      }

      /* graines tirées du seed (toujours dans le même ordre : les premières sont les mêmes quel que soit le nombre de cellules), puis préchauffage */
      function init() {
        var q = api.rng(cur.seed + "|voronoi"), i, k;
        N = want(cur.p); builtN = N;
        for (i = 0; i < NMAX; i++) {
          px[i] = 8 + q() * Math.max(1, W - 16); py[i] = 8 + q() * Math.max(1, H - 16);
          ph[i] = q() * TAU; om[i] = (0.22 + q() * 0.2) * (q() < 0.5 ? -1 : 1); hs[i] = q();
        }
        for (k = 0; k < 26; k++) { compute(); step(k * 0.05, 1.4); }
        compute(); ready = true;
      }

      function draw(rr) {
        var p = cur.p, ctx = rr.ctx, rgb = api.ink(), col = rgbStr(rgb), zx = p.zx * W, zy = p.zy * H, rx = 0.667 * W, ry = 0.627 * H, e = 0.5;
        var s, n, b, v, mk, h, a, x0, y0, x1, y1, dotR = clamp(Math.sqrt(W * H / N) * 0.02, 1.2, 2.6);
        function mask(x, y) { var dx = (x - zx) / rx, dy = (y - zy) / ry; return 1 - smooth(0.12, 1, Math.sqrt(dx * dx + dy * dy)); }
        ctx.setTransform(rr.k, 0, 0, rr.k, 0, 0); ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineJoin = "round"; ctx.lineCap = "round";
        /* la teinte des cellules, plus dense dans la zone calme */
        if (p.tint > 0) {
          for (s = 0; s < N; s++) {
            n = plen[s]; if (n < 6) continue;
            mk = mask(cx[s], cy[s]); h = hs[s] > 0.8 ? 1 : hs[s] * 0.4; a = p.tint * mk * (0.025 + 0.11 * h); if (a < 0.004) continue;
            ctx.globalAlpha = a > 1 ? 1 : a; b = s * PS * 2;
            ctx.beginPath(); ctx.moveTo(poly[b], poly[b + 1]);
            for (v = 2; v < n; v += 2) ctx.lineTo(poly[b + v], poly[b + v + 1]);
            ctx.closePath(); ctx.fill();
          }
        }
        /* les murs, fins ; on ne trace pas les bords du cadre */
        ctx.lineWidth = p.wall;
        for (s = 0; s < N; s++) {
          n = plen[s]; if (n < 6) continue;
          mk = mask(cx[s], cy[s]); ctx.globalAlpha = 0.14 + 0.3 * mk; b = s * PS * 2;
          x0 = poly[b + n - 2]; y0 = poly[b + n - 1];
          ctx.beginPath(); ctx.moveTo(x0, y0);
          for (v = 0; v < n; v += 2) {
            x1 = poly[b + v]; y1 = poly[b + v + 1];
            if ((x0 <= e && x1 <= e) || (x0 >= W - e && x1 >= W - e) || (y0 <= e && y1 <= e) || (y0 >= H - e && y1 >= H - e)) ctx.moveTo(x1, y1); else ctx.lineTo(x1, y1);
            x0 = x1; y0 = y1;
          }
          ctx.stroke();
        }
        if (p.dots) {
          for (s = 0; s < N; s++) { ctx.globalAlpha = 0.14 + 0.5 * mask(px[s], py[s]); ctx.beginPath(); ctx.arc(px[s], py[s], dotR, 0, TAU); ctx.fill(); }
        }
        ctx.globalAlpha = 1;
      }

      r = api.runner(api.host, {
        maxDpr: 1.25,
        resize: function (rr) {
          var ow = W, oh = H, i;
          W = rr.w; H = rr.h;
          if (!ready || want(cur.p) !== builtN) { init(); return; }   /* en mode auto, le cadre change le nombre de cellules */
          for (i = 0; i < NMAX; i++) { px[i] *= W / ow; py[i] *= H / oh; }
          compute();
        },
        frame: function (rr, dt) {
          if (cur.live) { compute(); step(rr.t, clamp(dt * 60, 0.3, 3)); }
          else if (stale) compute();
          draw(rr);
        }
      });

      return {
        update: function (S) {
          /* le nombre construit est gardé dans builtN : les réglages (S.p) sont un seul objet modifié sur place, on ne peut pas les comparer à l'ancien */
          var redo = S.seed !== cur.seed || want(S.p) !== builtN;
          cur = S; r.paused = !S.live; r.dirty = true;
          if (redo) init();
        },
        destroy: r.destroy,
        recolor: function () { r.redraw(); },
        png: function () { return r.cv; }
      };
    },
    code: function (S) { return JSON.stringify({ systeme: "voronoi-page", planche: 30, seed: S.seed, params: S.p }); }
  });
})();

/* ---- gen-types/usage-b.js */
/* Le système en usage (suite) : trois planches du kit portées en canevas plein cadre.
   28 Le système en caractères, 31 Le système en identité, 32 Le système piloté par des données. */
(function () {
  "use strict";
  var A = BgGen.api, TAU = A.TAU, clamp = A.clamp, smooth = A.smooth, doc = document;
  var range = BgGen.range, toggle = BgGen.toggle, select = BgGen.select, text = BgGen.text;
  var GROUP = "Le système en usage";

  function hashStr(s) { var h = 2166136261, i; s = String(s); for (i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  /* ================================================================== 28 : le système en caractères */
  /* Un mot rempli par un champ de flux : les lignes ne se dessinent que dans les lettres (masque). Le champ est échantillonné sur une grille
     grossière à chaque image (deux bruits par noeud), puis les lignes le suivent par interpolation bilinéaire. */
  var T_FONTS = {
    "Arial Black": { weight: 900, stack: '"Arial Black", "Helvetica Neue", Impact, Arial, sans-serif', cap: 0.72, bold: 0 },
    "Instrument Serif": { weight: 400, stack: '"Instrument Serif", "Iowan Old Style", Georgia, serif', cap: 0.7, bold: 0.022 },
    "Instrument Sans": { weight: 700, stack: '"Instrument Sans", system-ui, -apple-system, "Segoe UI", sans-serif', cap: 0.7, bold: 0 }
  };
  /* pas de tracé double de celui du kit (5,6 au lieu de 2,8) pour deux fois moins d'étapes, à longueur égale : les courbes sont lentes, la différence est invisible */
  /* plafond de segments par image : 45 000 ménage les machines sans accélération (vers 55 000, la rastérisation logicielle dépasse 100 ms) ; le réglage par défaut en trace environ 29 000 */
  var T_SEGS = 45000, T_STEP = 5.6, T_F = 0.0075, T_PERIOD = 90, T_START = 9, T_DMAX = 1.5, T_NMAX = 4600;
  function fontOf(F, size) { return F.weight + " " + size.toFixed(1) + "px " + F.stack; }
  function linesOf(t) {
    var a = String(t == null ? "" : t).split("|"), out = [], i, s;
    for (i = 0; i < a.length && out.length < 5; i++) { s = a[i].replace(/^\s+|\s+$/g, ""); if (s) out.push(s); }
    return out.length ? out : ["SYS", "TEM"];
  }

  BgGen.register({
    id: "type", kit: "28", group: GROUP, label: "Système en caractères",
    note: "Un mot rempli par un champ de flux : les lignes ne vivent que dans les lettres. La planche 28.",
    int: 0.6,
    params: [
      text("text", "Texte (| pour changer de ligne)", "SYS|TEM", 28),
      select("font", "Police", [["Arial Black", "Arial Black"], ["Instrument Serif", "Instrument Serif"], ["Instrument Sans", "Instrument Sans"]], "Arial Black"),
      range("density", "Densité des lignes", 0.3, 1.5, 0.05, 1),
      range("len", "Longueur des lignes", 6, 36, 1, 20),
      range("drift", "Vitesse de dérive", 0, 4, 0.05, 1),
      range("weight", "Épaisseur du trait", 0.5, 2.2, 0.05, 1),
      range("outline", "Contour des lettres", 0, 1, 0.05, 0.5)
    ],
    mount: function (S, api) {
      var cur = S, dead = false, key = "", r, asked = {};
      var maskCv = doc.createElement("canvas"), loCv = doc.createElement("canvas"), outCv = doc.createElement("canvas");
      var sx = new Float32Array(0), sy = new Float32Array(0), nSeeds = 0;
      var gx0 = 0, gy0 = 0, gs = 8, gnx = 2, gny = 2, gC = new Float32Array(4), gS = new Float32Array(4);
      var nA = api.noise(S.seed + ":a"), nB = api.noise(S.seed + ":b"), u = 1, ph = T_START / T_PERIOD * TAU;
      var L = { ls: ["SYS", "TEM"], sz: 100, cap: 72, pitch: 82, y0: 0, F: T_FONTS["Arial Black"] };

      function keyOf(rr) { var p = cur.p; return [p.text, p.font, rr.w, rr.h, rr.k, cur.seed].join("|"); }
      /* dessine le mot dans un contexte déjà mis à l'échelle en pixels CSS : rempli, et élargi de lw / 2 tout autour si lw > 0.01 (fausse graisse, ou halo) */
      function drawWord(g, W, lw) {
        var j, x = W / 2, y;
        g.font = fontOf(L.F, L.sz); g.textAlign = "center"; g.textBaseline = "alphabetic"; g.lineJoin = "round"; g.lineWidth = lw;
        for (j = 0; j < L.ls.length; j++) {
          y = L.y0 + j * L.pitch; g.fillText(L.ls[j], x, y);
          if (lw > 0.01) g.strokeText(L.ls[j], x, y);
        }
      }
      function ensureFont(F, name) {
        if (asked[name] || !doc.fonts || !doc.fonts.load) return; asked[name] = 1;
        try { doc.fonts.load(F.weight + " 48px " + F.stack, "ABCabc").then(function () { if (!dead) { key = ""; if (r) r.dirty = true; } }, function () {}); } catch (e) { /* sans effet */ }
      }

      function build(rr) {
        var p = cur.p, W = rr.w, H = rr.h, k = rr.k, F = T_FONTS[p.font] || T_FONTS["Arial Black"], ls = linesOf(p.text), n = ls.length, i, wmax = 1, w;
        ensureFont(F, p.font in T_FONTS ? p.font : "Arial Black");
        var lg = loCv.getContext("2d");
        lg.setTransform(1, 0, 0, 1, 0, 0); lg.font = fontOf(F, 100);
        for (i = 0; i < n; i++) { w = lg.measureText(ls[i]).width; if (w > wmax) wmax = w; }
        /* hauteur de capitale mesurée (la police de repli peut différer) ; valeur du tableau si la mesure est absente */
        var capR = lg.measureText("H").actualBoundingBoxAscent / 100; if (!(capR > 0.55 && capR < 0.95)) capR = F.cap;
        /* le mot tient dans le cadre, en largeur comme en hauteur */
        var pr = capR + 0.1, szW = 100 * 0.9 * W / wmax, szH = 0.86 * H / ((n - 1) * pr + capR), sz = Math.min(szW, szH);
        L.ls = ls; L.F = F; L.sz = sz; L.cap = capR * sz; L.pitch = pr * sz; L.y0 = (H - ((n - 1) * L.pitch + L.cap)) / 2 + L.cap;
        u = Math.max(0.12, L.cap / 171);   /* 171 : hauteur de capitale du kit (en unités de planche) */

        /* masque pleine résolution (les lettres) */
        maskCv.width = Math.max(2, Math.round(W * k)); maskCv.height = Math.max(2, Math.round(H * k));
        var bwd = L.F.bold * sz, ow = Math.max(0.8, 1.3 * u), mg = maskCv.getContext("2d");
        mg.setTransform(k, 0, 0, k, 0, 0); mg.fillStyle = mg.strokeStyle = "#000"; drawWord(mg, W, bwd);
        /* contour : un anneau d'encre posé juste hors du bord des lettres, préparé une fois (le thème le refait) */
        outCv.width = maskCv.width; outCv.height = maskCv.height;
        var og = outCv.getContext("2d"); og.setTransform(k, 0, 0, k, 0, 0); og.fillStyle = og.strokeStyle = api.inkCss(1);
        drawWord(og, W, bwd + 2 * ow); og.globalCompositeOperation = "destination-out"; drawWord(og, W, bwd); og.globalCompositeOperation = "source-over";

        /* carte d'alpha réduite, pour choisir les graines */
        var qs = Math.max(1, u, Math.sqrt(W * H / 1.2e6)), lw = Math.max(2, Math.ceil(W / qs)), lh = Math.max(2, Math.ceil(H / qs));
        loCv.width = lw; loCv.height = lh; lg = loCv.getContext("2d"); lg.setTransform(1 / qs, 0, 0, 1 / qs, 0, 0); lg.fillStyle = lg.strokeStyle = "#000"; drawWord(lg, W, bwd);
        var a = lg.getImageData(0, 0, lw, lh).data;
        var S0 = Math.max(9 * u / Math.sqrt(T_DMAX), Math.sqrt(W * H / 400000)), off = 9 * u, pass, gxx, gyy, ddx, ddy, rnd, xs, ys, sx_, sy_, hit, px, py;
        for (pass = 0; pass < 3; pass++) {
          rnd = api.rng(cur.seed + ":s"); xs = []; ys = [];
          for (gyy = 0; gyy < H; gyy += S0) for (gxx = 0; gxx < W; gxx += S0) {
            sx_ = gxx + rnd() * S0; sy_ = gyy + rnd() * S0; hit = false;
            for (ddy = -1; ddy <= 1 && !hit; ddy++) for (ddx = -1; ddx <= 1; ddx++) {
              px = Math.round((sx_ + ddx * off) / qs); py = Math.round((sy_ + ddy * off) / qs);
              if (px >= 0 && py >= 0 && px < lw && py < lh && a[(py * lw + px) * 4 + 3] > 128) { hit = true; break; }
            }
            if (hit) { xs.push(sx_); ys.push(sy_); }
          }
          if (xs.length <= T_NMAX) break;
          S0 *= Math.sqrt(xs.length / T_NMAX) * 1.02;
        }
        /* ordre aléatoire : la densité garde simplement les premières graines */
        n = xs.length; var o = api.rng(cur.seed + ":o"), idx = new Array(n), t, j, bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
        for (i = 0; i < n; i++) idx[i] = i;
        for (i = n - 1; i > 0; i--) { j = (o() * (i + 1)) | 0; t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
        sx = new Float32Array(n); sy = new Float32Array(n); nSeeds = n;
        for (i = 0; i < n; i++) {
          sx[i] = xs[idx[i]]; sy[i] = ys[idx[i]];
          if (sx[i] < bx0) bx0 = sx[i]; if (sx[i] > bx1) bx1 = sx[i]; if (sy[i] < by0) by0 = sy[i]; if (sy[i] > by1) by1 = sy[i];
        }
        if (!n) { bx0 = 0; by0 = 0; bx1 = 1; by1 = 1; }
        /* grille du champ : la boîte des graines, un peu élargie */
        var ext = 12 * u, bw = bx1 - bx0 + 2 * ext, bh = by1 - by0 + 2 * ext;
        gx0 = bx0 - ext; gy0 = by0 - ext; gs = Math.max(4 * u, Math.sqrt(bw * bh / 16000));
        gnx = Math.ceil(bw / gs) + 2; gny = Math.ceil(bh / gs) + 2;
        gC = new Float32Array(gnx * gny); gS = new Float32Array(gnx * gny);
        nA = api.noise(cur.seed + ":a"); nB = api.noise(cur.seed + ":b");
        key = keyOf(rr);
      }

      r = api.runner(api.host, {
        maxDpr: 1, resize: function () { key = ""; },
        frame: function (rr, dt) {
          var p = cur.p, k = rr.k, ctx = rr.ctx;
          if (key !== keyOf(rr)) build(rr);
          if (!rr.paused) ph += dt * p.drift * TAU / T_PERIOD;
          var ox = Math.cos(ph) * 1.7, oy = Math.sin(ph) * 1.7, fq = T_F / u, i, j, x, y, a, id, gw = gnx, gh = gny, gX = gx0, gY = gy0, gstep = gs;
          for (j = 0; j < gh; j++) {
            y = (gY + j * gstep) * fq;
            for (i = 0; i < gw; i++) {
              x = (gX + i * gstep) * fq;
              a = (nA(x + ox, y + oy) + 0.22 * nB(x * 2.7 + oy, y * 2.7 - ox)) * 6.5973445;
              id = j * gw + i; gC[id] = Math.cos(a); gS[id] = Math.sin(a);
            }
          }
          ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, rr.cv.width, rr.cv.height);
          ctx.setTransform(k, 0, 0, k, 0, 0);
          /* trait proportionnel à la lettre, comme dans le kit (1,35 pour une capitale de 171), avec un plancher pour rester visible sur petit écran */
          ctx.strokeStyle = api.inkCss(0.9); ctx.lineWidth = Math.max(0.9, 1.35 * p.weight * u); ctx.lineCap = "round"; ctx.lineJoin = "round";
          ctx.beginPath();
          var kept = Math.min(clamp(p.density / T_DMAX, 0, 1) * nSeeds, T_SEGS / (2 * Math.max(1, p.len * 0.5))), fade = 40, step = T_STEP * u, s, d, st, nn, nf, fr, g, len, fx, fy, ix, iy, tx, ty, i0, c, sn, c0, c1, s0, s1, gx1 = gnx - 1, gy1 = gny - 1;
          for (s = 0; s < nSeeds && s < kept; s++) {
            g = (kept - s) / fade; g = g > 1 ? 1 : g; nn = p.len * 0.5 * g; nf = Math.floor(nn); fr = nn - nf;
            for (d = -1; d <= 1; d += 2) {
              x = sx[s]; y = sy[s]; ctx.moveTo(x, y);
              for (st = 0; st <= nf; st++) {
                len = st < nf ? step : step * fr; if (len <= 0) break;
                fx = (x - gX) / gstep; fy = (y - gY) / gstep;
                if (fx < 0 || fy < 0 || fx >= gx1 || fy >= gy1) break;
                ix = fx | 0; iy = fy | 0; tx = fx - ix; ty = fy - iy; i0 = iy * gw + ix;
                c0 = gC[i0] + (gC[i0 + 1] - gC[i0]) * tx; c1 = gC[i0 + gw] + (gC[i0 + gw + 1] - gC[i0 + gw]) * tx; c = c0 + (c1 - c0) * ty;
                s0 = gS[i0] + (gS[i0 + 1] - gS[i0]) * tx; s1 = gS[i0 + gw] + (gS[i0 + gw + 1] - gS[i0 + gw]) * tx; sn = s0 + (s1 - s0) * ty;
                x += c * len * d; y += sn * len * d; ctx.lineTo(x, y);
              }
            }
          }
          ctx.stroke();
          /* découpe par les lettres, puis contour léger */
          ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = "destination-in"; ctx.drawImage(maskCv, 0, 0); ctx.globalCompositeOperation = "source-over";
          if (p.outline > 0.02) { ctx.globalAlpha = clamp(p.outline, 0, 1); ctx.drawImage(outCv, 0, 0); ctx.globalAlpha = 1; }
        }
      });
      r.paused = !S.live;
      return {
        update: function (S) { cur = S; r.paused = !S.live; r.dirty = true; },
        destroy: function () { dead = true; r.destroy(); maskCv.width = 2; maskCv.height = 2; loCv.width = 2; loCv.height = 2; outCv.width = 2; outCv.height = 2; },
        recolor: function () { key = ""; r.redraw(); },
        png: function () { return r.cv; }
      };
    },
    code: function (S) { return JSON.stringify({ systeme: "type", planche: 28, seed: S.seed, params: S.p }); }
  });

  /* ================================================================== 31 : le système en identité */
  /* Six noms inventés (tirés du seed), six marques : des lignes de champ qui refusent de se toucher, dans un cercle. Le nom seul règle la marque.
     La géométrie est calculée une fois par marque (Path2D) puis seulement tracée : l'épaisseur et la taille varient sans coût. */
  var POOL = ["Ada", "Bo", "Cleo", "Dev", "Esi", "Finn", "Gia", "Hugo", "Ines", "Jun", "Kai", "Lio", "Mira", "Noor", "Oto", "Pia", "Quin", "Rae", "Suki", "Teo", "Uma", "Vik", "Wren", "Xia", "Yara", "Zed", "Ivo", "Lena", "Mio", "Nils", "Odile", "Pavo", "Remi", "Sana", "Tomi", "Ulla"];
  var I_R = 84, I_SZ = I_R * 2 + 8, I_L = 20, I_START = 5.4;
  var I_MONO = '"DM Mono", ui-monospace, Consolas, monospace';

  function pickNames(seed) {
    var rnd = A.rng(seed + ":names"), a = POOL.slice(), i, j, t;
    for (i = a.length - 1; i > 0; i--) { j = (rnd() * (i + 1)) | 0; t = a[i]; a[i] = a[j]; a[j] = t; }
    return a.slice(0, 6);
  }

  /* une marque : renvoie les lignes et les anneaux en Path2D, dans un repère de 176 x 176 */
  function buildMark(name, sep) {
    var R = I_R, SZ = I_SZ, seed = hashStr(name) % 100000 + 1, r = A.rng(seed * 977 + 13), n = A.noise(seed * 31 + 7);
    var c0 = SZ / 2, vx = c0 + (r() - 0.5) * R * 0.7, vy = c0 + (r() - 0.5) * R * 0.7, R0 = R * (0.10 + 0.10 * r());
    var f = 0.012 + 0.016 * r(), sw = 1.0 + 1.6 * r(), off = r() * 50, CS = sep, sw2 = 0.6 + 0.8 * r();
    var GW = Math.ceil(SZ / CS) + 1, occ = new Int32Array(GW * GW), id = 0, t, x0, y0, i, lines = new Path2D(), ring = new Path2D();
    function ang(x, y) {
      var b = (n(x * f + off, y * f) + 0.3 * n(x * f * 2.6 + 9, y * f * 2.6 + off)) * Math.PI * sw;
      var dx = x - vx, dy = y - vy, d = Math.sqrt(dx * dx + dy * dy);
      var w = Math.pow(clamp((R * 1.5 - d) / (R * 1.5 - R0 * 1.2), 0, 1), 1.4) * sw2;
      w = Math.min(w, 1);
      var tg = Math.atan2(dy, dx) + Math.PI / 2;
      return Math.atan2((1 - w) * Math.sin(b) + w * Math.sin(tg), (1 - w) * Math.cos(b) + w * Math.cos(tg));
    }
    function inside(x, y) { return Math.hypot(x - c0, y - c0) < R - 1; }
    function trace(x, y, dir, idn) {
      var pts = [x, y], s, a, ci, o;
      for (s = 0; s < 80; s++) {
        a = ang(x, y); x += Math.cos(a) * 2 * dir; y += Math.sin(a) * 2 * dir;
        if (!inside(x, y) || Math.hypot(x - vx, y - vy) < R0) break;
        ci = ((y / CS) | 0) * GW + ((x / CS) | 0); o = occ[ci];
        if (o !== 0 && o !== idn) break;
        occ[ci] = idn; pts.push(x, y);
      }
      return pts;
    }
    for (t = 0; t < 1500; t++) {
      x0 = c0 + (r() * 2 - 1) * R; y0 = c0 + (r() * 2 - 1) * R;
      if (!inside(x0, y0) || Math.hypot(x0 - vx, y0 - vy) < R0 * 1.08) continue;
      if (occ[((y0 / CS) | 0) * GW + ((x0 / CS) | 0)] !== 0) continue;
      id++;
      var a = trace(x0, y0, 1, id), b = trace(x0, y0, -1, id);
      if (a.length + b.length < 10) continue;
      for (i = b.length - 2; i >= 0; i -= 2) { if (i === b.length - 2) lines.moveTo(b[i], b[i + 1]); else lines.lineTo(b[i], b[i + 1]); }
      for (i = 0; i < a.length; i += 2) lines.lineTo(a[i], a[i + 1]);
    }
    ring.moveTo(vx + R0, vy); ring.arc(vx, vy, R0, 0, TAU);
    ring.moveTo(c0 + R, c0); ring.arc(c0, c0, R, 0, TAU);
    return { name: name, lines: lines, ring: ring, c0: c0, gen: 0 };
  }

  /* grille adaptée au format : celle qui donne les plus grandes marques */
  function gridFor(W, H) {
    var opts = [[3, 2], [2, 3], [6, 1], [1, 6]], best = null, i, cw, ch, D;
    for (i = 0; i < opts.length; i++) {
      cw = W / opts[i][0]; ch = H / opts[i][1]; D = Math.min(cw * 0.74, ch * 0.68);
      if (!best || D > best.D * 1.001) best = { cols: opts[i][0], rows: opts[i][1], D: D };
    }
    return best;
  }

  BgGen.register({
    id: "identity", kit: "31", group: GROUP, label: "Système en identité",
    note: "Un seul système, six noms inventés, six marques : le nom seul règle la marque. La planche 31.",
    int: 0.8,
    params: [
      range("size", "Taille des marques", 0.5, 1.15, 0.01, 1),
      range("speed", "Vitesse du cycle", 0.2, 3, 0.05, 1),
      range("weight", "Épaisseur du trait", 0.5, 2.2, 0.05, 1),
      range("sep", "Écart des lignes", 2.4, 6, 0.2, 3.4, "", false),
      toggle("cycle", "Apparition en séquence", true),
      toggle("labels", "Afficher les noms", true)
    ],
    mount: function (S, api) {
      var cur = S, r, marks = [], names = pickNames(S.seed), gen = 1, tl = I_START;
      function ensure(all) {
        var i, c = 0;
        for (i = 0; i < 6; i++) {
          if (!marks[i] || marks[i].gen !== gen || marks[i].name !== names[i] || marks[i].sep !== cur.p.sep) {
            marks[i] = buildMark(names[i], cur.p.sep); marks[i].gen = gen; marks[i].sep = cur.p.sep;
            if (!all && ++c >= 1) break;
          }
        }
      }
      r = api.runner(api.host, {
        maxDpr: 1.5,
        frame: function (rr, dt) {
          var p = cur.p, k = rr.k, ctx = rr.ctx, W = rr.w, H = rr.h, print = !cur.live || !p.cycle, i, m, q, g, a, sc, cx, cy, Rs, us, col, row, gr, fs, lw, u, wrapped;
          ensure(print || !marks.length);
          if (!rr.paused) tl += dt * p.speed;
          u = tl % I_L; wrapped = tl >= I_L; g = 1 - smooth(I_L - 2, I_L, u); if (wrapped) g *= smooth(0, 1.3, u);
          gr = gridFor(W, H);
          ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, rr.cv.width, rr.cv.height);
          ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
          for (i = 0; i < 6; i++) {
            m = marks[i]; if (!m) continue;
            if (print) { q = 1; a = 1; g = 1; }
            else { q = wrapped ? smooth(0.6 + 1.7 * i, 0.6 + 1.7 * i + 2.2, u) : smooth(0.8 + 1.7 * i, 0.8 + 1.7 * i + 2.2, u); a = g * q; }
            if (a <= 0.004) continue;
            col = i % gr.cols; row = Math.floor(i / gr.cols);
            Rs = gr.D / 2 * p.size; us = Rs / I_R; sc = 0.97 + 0.03 * q;
            cx = (col + 0.5) * W / gr.cols; cy = (row + 0.5) * H / gr.rows - 0.2 * Rs;
            ctx.setTransform(k, 0, 0, k, 0, 0); ctx.translate(cx, cy); ctx.scale(us * sc, us * sc); ctx.translate(-m.c0, -m.c0);
            ctx.globalAlpha = clamp(a, 0, 1); ctx.strokeStyle = api.inkCss(0.9);
            lw = Math.max(1.35 * p.weight, 0.9 / (us * sc)); ctx.lineWidth = lw; ctx.stroke(m.lines);
            ctx.lineWidth = Math.max(2.6 * p.weight, 1.4 / (us * sc)); ctx.stroke(m.ring);
            if (p.labels) {
              ctx.setTransform(k, 0, 0, k, 0, 0); fs = clamp(15 * Rs / I_R, 11, 26);
              ctx.globalAlpha = print ? 1 : clamp(g * smooth(0.3, 1, q), 0, 1); ctx.fillStyle = api.inkCss(0.9); ctx.font = "500 " + fs.toFixed(1) + "px " + I_MONO;
              ctx.fillText(m.name.toLowerCase(), cx, cy + Rs * 1.36 + fs * 0.3);
            }
          }
          ctx.globalAlpha = 1;
        }
      });
      r.paused = !S.live;
      return {
        update: function (S) {
          if (S.seed !== cur.seed) { names = pickNames(S.seed); gen++; }
          cur = S; r.paused = !S.live; r.dirty = true;
        },
        destroy: function () { r.destroy(); marks = []; },
        recolor: function () { r.redraw(); },
        png: function () { return r.cv; }
      };
    },
    code: function (S) { return JSON.stringify({ systeme: "identity", planche: 31, seed: S.seed, params: S.p }); }
  });

  /* ================================================================== 32 : le système piloté par des données */
  /* Douze valeurs d'exemple règlent la turbulence d'un champ de flux sur chaque douzième de la largeur. Des particules à traînée suivent une dérive
     vers la droite plus des tourbillons sans divergence (rotationnel d'un potentiel de bruit) dont la force est la valeur locale. */
  var D_COLS = 12, D_L = 40, D_STEP = 0.9, D_MON = "JFMAMJJASOND";
  var D_DS = [
    [0.10, 0.22, 0.45, 0.72, 0.95, 0.62, 0.30, 0.12, 0.38, 0.80, 0.55, 0.20],
    [0.85, 0.55, 0.18, 0.08, 0.30, 0.70, 0.98, 0.66, 0.25, 0.10, 0.42, 0.90],
    [0.35, 0.90, 0.68, 0.30, 0.10, 0.20, 0.52, 0.88, 0.96, 0.48, 0.15, 0.06]
  ];
  var D_PEAKS = [0.08, 0.12, 0.94, 0.14, 0.08, 0.10, 0.78, 0.12, 0.09, 0.96, 0.18, 0.08];
  var D_WIDTHS = [0.8, 1.2, 1.7];

  BgGen.register({
    id: "data", kit: "32", group: GROUP, label: "Système piloté par des données",
    note: "Douze valeurs d'exemple règlent la turbulence du champ sur chaque douzième de la feuille. La planche 32.",
    int: 0.8,
    params: [
      select("set", "Jeu de valeurs", [["cycle", "Les trois jeux du kit, en fondu"], ["rise", "Montée"], ["wave", "Vague"], ["peaks", "Pics"], ["flat", "Uniforme"], ["random", "Aléatoire (seed)"]], "cycle"),
      range("amp", "Amplitude", 0.3, 1.4, 0.02, 1),
      range("scale", "Taille des tourbillons", 0.5, 2.2, 0.02, 1),
      range("speed", "Vitesse", 0.3, 2.5, 0.05, 1),
      range("count", "Particules", 300, 1500, 100, 1400, "", false),
      toggle("bars", "Barres de données", true)
    ],
    mount: function (S, api) {
      var cur = S, r, seedKey = S.seed, n1 = api.noise(S.seed + ":d"), rand = api.rng(S.seed + ":p"), rv = new Float32Array(D_COLS);
      var u = 1, Wp = 600, Hp = 600, bandH = 0, Hf = 0, N = 0, simT = 2, tt = 0.04, acc = 0;
      /* valeurs (primitives) à la dernière construction : le panneau modifie p sur place, donc cur.p ne peut pas servir de témoin de changement */
      var lastCount = S.p.count, lastBars = S.p.bars;
      var px, py, st, cn, age, life, hx, hy, dying;
      var val = new Float32Array(D_COLS), tgt = new Float32Array(D_COLS), ta = new Float32Array(D_COLS);

      function seedValues() { var q = api.rng(seedKey + ":v"), k; for (k = 0; k < D_COLS; k++) rv[k] = 0.05 + 0.93 * q(); }
      function target(T) {
        var kind = cur.p.set, k, a, b, s, uu, i, f;
        if (kind === "cycle") {
          uu = T / 12; i = Math.floor(uu) % 3; f = (uu - Math.floor(uu)) * 12; a = D_DS[i]; b = D_DS[(i + 1) % 3]; s = smooth(6, 12, f);
          for (k = 0; k < D_COLS; k++) tgt[k] = a[k] + (b[k] - a[k]) * s;
        } else for (k = 0; k < D_COLS; k++) {
          tgt[k] = kind === "rise" ? 0.06 + 0.92 * k / 11 : kind === "wave" ? 0.5 + 0.44 * Math.sin(k / 11 * TAU * 1.1 + 0.5) : kind === "peaks" ? D_PEAKS[k] : kind === "random" ? rv[k] : 0.5;
        }
      }
      function spawn(j) {
        hx[j] = 4 + rand() * (rand() < 0.12 ? 0.08 * Wp : Wp - 8); hy[j] = 4 + rand() * (Hp - 8);
        st[j] = 0; cn[j] = 0; age[j] = 0; life[j] = 160 + rand() * 260; dying[j] = 0;
      }
      function advance() {
        var j, e, x, y, A_, g, d, ia, ib, w, vx, vy, ux, ri, f = 0.030 / cur.p.scale, ee = 1.5, dx, dy, CW = Wp / D_COLS, nz = n1, t = 17.3, t2 = tt + 5.1 - Wp * f / 2, cy = Hp / 2, last = D_COLS - 1;
        for (j = 0; j < N; j++) {
          if (!dying[j]) {
            x = hx[j]; y = hy[j];
            ux = x / CW; ri = Math.round(ux); d = ux - ri; ia = ri - 1 < 0 ? 0 : ri - 1 > last ? last : ri - 1; ib = ri < 0 ? 0 : ri > last ? last : ri;
            w = d <= -0.2 ? 0 : d >= 0.2 ? 1 : (w = (d + 0.2) / 0.4, w * w * (3 - 2 * w));
            A_ = ta[ia] + (ta[ib] - ta[ia]) * w;
            dy = (nz(x * f + t2, (y - cy + ee) * f + t) - nz(x * f + t2, (y - cy - ee) * f + t)) / (2 * ee) / f;
            dx = (nz((x + ee) * f + t2, (y - cy) * f + t) - nz((x - ee) * f + t2, (y - cy) * f + t)) / (2 * ee) / f;
            g = A_ * A_ * 0.55 + A_ * 0.45;
            vx = (1 - 0.7 * A_) + g * 3.0 * dy; vy = -g * 3.0 * dx;
            x += vx * D_STEP; y += vy * D_STEP; hx[j] = x; hy[j] = y;
            if (x < 3 || x > Wp - 3 || y < 3 || y > Hp - 3 || ++age[j] > life[j]) dying[j] = 1;
            else {
              if (cn[j] === D_L) { st[j] = (st[j] + 1) % D_L; cn[j]--; }
              e = j * D_L + (st[j] + cn[j]) % D_L; px[e] = x; py[e] = y; cn[j]++;
            }
          }
          if (dying[j]) { if (cn[j] > 0) { st[j] = (st[j] + 1) % D_L; cn[j]--; } if (cn[j] === 0) spawn(j); }
        }
      }
      /* (re)crée la simulation à la taille du cadre : l'aire du champ vaut toujours celle d'une planche (600 x 750), pour garder la même densité */
      function init(rr) {
        var i, p = cur.p;
        lastCount = p.count; lastBars = p.bars;
        /* la bande des barres ne dépasse jamais 40 % de la hauteur : le champ garde une hauteur utile finie sur un hôte très bas (ou pas encore mis en page) */
        bandH = p.bars ? Math.min(clamp(rr.h * 0.15, 84, 150), rr.h * 0.4) : 0; Hf = Math.max(8, rr.h - bandH);
        u = Math.max(0.05, Math.sqrt(rr.w * Hf / 450000)); Wp = rr.w / u; Hp = Hf / u;
        N = Math.max(100, Math.round(p.count));
        px = new Float32Array(N * D_L); py = new Float32Array(N * D_L);
        st = new Int32Array(N); cn = new Int32Array(N); age = new Float32Array(N); life = new Float32Array(N);
        hx = new Float32Array(N); hy = new Float32Array(N); dying = new Uint8Array(N);
        target(simT); for (i = 0; i < D_COLS; i++) { val[i] = tgt[i]; ta[i] = tgt[i] * p.amp; }
        for (i = 0; i < N; i++) { spawn(i); age[i] = rand() * 200; }
        for (i = 0; i < 70; i++) { tt += 0.02 / 60; advance(); }
      }
      seedValues();

      r = api.runner(api.host, {
        maxDpr: 1.5, resize: init,
        frame: function (rr, dt) {
          var p = cur.p, ctx = rr.ctx, k = rr.k, W = rr.w, H = rr.h, i, j, m, c, ch, last, e, e2, cc, sps, n, kk, fs, cw, bw, bm, by, h, x, cap, scl = 0.55 + 0.45 * u;
          if (rr.paused) { target(simT); for (i = 0; i < D_COLS; i++) { val[i] = tgt[i]; ta[i] = val[i] * p.amp; } }
          else {
            simT += dt * p.speed; target(simT);
            kk = 1 - Math.exp(-dt * 4); for (i = 0; i < D_COLS; i++) { val[i] += (tgt[i] - val[i]) * kk; ta[i] = val[i] * p.amp; }
            acc += Math.min(dt, 0.1) * 60 * p.speed; sps = Math.floor(acc); acc -= sps;
            for (n = 0; n < sps; n++) { tt += 0.02 / 60; advance(); }
          }
          ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, rr.cv.width, rr.cv.height);
          /* le champ, dans l'espace d'une planche mis à l'échelle */
          var paths = [new Path2D(), new Path2D(), new Path2D()], pp;
          for (j = 0; j < N; j++) {
            cc = cn[j]; if (cc < 2) continue; last = -1;
            for (m = 0; m < cc; m++) {
              e = j * D_L + (st[j] + m) % D_L; ch = Math.min(2, Math.floor(m * 3 / cc)); pp = paths[ch];
              if (ch !== last) {
                if (m > 0) { e2 = j * D_L + (st[j] + m - 1) % D_L; pp.moveTo(px[e2], py[e2]); pp.lineTo(px[e], py[e]); } else pp.moveTo(px[e], py[e]);
                last = ch;
              } else pp.lineTo(px[e], py[e]);
            }
          }
          ctx.setTransform(k * u, 0, 0, k * u, 0, 0); ctx.strokeStyle = api.inkCss(0.85); ctx.lineCap = "round"; ctx.lineJoin = "round";
          for (c = 0; c < 3; c++) { ctx.lineWidth = D_WIDTHS[c] * scl / u; ctx.stroke(paths[c]); }
          /* les données : douze barres sous le champ, alignées sur les douzièmes */
          if (p.bars) {
            ctx.setTransform(k, 0, 0, k, 0, 0); cw = W / D_COLS; bw = clamp(cw * 0.55, 6, 40); bm = bandH * 0.42; by = H - bandH * 0.36;
            ctx.strokeStyle = api.inkCss(0.6); ctx.fillStyle = api.inkCss(0.85); ctx.lineWidth = 1.2;
            ctx.beginPath();
            for (i = 0; i <= D_COLS; i++) { x = Math.min(W - 0.5, Math.max(0.5, i * cw)); ctx.moveTo(x, Hf); ctx.lineTo(x, Hf + 7); }
            ctx.moveTo(0, Hf + 0.5); ctx.lineTo(W, Hf + 0.5); ctx.moveTo(0, by + 0.5); ctx.lineTo(W, by + 0.5); ctx.stroke();
            for (i = 0; i < D_COLS; i++) { h = Math.max(2, val[i] * bm); ctx.fillRect(cw * (i + 0.5) - bw / 2, by - h, bw, h); }
            fs = clamp(10 * (0.6 + 0.4 * u), 9, 13); ctx.font = "500 " + fs.toFixed(1) + "px " + '"DM Mono", ui-monospace, Consolas, monospace'; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
            for (i = 0; i < D_COLS; i++) ctx.fillText(D_MON.charAt(i), cw * (i + 0.5), by + fs * 1.5);
            ctx.font = "500 " + (fs * 0.85).toFixed(1) + "px " + '"DM Mono", ui-monospace, Consolas, monospace'; ctx.textAlign = "left";
            cap = "DONNÉES D'EXEMPLE (INVENTÉES) · BARRE HAUTE = AGITÉ, BASSE = CALME";
            if (ctx.measureText(cap).width > W - 24) cap = "DONNÉES D'EXEMPLE INVENTÉES";
            ctx.fillText(cap, 12, by + fs * 1.5 + fs * 1.5);
          }
        }
      });
      r.paused = !S.live;
      return {
        update: function (S) {
          var redo = S.p.count !== lastCount || S.p.bars !== lastBars, newSeed = S.seed !== seedKey;
          cur = S; r.paused = !S.live; r.dirty = true;
          if (newSeed) { seedKey = S.seed; n1 = api.noise(seedKey + ":d"); rand = api.rng(seedKey + ":p"); seedValues(); redo = true; }
          if (redo) init(r);
        },
        destroy: function () { r.destroy(); },
        recolor: function () { r.redraw(); },
        png: function () { return r.cv; }
      };
    },
    code: function (S) { return JSON.stringify({ systeme: "data", planche: 32, seed: S.seed, params: S.p }); }
  });
})();

/* ---- bg-generator.js */
/* Générateur de fond : interface (panneau), état, variation automatique et export.
   Les systèmes viennent du registre BgGen (bg-gen-core.js, gen-types/*.js). Balisage attendu : voir index.html (#bg, .gen__layer, #gen…). */
(function () {
  "use strict";
  var BG = window.BgGen, doc = document;
  if (!BG) return;
  var $ = function (s, r) { return (r || doc).querySelector(s); };
  var A = BG.api, clamp = A.clamp, TAU = A.TAU;

  function start() {
    var bg = $("#bg"), layer = $(".gen__layer", bg);
    if (!bg || !layer) return;
    var TYPES = BG.types, ORDER = BG.order;
    var S = { type: ORDER.indexOf("stream") >= 0 ? "stream" : ORDER[0], seed: "9", live: true, intensity: 0.9, auto: { on: false, amp: 0.5, rate: 1 } };
    var store = {}, eff = {}, cur = null, tAuto = 0, ak = 0;
    ORDER.forEach(function (id) { store[id] = {}; TYPES[id].params.forEach(function (d) { store[id][d.k] = d.v; }); eff[id] = Object.assign({}, store[id]); });

    /* ------------------------------------------------------------ état et lien */
    function load() {
      try {
        var g = new URLSearchParams(location.search).get("g");
        if (!g) return;
        var o = JSON.parse(decodeURIComponent(escape(atob(g))));
        if (o.t && TYPES[o.t]) S.type = o.t;
        if (o.s != null) S.seed = String(o.s);
        if (o.l != null) S.live = !!o.l;
        S.intensity = o.o != null ? clamp(+o.o, 0.1, 1) : TYPES[S.type].int;
        if (o.a) { S.auto.on = !!o.a; if (o.am != null) S.auto.amp = clamp(+o.am, 0, 1); if (o.ar != null) S.auto.rate = clamp(+o.ar, 0.1, 3); }
        if (o.p) Object.keys(o.p).forEach(function (id) { if (store[id]) Object.keys(o.p[id]).forEach(function (k) { if (k in store[id]) store[id][k] = o.p[id][k]; }); });
      } catch (e) { /* lien ancien ou abîmé : valeurs par défaut */ }
    }
    function save() {
      try {
        var o = { t: S.type, s: S.seed, l: S.live ? 1 : 0, o: S.intensity, p: {} };
        if (S.auto.on) { o.a = 1; o.am = S.auto.amp; o.ar = S.auto.rate; }
        ORDER.forEach(function (id) { var d = {}, any = false; TYPES[id].params.forEach(function (q) { if (store[id][q.k] !== q.v) { d[q.k] = store[id][q.k]; any = true; } }); if (any) o.p[id] = d; });
        var u = new URL(location.href); u.searchParams.set("g", btoa(unescape(encodeURIComponent(JSON.stringify(o))))); history.replaceState(null, "", u);
      } catch (e) { /* adresse non modifiable */ }
    }

    /* ------------------------------------------------- variation automatique */
    /* Chaque réglage numérique oscille autour de la valeur choisie, avec deux sinus de périodes premières entre elles (de 40 à 100 secondes) :
       aucune cassure, aucune valeur aléatoire. L'amplitude entre en douceur à l'activation et sort en douceur à l'arrêt. */
    function wave(i, t) {
      var p1 = 41 + (i * 13) % 29, p2 = 67 + (i * 17) % 37, ph = i * 1.7;
      return 0.62 * Math.sin(TAU * t / p1 + ph) + 0.38 * Math.sin(TAU * t / p2 + 2.3 * ph + 1);
    }
    function computeEff() {
      var T = TYPES[S.type], b = store[S.type], e = eff[S.type], amp = S.auto.amp * ak;
      T.params.forEach(function (d, i) {
        if (d.type !== "range" || d.auto === false || T.noAuto || amp <= 0) { e[d.k] = b[d.k]; return; }
        var span = d.max - d.min, room = Math.max(Math.min(b[d.k] - d.min, d.max - b[d.k]), span * 0.15);
        e[d.k] = clamp(b[d.k] + amp * (d.autoAmp == null ? 1 : d.autoAmp) * wave(i, tAuto) * room, d.min, d.max);
      });
    }
    function active() { return ak > 0 && !TYPES[S.type].noAuto; }

    /* ------------------------------------------------------------ application */
    var timer = 0;
    function params() { return active() ? eff[S.type] : store[S.type]; }
    function view() { return { type: S.type, seed: S.seed, live: S.live, intensity: S.intensity, p: params() }; }
    function baseView() { return { type: S.type, seed: S.seed, live: S.live, intensity: S.intensity, p: store[S.type] }; }
    function remount() {
      if (cur) cur.destroy();
      computeEff();
      cur = TYPES[S.type].mount(view(), A);
      layer.style.opacity = S.intensity;
      writeCode(); status();
    }
    function apply(heavy) {
      layer.style.opacity = S.intensity;
      clearTimeout(timer);
      var go = function () { computeEff(); if (cur) cur.update(view()); writeCode(); save(); status(); };
      if (heavy && TYPES[S.type].heavy) timer = setTimeout(go, 280); else go();
    }

    /* ----------------------------------------------------------------- panneau */
    var el = {
      open: $("#genopen"), panel: $("#genpanel"), type: $("#gtype"), seed: $("#gseed"), rand: $("#grand"), live: $("#glive"), inten: $("#gint"), intv: $("#gintv"), params: $("#gparams"), note: $("#gnote"),
      code: $("#gcode"), copy: $("#gcopy"), exp: $("#gexp"), close: $("#genclose"), reset: $("#greset"), auto: $("#gauto"), amp: $("#gamp"), ampv: $("#gampv"), rate: $("#grate"), ratev: $("#gratev"), autonote: $("#gautonote")
    };
    function fmt(d, v) { var dec = (String(d.step).split(".")[1] || "").length; return (+v).toFixed(dec) + d.unit; }
    function setPf(inp) { var w = inp.closest(".ep-range"), mn = +inp.min, mx = +inp.max; if (w) w.style.setProperty("--pf", String(mx > mn ? (inp.value - mn) / (mx - mn) : 0)); }

    function buildParams() {
      var T = TYPES[S.type], h = "", st = store[S.type];
      T.params.forEach(function (d) {
        var id = "gp-" + d.k;
        if (d.type === "toggle") h += '<label class="ep-switch gen__row"><input type="checkbox" role="switch" data-k="' + d.k + '"' + (st[d.k] ? " checked" : "") + "> " + d.label + "</label>";
        else if (d.type === "select") h += '<div class="ep-field gen__row"><label class="ep-label" for="' + id + '">' + d.label + '</label><div class="ep-select-wrap"><select class="ep-select" id="' + id + '" data-k="' + d.k + '">' + d.options.map(function (o) { return '<option value="' + o[0] + '"' + (String(st[d.k]) === String(o[0]) ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></div></div>";
        else if (d.type === "text") h += '<div class="ep-field gen__row"><label class="ep-label" for="' + id + '">' + d.label + '</label><input class="ep-input" id="' + id + '" data-k="' + d.k + '" maxlength="' + d.max + '" autocomplete="off" value="' + String(st[d.k]).replace(/"/g, "&quot;") + '"></div>';
        else h += '<div class="ep-range-field gen__row"><div class="ep-range-field__head"><label class="ep-label" for="' + id + '">' + d.label + '</label><span class="ep-range-field__value" data-v="' + d.k + '">' + fmt(d, st[d.k]) + '</span></div>' +
          '<div class="ep-range"><span class="ep-range__track"><span class="ep-range__fill"></span></span><span class="ep-range__thumb"></span><input id="' + id + '" type="range" data-k="' + d.k + '" min="' + d.min + '" max="' + d.max + '" step="' + d.step + '" value="' + st[d.k] + '"></div></div>';
      });
      el.params.innerHTML = h;
      el.note.textContent = T.note || "";
      el.auto.disabled = !!T.noAuto;
      el.autonote.textContent = T.noAuto ? "Ce système se reconstruit à chaque réglage : pas de variation continue possible." : "";
    }
    /* pendant la variation : les curseurs suivent la valeur courante (sauf celui que la main tient) */
    function syncSliders() {
      var T = TYPES[S.type], e = eff[S.type];
      T.params.forEach(function (d) {
        if (d.type !== "range") return;
        var inp = el.params.querySelector('input[data-k="' + d.k + '"]'); if (!inp) return;
        var w = inp.closest(".ep-range"); if (w && w.hasAttribute("data-active")) return;
        var v = active() ? e[d.k] : store[S.type][d.k];
        inp.value = v; setPf(inp);
        var lab = el.params.querySelector('[data-v="' + d.k + '"]'); if (lab) lab.textContent = fmt(d, v);
      });
    }
    function writeCode() {
      var T = TYPES[S.type]; el.code.value = T.code(baseView());
      el.exp.textContent = cur && cur.toSVG ? "Exporter en SVG" : "Exporter en PNG";
    }
    function status() {
      var T = TYPES[S.type], q = cur && cur.el && cur.el._q, s = $("#glassmode");
      if (s) s.textContent = "verre : " + (window.EncrePapier && EncrePapier.Glass ? EncrePapier.Glass.mode : "indisponible") + " / fond : " + T.kit + " " + T.label.toLowerCase() + (S.type === "stream" ? ", qualité " + (q || 0) : "") + (ak > 0.02 ? ", variation" : "");
    }
    function buildSelect() {
      var h = "", last = null;
      ORDER.forEach(function (id) {
        var T = TYPES[id];
        if (T.group !== last) { if (last) h += "</optgroup>"; h += '<optgroup label="' + T.group + '">'; last = T.group; }
        h += '<option value="' + id + '">' + T.kit + " · " + T.label + "</option>";
      });
      el.type.innerHTML = h + "</optgroup>"; el.type.value = S.type;
    }
    function download(name, blob) { var a = doc.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; doc.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
    function exportFile() {
      var T = TYPES[S.type], base = "fond-" + T.kit + "-" + S.type + "-seed-" + String(S.seed).replace(/[^\w-]+/g, "_");
      if (cur && cur.toSVG) download(base + ".svg", new Blob([cur.toSVG()], { type: "image/svg+xml" }));
      else if (cur && cur.png) { var c = cur.png(); if (c && c.toBlob) c.toBlob(function (b) { if (b) download(base + ".png", b); }); }
    }
    function randSeed() { return String((Math.random() * 99999) | 0); }
    function syncAutoUi() {
      el.auto.checked = S.auto.on; el.amp.value = S.auto.amp; el.ampv.textContent = Math.round(S.auto.amp * 100) + " %"; el.rate.value = S.auto.rate; el.ratev.textContent = "×" + (+S.auto.rate).toFixed(1);
      setPf(el.amp); setPf(el.rate);
    }
    function setType(id) {
      S.type = id; S.intensity = TYPES[id].int; el.type.value = id; el.inten.value = S.intensity; el.intv.textContent = Math.round(S.intensity * 100) + " %"; setPf(el.inten);
      remount(); buildParams(); save();
    }

    function bind() {
      el.open.addEventListener("click", function () { var o = el.panel.hidden; el.panel.hidden = !o; el.open.setAttribute("aria-expanded", String(o)); if (o) el.panel.scrollTop = 0; });
      el.close.addEventListener("click", function () { el.panel.hidden = true; el.open.setAttribute("aria-expanded", "false"); el.open.focus(); });
      doc.addEventListener("keydown", function (e) { if (e.key === "Escape" && !el.panel.hidden && el.panel.contains(doc.activeElement)) el.close.click(); });
      el.type.addEventListener("change", function () { setType(el.type.value); });
      el.seed.addEventListener("input", function () { S.seed = el.seed.value || "0"; apply(true); });
      el.rand.addEventListener("click", function () { S.seed = randSeed(); el.seed.value = S.seed; apply(false); });
      el.live.addEventListener("change", function () { S.live = el.live.checked; apply(false); });
      el.inten.addEventListener("input", function () { S.intensity = +el.inten.value; el.intv.textContent = Math.round(S.intensity * 100) + " %"; apply(false); });
      el.auto.addEventListener("change", function () { S.auto.on = el.auto.checked; save(); status(); });
      el.amp.addEventListener("input", function () { S.auto.amp = +el.amp.value; el.ampv.textContent = Math.round(S.auto.amp * 100) + " %"; save(); });
      el.rate.addEventListener("input", function () { S.auto.rate = +el.rate.value; el.ratev.textContent = "×" + (+S.auto.rate).toFixed(1); save(); });
      el.params.addEventListener("input", function (e) {
        var inp = e.target, k = inp.getAttribute("data-k"); if (!k) return;
        var d = TYPES[S.type].params.filter(function (q) { return q.k === k; })[0];
        store[S.type][k] = inp.type === "checkbox" ? inp.checked : (d && (d.type === "select" || d.type === "text")) ? inp.value : +inp.value;
        var v = el.params.querySelector('[data-v="' + k + '"]'); if (v && d) v.textContent = fmt(d, store[S.type][k]);
        apply(true);
      });
      el.copy.addEventListener("click", function () {
        var done = function () { var t = el.copy.textContent; el.copy.textContent = "Copié"; setTimeout(function () { el.copy.textContent = t; }, 1400); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(el.code.value).then(done, function () { el.code.select(); });
        else { el.code.select(); try { doc.execCommand("copy"); done(); } catch (e) { /* sélection laissée à l'utilisateur */ } }
      });
      el.exp.addEventListener("click", exportFile);
      el.reset.addEventListener("click", function () { TYPES[S.type].params.forEach(function (d) { store[S.type][d.k] = d.v; }); buildParams(); apply(false); });
      /* un système peut demander un autre système, avec un seed (planche contact) */
      doc.addEventListener("bggen:pick", function (e) {
        var o = e.detail || {}; if (o.seed != null) { S.seed = String(o.seed); el.seed.value = S.seed; }
        if (o.type && TYPES[o.type]) { if (o.params) Object.keys(o.params).forEach(function (k) { if (k in store[o.type]) store[o.type][k] = o.params[k]; }); setType(o.type); } else apply(false);
      });
      /* le thème change la couleur de l'encre : les canevas la relisent */
      new MutationObserver(function () { if (cur && cur.recolor) cur.recolor(); }).observe(doc.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    }

    /* boucle de la variation automatique */
    var last = 0, lastUi = 0;
    function autoLoop(now) {
      requestAnimationFrame(autoLoop);
      var dt = last ? Math.min(0.1, (now - last) / 1000) : 0; last = now;
      if (doc.hidden) return;
      var target = S.auto.on && S.live && !TYPES[S.type].noAuto ? 1 : 0;
      if (ak === 0 && target === 0) return;
      ak = clamp(ak + clamp(target - ak, -dt * 0.4, dt * 0.4), 0, 1);       /* 2,5 s pour entrer ou sortir */
      if (target === 1 || ak > 0) tAuto += dt * S.auto.rate;
      computeEff();
      if (cur) cur.update(view());
      if (now - lastUi > 66) { syncSliders(); lastUi = now; if (ak < 0.02) status(); }
    }

    load();
    buildSelect(); el.seed.value = S.seed; el.live.checked = S.live; el.inten.value = S.intensity; el.intv.textContent = Math.round(S.intensity * 100) + " %"; setPf(el.inten);
    syncAutoUi(); bind();
    remount(); buildParams();
    var wide = window.matchMedia && window.matchMedia("(min-width: 1180px)").matches;
    if (wide) { el.panel.hidden = false; el.open.setAttribute("aria-expanded", "true"); }
    setInterval(status, 1000);
    requestAnimationFrame(autoLoop);

    window.BgGenerator = {
      types: TYPES, state: function () { return view(); }, base: function () { return baseView(); }, store: store,
      set: function (o) {
        if (o.auto) Object.assign(S.auto, o.auto), syncAutoUi();
        if (o.type && o.intensity == null) o.intensity = TYPES[o.type].int;
        var a = o.auto; delete o.auto; Object.assign(S, o); if (a) { /* déjà appliqué */ }
        el.type.value = S.type; el.inten.value = S.intensity; el.intv.textContent = Math.round(S.intensity * 100) + " %"; setPf(el.inten);
        remount(); buildParams(); save();
      }
    };
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", start); else start();
})();
