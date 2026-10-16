// The chord wheel (circle of fifths) and the chord chart. Both pick a root and a type
// and hand it to assistant.js through the "main-chord-pick" event on #main-wheel.
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const NS = "http://www.w3.org/2000/svg";
  const SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
  const MAJORS = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];        // clockwise from the top
  const MAJOR_TEXT = ["C", "G", "D", "A", "E", "B", "F♯", "D♭", "A♭", "E♭", "B♭", "F"];
  const MINOR_TEXT = ["Am", "Em", "Bm", "F♯m", "C♯m", "G♯m", "D♯m", "B♭m", "Fm", "Cm", "Gm", "Dm"];
  const types = JSON.parse($("main-chord-types").textContent);
  const rootInput = $("main-chord-root");
  const typeInput = $("main-chord-quality");
  const wheel = $("main-wheel");

  function el(tag, attrs, parent) {
    const node = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach((k) => node.setAttribute(k, attrs[k]));
    if (parent) parent.appendChild(node);
    return node;
  }

  function arc(r1, r2, a1, a2) {
    const p = (r, a) => [r * Math.sin(a), -r * Math.cos(a)];
    const [x1, y1] = p(r2, a1), [x2, y2] = p(r2, a2), [x3, y3] = p(r1, a2), [x4, y4] = p(r1, a1);
    return `M${x1} ${y1} A${r2} ${r2} 0 0 1 ${x2} ${y2} L${x3} ${y3} A${r1} ${r1} 0 0 0 ${x4} ${y4} Z`;
  }

  // ---------- music facts the wheel needs ----------
  const SIG_OF_MAJOR = { 0: 0, 7: 1, 2: 2, 9: 3, 4: 4, 11: 5, 6: 6, 1: -5, 8: -4, 3: -3, 10: -2, 5: -1 };
  const MINOR_TYPES = ["min", "m7", "m6", "m9", "madd9", "m7b5", "mmaj7", "dim", "dim7"];
  const isMinorType = (q) => MINOR_TYPES.indexOf(q) !== -1;
  const wrap = (i) => (i + 12) % 12;
  const MAJOR_DEG = { 0: ["I", "Tonic"], "-1": ["IV", "Subdominant"], 1: ["V", "Dominant"] };

  // Which wheel cells are friends of the chord you picked, and why.
  // A cell is "outer" (major) or "inner" (minor) at a position 0-11 around the circle of fifths.
  function relations(pc, q) {
    const minor = isMinorType(q);
    const rel = {}; // "outer3" -> { role, degree, strong }
    const put = (ring, idx, degree, role, strong) => { rel[ring + wrap(idx)] = { degree, role, strong }; };
    if (!minor) {
      const i = MAJORS.indexOf(pc);
      put("outer", i, "I", "Tonic", true);
      put("outer", i - 1, "IV", "Subdominant", true);
      put("outer", i + 1, "V", "Dominant", true);
      put("inner", i, "vi", "Relative minor", true);
      put("inner", i - 1, "ii", "Supertonic", false);
      put("inner", i + 1, "iii", "Mediant", false);
    } else {
      const i = MAJORS.indexOf((pc + 3) % 12);
      put("inner", i, "i", "Tonic", true);
      put("inner", i - 1, "iv", "Subdominant", true);
      put("inner", i + 1, "v", "Dominant (minor)", true);
      put("outer", i, "III", "Relative major", true);
      put("outer", i - 1, "VI", "Submediant", false);
      put("outer", i + 1, "VII", "Subtonic", false);
    }
    return rel;
  }

  function keyInfo(pc, q) {
    const minor = isMinorType(q);
    const majorPc = minor ? (pc + 3) % 12 : pc;
    const sig = SIG_OF_MAJOR[majorPc];
    const name = (minor ? MINOR_TEXT[MAJORS.indexOf(majorPc)].replace("m", "") : MAJOR_TEXT[MAJORS.indexOf(majorPc)]) + (minor ? " minor" : " major");
    const acc = sig === 0 ? "no sharps or flats" : Math.abs(sig) + (sig > 0 ? " sharp" : " flat") + (Math.abs(sig) > 1 ? "s" : "");
    return { name: name.replace("♯", "♯").replace("♭", "♭"), acc, minor };
  }

  // ---------- the wheel ----------
  const modeSelect = $("main-wheel-mode");
  const audioButton = $("main-wheel-audio");
  const rotateInput = $("main-wheel-rotate");
  const rotateOut = $("main-wheel-rotate-out");
  const relatedBox = $("main-wheel-related");
  let audioOn = true;
  let rotation = 0;

  const group = el("g", { id: "main-wheel-rot" }, wheel);
  const cells = [];
  MAJORS.forEach((pc, i) => {
    const a1 = ((i - 0.5) * 30 * Math.PI) / 180, a2 = ((i + 0.5) * 30 * Math.PI) / 180, mid = (i * 30 * Math.PI) / 180;
    [["maj", "outer", 64, 105, MAJOR_TEXT[i], pc], ["min", "inner", 36, 64, MINOR_TEXT[i], (pc + 9) % 12]].forEach(([q, ring, r1, r2, text, root]) => {
      const g = el("g", { class: "main-wheel-cell main-wheel-cell-" + q, tabindex: "0", role: "button", "aria-label": text + " chord" }, group);
      const slice = el("path", { d: arc(r1, r2, a1, a2), class: "main-wheel-slice" }, g);
      const rm = (r1 + r2) / 2;
      const x = rm * Math.sin(mid), y = -rm * Math.cos(mid);
      const label = el("g", { transform: "translate(" + x + " " + y + ")" }, g);
      const name = el("text", { x: 0, y: 1, class: "main-wheel-text", "text-anchor": "middle" }, label);
      name.textContent = text;
      const sub = el("text", { x: 0, y: 8, class: "main-wheel-sub", "text-anchor": "middle" }, label);
      const pick = () => choose(root, q);
      g.addEventListener("click", pick);
      g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
      cells.push({ g, label, slice, name, sub, x, y, root, q, ring, idx: i, hue: i * 30, title: el("title", {}, g) });
    });
  });
  el("circle", { r: 33, class: "main-wheel-hub" }, wheel);
  const hubKey = el("text", { class: "main-wheel-hub-key", "text-anchor": "middle", y: -2 }, wheel);
  const hubSig = el("text", { class: "main-wheel-hub-sig", "text-anchor": "middle", y: 10 }, wheel);

  // ---------- type chips ----------
  const chipBox = $("main-wheel-types");
  const chips = {};
  types.forEach((t) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "main-wheel-chip";
    b.textContent = t.symbol || "maj";
    b.title = t.label;
    b.addEventListener("click", () => choose(rootPc(), t.key));
    chipBox.appendChild(b);
    chips[t.key] = b;
  });

  function rootPc() { return SHARP.indexOf(rootInput.value); }
  function typeOf(key) { return types.find((t) => t.key === key) || types[0]; }
  const chordName = (pc, q) => FLAT[pc] + (typeOf(q).symbol || "");

  function paintWheel() {
    const pc = rootPc(), q = typeInput.value, t = typeOf(q);
    const minor = isMinorType(q);
    const rel = relations(pc, q);
    const mode = modeSelect.value;
    const info = keyInfo(pc, q);
    hubKey.textContent = info.name;
    hubSig.textContent = info.acc;
    // the cell the picked chord sits on
    const selIdx = minor ? MAJORS.indexOf((pc + 3) % 12) : MAJORS.indexOf(pc);
    const selRing = minor ? "inner" : "outer";
    cells.forEach((c) => {
      const r = rel[c.ring + c.idx];
      const isSel = c.ring === selRing && c.idx === selIdx;
      c.g.classList.toggle("is-active", isSel);
      c.g.classList.toggle("is-near", !isSel && !!r && r.strong);
      c.g.classList.toggle("is-far", !isSel && !!r && !r.strong);
      c.g.classList.toggle("is-dim", !r);
      const alpha = c.ring === "outer" ? 0.5 : 0.4;
      let fill;
      if (isSel) fill = "#ff3b3b";
      else if (r) fill = "hsla(" + c.hue + "," + (r.strong ? 70 : 55) + "%," + (r.strong ? 46 : 38) + "%," + (r.strong ? 0.95 : 0.85) + ")";
      else fill = "hsla(" + c.hue + ",30%,24%," + alpha * 0.55 + ")";
      c.slice.style.fill = fill;
      c.sub.textContent = !r ? "" : mode === "degrees" ? r.degree : (isSel ? "chosen" : r.role.split(" ")[0]);
      c.title.textContent = c.name.textContent + (r ? ": " + r.role + " (" + r.degree + ") of " + info.name : ": not in " + info.name);
    });
    // a readable list of the friends
    relatedBox.textContent = "";
    const order = minor ? ["i", "iv", "v", "III", "VI", "VII"] : ["I", "ii", "iii", "IV", "V", "vi"];
    order.forEach((deg) => {
      const c = cells.find((x) => { const r = rel[x.ring + x.idx]; return r && r.degree === deg; });
      if (!c) return;
      const r = rel[c.ring + c.idx];
      const b = document.createElement("button");
      b.type = "button";
      b.className = "main-wheel-related-chip" + (c.g.classList.contains("is-active") ? " is-active" : "");
      b.innerHTML = '<span class="main-wheel-related-deg">' + r.degree + "</span><span>" + c.name.textContent + '</span><span class="main-wheel-related-role">' + r.role + "</span>";
      b.addEventListener("click", () => choose(c.root, c.q));
      relatedBox.appendChild(b);
    });
    applyRotation();
  }

  function applyRotation() {
    group.setAttribute("transform", "rotate(" + rotation + ")");
    cells.forEach((c) => {
      c.label.setAttribute("transform", "translate(" + c.x + " " + c.y + ") rotate(" + -rotation + ")");
    });
  }

  rotateInput.addEventListener("input", () => {
    rotation = Number(rotateInput.value);
    rotateOut.textContent = rotation + "°";
    applyRotation();
  });
  modeSelect.addEventListener("change", paintWheel);
  audioButton.addEventListener("click", () => {
    audioOn = !audioOn;
    audioButton.setAttribute("aria-pressed", String(audioOn));
    audioButton.textContent = audioOn ? "🔊 Sound on" : "🔇 Sound off";
  });

  function refresh() {
    const pc = rootPc(), q = typeInput.value, t = typeOf(q);
    $("main-wheel-name").textContent = chordName(pc, q);
    $("main-wheel-label").textContent = t.label;
    Object.keys(chips).forEach((k) => chips[k].classList.toggle("is-active", k === q));
    paintWheel();
    chart.refresh();
  }

  function choose(pc, q) {
    rootInput.value = SHARP[pc];
    typeInput.value = q;
    refresh();
    wheel.dispatchEvent(new CustomEvent("main-chord-pick", { bubbles: true, detail: { play: audioOn } }));
  }

  // ---------- the chart: one type, every root, drawn on mini keyboards ----------
  const chart = (function () {
    const tabs = $("main-chart-tabs"), grid = $("main-chart-grid");
    let shown = "maj";
    const WHITE = [0, 2, 4, 5, 7, 9, 11], BLACKX = { 1: 0.7, 3: 1.7, 6: 3.7, 8: 4.7, 10: 5.7 };

    function keyboardSvg(pc, formula) {
      const notes = formula.map((s) => pc + s);
      const span = Math.max(...notes) >= 12 + 12 ? 3 : 2;       // octaves drawn
      const wCount = 7 * span, w = 10, h = 34;
      const svg = el("svg", { viewBox: `0 0 ${wCount * w} ${h}`, class: "main-chart-keys", "aria-hidden": "true" });
      const on = new Set(notes), rootNote = pc;
      for (let n = 0; n < 12 * span; n++) {
        const oct = Math.floor(n / 12), p = n % 12;
        if (WHITE.includes(p)) {
          const x = (oct * 7 + WHITE.indexOf(p)) * w;
          el("rect", { x, y: 0, width: w, height: h, class: "main-chart-white" + (on.has(n) ? (n === rootNote ? " is-root" : " is-on") : "") }, svg);
        }
      }
      for (let n = 0; n < 12 * span; n++) {
        const oct = Math.floor(n / 12), p = n % 12;
        if (BLACKX[p] !== undefined) {
          el("rect", { x: (oct * 7 + BLACKX[p]) * w, y: 0, width: w * 0.6, height: h * 0.6, class: "main-chart-black" + (on.has(n) ? (n === rootNote ? " is-root" : " is-on") : "") }, svg);
        }
      }
      return svg;
    }

    function draw() {
      grid.textContent = "";
      const t = typeOf(shown);
      for (let pc = 0; pc < 12; pc++) {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "main-chart-card";
        const title = document.createElement("span");
        title.className = "main-chart-name";
        title.textContent = FLAT[pc] + t.symbol;
        card.appendChild(title);
        card.appendChild(keyboardSvg(pc, t.formula));
        card.addEventListener("click", () => choose(pc, shown));
        card.classList.toggle("is-active", rootPc() === pc && typeInput.value === shown);
        grid.appendChild(card);
      }
    }

    types.forEach((t) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "main-chart-tab";
      b.setAttribute("role", "tab");
      b.textContent = t.symbol || "maj";
      b.title = t.label;
      b.addEventListener("click", () => { shown = t.key; draw(); mark(); });
      tabs.appendChild(b);
    });
    function mark() {
      [...tabs.children].forEach((b, i) => b.classList.toggle("is-active", types[i].key === shown));
    }
    return { refresh() { shown = typeInput.value; draw(); mark(); } };
  })();

  refresh();
})();
