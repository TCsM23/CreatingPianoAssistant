(function () {
  "use strict";
  // The Soulbind kit: scales, chord progressions, game-moment loops and sound effects.
  // It sits on top of studio.js and talks to it through window.StudioApi.
  const A = window.StudioApi;
  if (!A || !document.getElementById("studio-panel-kit")) return;
  const { S, K } = A;
  const $ = (id) => document.getElementById(id);

  const NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
  const HOME = 2; // D, the home key of the game

  // ---------- scales ----------
  const MODES = [
    { name: "Natural minor", steps: [0, 2, 3, 5, 7, 8, 10] },
    { name: "Harmonic minor", steps: [0, 2, 3, 5, 7, 8, 11] },
    { name: "Dorian", steps: [0, 2, 3, 5, 7, 9, 10] },
    { name: "Phrygian dominant", steps: [0, 1, 4, 5, 7, 8, 10] },
    { name: "Lydian", steps: [0, 2, 4, 6, 7, 9, 11] },
    { name: "Major", steps: [0, 2, 4, 5, 7, 9, 11] },
  ];

  const ELEMENTS = [
    { id: "home", label: "Home", mode: "Natural minor", inst: "cathedral",
      text: "Home key. D natural minor with church organ: gothic and tragic, the sound of the whole game." },
    { id: "radiance", label: "Radiance", mode: "Lydian", inst: "bells",
      text: "Bright. D Lydian has a raised 4th (G♯) that feels like light. Bells and harp." },
    { id: "celeste", label: "Celeste", mode: "Dorian", inst: "choir",
      text: "Magic and mystery. D Dorian has a natural 6th (B) that lifts the minor sound. Airy pads." },
    { id: "crimson", label: "Crimson", mode: "Phrygian dominant", inst: "harpsichord",
      text: "Aggressive. D Phrygian dominant has a ♭2 (E♭) with a major 3rd (F♯). Plucked and percussive." },
    { id: "nocturne", label: "Nocturne", mode: "Harmonic minor", inst: "strings",
      text: "Dark magic. D harmonic minor has the raised 7th (C♯), perfect for diminished chords. Low strings." },
  ];

  const modeByName = (name) => MODES.find((m) => m.name === name) || MODES[0];

  const rootSel = $("kit-root");
  const modeSel = $("kit-mode");
  const showBox = $("kit-show");
  NAMES.forEach((n, i) => rootSel.add(new Option(n, String(i))));
  MODES.forEach((m) => modeSel.add(new Option(m.name, m.name)));

  function applyScale(root, modeName, quiet) {
    const mode = modeByName(modeName);
    S.scale = { root, name: mode.name, pcs: mode.steps.map((s) => (root + s) % 12), show: showBox.checked };
    rootSel.value = String(root);
    modeSel.value = mode.name;
    A.redraw();
    if (!quiet) A.save();
  }

  function syncFromState() {
    rootSel.value = String(S.scale.root);
    modeSel.value = MODES.some((m) => m.name === S.scale.name) ? S.scale.name : MODES[0].name;
    showBox.checked = S.scale.show !== false;
  }

  rootSel.addEventListener("change", () => applyScale(Number(rootSel.value), modeSel.value));
  modeSel.addEventListener("change", () => applyScale(Number(rootSel.value), modeSel.value));
  showBox.addEventListener("change", () => { S.scale.show = showBox.checked; A.redraw(); A.save(); });

  $("kit-preview").addEventListener("click", () => {
    const e = A.engine();
    const mode = modeByName(modeSel.value);
    const base = 60 + ((Number(rootSel.value) + 0) % 12) - (Number(rootSel.value) > 6 ? 12 : 0);
    const run = mode.steps.concat([12]);
    const t0 = e.ctx.currentTime + 0.05;
    run.forEach((s, i) => A.playKey(e, base + s, t0 + i * 0.26, 0.5, 0.75));
  });

  function setInstrument(id) {
    K.setInstrument(id);
    const sel = $("main-keyboard-instrument");
    if (sel) sel.value = id;
    A.redraw();
  }

  const elementBox = $("kit-elements");
  ELEMENTS.forEach((el) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "studio-small-button studio-kit-element";
    b.dataset.element = el.id;
    b.textContent = el.label;
    b.addEventListener("click", () => {
      applyScale(HOME, el.mode);
      setInstrument(el.inst);
      $("kit-element-note").textContent = el.text + " The scale is shown on the roll and the keyboard sound is now set.";
      elementBox.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      const e = A.engine();
      const t0 = e.ctx.currentTime + 0.05;
      [0, 2, 4].forEach((d, i) => A.playKey(e, 62 + modeByName(el.mode).steps[d], t0 + i * 0.01, 1.2, 0.7, el.inst));
    });
    elementBox.appendChild(b);
  });

  // ---------- chords ----------
  const ROOTS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const SHAPES = {
    "": [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10],
    dim: [0, 3, 6], dim7: [0, 3, 6, 9], m7b5: [0, 3, 6, 10], maj7: [0, 4, 7, 11],
  };

  function parseChord(name) {
    const m = /^([A-G])([#b]?)(.*)$/.exec(name);
    if (!m || !(m[3] in SHAPES)) return null;
    const root = (ROOTS[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + 12) % 12;
    return { root, shape: SHAPES[m[3]] };
  }

  const pretty = (name) => name.replace("b", "♭").replace("#", "♯");

  // [chord, bars]
  const PROGS = [
    { id: "main", label: "Main loop · Dm B♭ F C", bpm: 92, chords: [["Dm", 1], ["Bb", 1], ["F", 1], ["C", 1]],
      note: "i–VI–III–VII. Heroic and tragic, and it loops without a seam." },
    { id: "gothic", label: "Gothic · Dm Gm A7 Dm", bpm: 88, chords: [["Dm", 1], ["Gm", 1], ["A7", 1], ["Dm", 1]],
      note: "i–iv–V–i. The C♯ inside the A7 chord is the harmonic minor sound." },
    { id: "lament", label: "Lament · Dm C B♭ A", bpm: 96, chords: [["Dm", 1], ["C", 1], ["Bb", 1], ["A", 1]],
      note: "A descending line (i–VII–VI–V). Tense mid-game rounds or a boss." },
    { id: "baroque", label: "Baroque · Dm Gm C F B♭ Em7♭5 A7 Dm", bpm: 100,
      chords: [["Dm", 1], ["Gm", 1], ["C", 1], ["F", 1], ["Bb", 1], ["Em7b5", 1], ["A7", 1], ["Dm", 1]],
      note: "A full circle of fifths over 8 bars. Try it on harpsichord." },
    { id: "corruption", label: "Corruption · Dm E♭ Dm", bpm: 84, chords: [["Dm", 1], ["Eb", 1], ["Dm", 2]],
      note: "i–♭II–i. Menacing, because the E♭ is a half step above the root." },
    { id: "tritone", label: "Corruption + tritone · Dm E♭ Dm", bpm: 84, chords: [["Dm", 1], ["Eb", 1], ["Dm", 2]],
      tritone: true, note: "The same chords with a low A♭ drone underneath, a tritone away from D. Use it at Corruption stage 5 and 10." },
    { id: "horror", label: "Horror sting · Dm C♯dim7 Dm", bpm: 70, chords: [["Dm", 1], ["C#dim7", 1], ["Dm", 2]],
      note: "For Death, the Devil, or a 0-Soul failstate." },
    { id: "victory", label: "Victory · Dm Gm A7 D", bpm: 88, chords: [["Dm", 1], ["Gm", 1], ["A7", 1], ["D", 1]],
      note: "Ends on D major: the minor-to-major change (a Picardy third) is the reward for Ascension." },
  ];
  const progById = (id) => PROGS.find((p) => p.id === id);

  const progSel = $("kit-prog");
  const instSel = $("kit-prog-inst");
  PROGS.forEach((p) => progSel.add(new Option(p.label, p.id)));
  Array.from($("main-keyboard-instrument").options).forEach((o) => instSel.add(new Option(o.textContent, o.value)));
  instSel.value = "cathedral";
  progSel.addEventListener("change", () => { $("kit-prog-note").textContent = progById(progSel.value).note; });
  $("kit-prog-note").textContent = progById(progSel.value).note;

  const BAR = 16;
  const BAR_OPTIONS = [1, 2, 4, 8, 16];

  // Writes a progression onto the roll. The first instrument also gets the bass line.
  function writeProgression(prog, insts, replace) {
    const need = prog.chords.reduce((sum, c) => sum + c[1], 0);
    let bars = BAR_OPTIONS.find((b) => b >= need) || 16;
    if (!replace) bars = Math.max(bars, S.bars);
    if (bars !== S.bars) A.setBars(bars);
    if (replace) S.notes = [];
    const repeats = Math.max(1, Math.floor(bars / need));
    for (let r = 0; r < repeats; r++) {
      let bar = r * need;
      prog.chords.forEach(([name, len]) => {
        const chord = parseChord(name);
        if (!chord) return;
        const start = bar * BAR;
        const span = len * BAR;
        let base = 60 + chord.root;
        if (base > 66) base -= 12;
        insts.forEach((inst, layer) => {
          if (layer === 0) S.notes.push({ midi: 36 + chord.root, start, len: span, vel: 0.8, inst });
          chord.shape.forEach((iv) => S.notes.push({ midi: base + iv, start, len: span, vel: layer === 0 ? 0.65 : 0.5, inst }));
        });
        bar += len;
      });
    }
    if (prog.tritone) S.notes.push({ midi: 44, start: 0, len: bars * BAR, vel: 0.55, inst: "drone" }); // A♭2 under everything
    S.notes = S.notes.filter((n) => n.midi >= 21 && n.midi <= 108);
    A.setBpm(prog.bpm);
    A.sizeRoll();
    A.redraw();
    A.save();
    return { bars, need };
  }

  $("kit-insert").addEventListener("click", () => {
    const prog = progById(progSel.value);
    const out = writeProgression(prog, [instSel.value], $("kit-replace").checked);
    $("kit-prog-note").textContent = "Wrote " + prog.chords.length + " chords over " + out.bars + " bar" + (out.bars > 1 ? "s" : "") +
      " at " + prog.bpm + " BPM. Open the Piano roll to edit them, or press Play. " + prog.note;
  });

  // ---------- game moments ----------
  const NONE = "................";
  const MOMENTS = [
    { id: "phase1", label: "Phase 1", sub: "sparse", prog: "main", bpm: 76, insts: ["cathedral", "strings"], scale: ["Natural minor"],
      drums: {}, text: "Phase 1 · about 76 BPM, organ with a soft pad, no drums. Quiet enough to think over." },
    { id: "phase23", label: "Phase 2–3", sub: "percussion + strings", prog: "main", bpm: 92, insts: ["strings", "harp"], scale: ["Natural minor"],
      drums: { kick: "x.......x.......", hat: "..x...x...x...x.", rim: "............x..." },
      text: "Phases 2–3 · 92 BPM, strings and harp with light percussion." },
    { id: "phase4", label: "Phase 4+", sub: "choir + busy drums", prog: "lament", bpm: 118, insts: ["choir", "cathedral"], scale: ["Natural minor"],
      drums: { kick: "x..x..x.x..x..x.", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.x.", open: "......x.......x.", tom: "...........x.x.." },
      text: "Phase 4 and beyond · 118 BPM, choir over organ with a busy drum pattern on the descending lament." },
    { id: "awakened", label: "Awakened", sub: "organ + choir", prog: "gothic", bpm: 104, insts: ["cathedral", "choir"], scale: ["Harmonic minor"],
      drums: { kick: "x.......x.......", tom: "............x.x." },
      text: "Awakened · organ and choir on the gothic progression: the sign that the endgame has started." },
    { id: "ascension", label: "Ascension", sub: "resolves to major", prog: "victory", bpm: 88, insts: ["cathedral", "choir", "bells"], scale: ["Natural minor"],
      drums: {}, text: "Ascension · the loop ends on D major. Let the last chord ring." },
    { id: "corr5", label: "Corruption 5", sub: "drone + heartbeat", prog: "tritone", bpm: 84, insts: ["drone", "strings"], scale: ["Harmonic minor"],
      drums: { kick: "x.x.............", cow: NONE }, text: "Corruption stage 5 · dark drone with a heartbeat kick and the tritone under it." },
    { id: "corr10", label: "Corruption 10", sub: "dissonant + fast", prog: "tritone", bpm: 108, insts: ["drone", "chipbass", "strings"], scale: ["Phrygian dominant"],
      drums: { kick: "x.x...x.x.x.....", hat: "x.x.x.x.x.x.x.x.", rim: "....x.......x..." },
      text: "Corruption stage 10 · faster, with a chip bass and the Phrygian dominant scale shown on the roll." },
    { id: "death", label: "Death sting", sub: "Dm C♯dim7 Dm", prog: "horror", bpm: 70, insts: ["cathedral", "strings", "drone"], scale: ["Harmonic minor"],
      drums: {}, text: "Death, the Devil, or a 0-Soul failstate · slow, with the diminished chord in the middle." },
  ];

  const momentBox = $("kit-moments");
  MOMENTS.forEach((m) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "studio-small-button studio-kit-moment";
    b.dataset.moment = m.id;
    b.innerHTML = "<strong></strong><span></span>";
    b.firstChild.textContent = m.label;
    b.lastChild.textContent = m.sub;
    b.addEventListener("click", () => {
      const prog = progById(m.prog);
      const out = writeProgression(prog, m.insts, true);
      A.TRACK_IDS.forEach((id) => {
        const row = m.drums[id] || NONE;
        for (let i = 0; i < 16; i++) S.pattern[id][i] = row.charAt(i) === "x";
      });
      applyScale(HOME, m.scale[0], true);
      A.paint();
      A.save();
      momentBox.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      $("kit-moment-note").textContent = m.text + " (" + out.bars + " bars, " + prog.bpm + " BPM.) Press Play, then edit it on the Piano roll.";
    });
    momentBox.appendChild(b);
  });

  // ---------- sound effects ----------
  // Every pitch is D, F, A or C so the effects sit inside the music.
  const N = { D2: 38, A2: 45, D3: 50, F3: 53, A3: 57, C4: 60, D4: 62, F4: 65, A4: 69, C5: 72, D5: 74, F5: 77, A5: 81, C6: 84, D6: 86, F6: 89 };
  const HZ = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function node(ctx, out, gain) {
    const g = ctx.createGain();
    g.gain.value = gain;
    g.connect(out);
    return g;
  }

  function sweepNoise(ctx, out, t, o) {
    const src = ctx.createBufferSource();
    const len = Math.ceil(ctx.sampleRate * (o.dur + 0.1));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = o.q || 3;
    f.frequency.setValueAtTime(o.from, t);
    f.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.peak, t + o.dur * (o.rise || 0.5));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f);
    f.connect(g);
    g.connect(o.dest);
    src.start(t);
    src.stop(t + o.dur + 0.05);
  }

  function chordInto(ctx, dest, midis, t, dur, vol, inst) {
    midis.forEach((m) => K.noteInto(ctx, dest, m, t, dur, vol, inst));
  }

  const SFX = [
    { id: "card-draw", label: "Card draw", dur: 1.4, text: "Paper shuffle and a soft bell (A).",
      build(ctx, out) {
        const b = node(ctx, out, 1);
        [0, 0.045, 0.09].forEach((o, i) => A.noiseHit(ctx, b, 0.02, { type: "bandpass", freq: 4200 - i * 600, q: 0.8, peak: 0.5 - i * 0.1, decay: 0.07, offset: o }));
        K.noteInto(ctx, out, N.A5, 0.12, 0.9, 0.09, "bells");
      } },
    { id: "card-play", label: "Card play", dur: 1.4, text: "A soft thud and a two-note bell (D and F).",
      build(ctx, out) {
        const b = node(ctx, out, 1);
        A.noiseHit(ctx, b, 0.02, { type: "lowpass", freq: 1200, peak: 0.7, decay: 0.09 });
        A.tone(ctx, b, 0.02, "sine", 190, 80, 0.07, 0.8, 0.2);
        K.noteInto(ctx, out, N.D5, 0.04, 0.9, 0.09, "bells");
        K.noteInto(ctx, out, N.F5, 0.1, 0.9, 0.07, "bells");
      } },
    { id: "attack", label: "Attack", dur: 1.3, text: "A metal hit with a short choir stab (D minor).",
      build(ctx, out) {
        const b = node(ctx, out, 1);
        A.noiseHit(ctx, b, 0.02, { type: "highpass", freq: 2500, peak: 0.8, decay: 0.3 });
        [HZ(N.D5) * 1.0, 1180, 1710, 2330].forEach((f, i) => A.tone(ctx, node(ctx, b, 0.18), 0.02, "square", f, f, 0.01, 1 - i * 0.15, 0.25 + i * 0.05));
        A.tone(ctx, b, 0.02, "sine", 150, 48, 0.12, 1, 0.3);
        chordInto(ctx, out, [N.D3, N.A3, N.D4, N.F4], 0.03, 0.35, 0.13, "choir");
      } },
    { id: "soul-steal", label: "Soul steal", dur: 1.6, text: "A whispery upward sweep that ends in a tiny ping (A).",
      build(ctx, out) {
        const b = node(ctx, out, 1);
        sweepNoise(ctx, b, 0.05, { from: 500, to: 4500, q: 5, peak: 0.7, dur: 1.0, rise: 0.92, dest: b });
        A.tone(ctx, node(ctx, b, 0.35), 0.05, "sine", HZ(N.D4), HZ(N.A5), 1.0, 0.5, 1.0);
        K.noteInto(ctx, out, N.A5, 1.05, 0.5, 0.07, "bells");
      } },
    { id: "corruption-tick", label: "Corruption tick", dur: 1.4, text: "A low heartbeat over a slightly detuned D.",
      build(ctx, out) {
        const b = node(ctx, out, 1);
        [[0.02, 1], [0.22, 0.7]].forEach(([t, v]) => A.tone(ctx, b, t, "sine", 85, 38, 0.14, v, 0.32));
        [HZ(N.D2), HZ(N.D2) * 1.014].forEach((f) => A.tone(ctx, node(ctx, b, 0.3), 0.02, "sine", f, f, 0.01, 0.8, 0.9));
      } },
    { id: "heal", label: "Heal chime", dur: 2.4, text: "A rising chime through D, F, A, C.",
      build(ctx, out) {
        [N.D5, N.F5, N.A5, N.C6].forEach((m, i) => K.noteInto(ctx, out, m, 0.03 + i * 0.09, 1.6, 0.09, "bells"));
        K.noteInto(ctx, out, N.D4, 0.03, 1.2, 0.07, "harp");
      } },
    { id: "corruption-minus", label: "Corruption −1", dur: 1.6, text: "A sigh: falling breath and a sliding note, D to A.",
      build(ctx, out) {
        const b = node(ctx, out, 1);
        sweepNoise(ctx, b, 0.02, { from: 1800, to: 450, q: 1.6, peak: 0.55, dur: 1.2, rise: 0.25, dest: b });
        A.tone(ctx, node(ctx, b, 0.25), 0.05, "sine", HZ(N.D4), HZ(N.A3), 1.0, 0.6, 1.1);
      } },
    { id: "souls-plus", label: "Souls +3", dur: 2.6, text: "A ghostly sparkle: high bells (D, A, F, A) over airy noise.",
      build(ctx, out) {
        const b = node(ctx, out, 1);
        [N.D6, N.A5, N.F6, N.A5 + 12].forEach((m, i) => K.noteInto(ctx, out, m, 0.03 + i * 0.075, 1.6, 0.06, "bells"));
        A.noiseHit(ctx, node(ctx, b, 0.35), 0.03, { type: "highpass", freq: 6500, peak: 0.25, decay: 1.4 });
        K.noteInto(ctx, out, N.A4, 0.05, 1.8, 0.08, "choir");
      } },
    { id: "awakened", label: "Awakened swell", dur: 4.0, text: "A rising organ swell on Dm.",
      build(ctx, out) {
        const swell = ctx.createGain();
        swell.gain.setValueAtTime(0.02, 0);
        swell.gain.exponentialRampToValueAtTime(1.0, 2.2);
        swell.gain.exponentialRampToValueAtTime(0.0001, 3.9);
        swell.connect(out);
        [N.D2, N.D3, N.A3, N.D4, N.F4, N.A4].forEach((m, i) => K.noteInto(ctx, swell, m, 0.1 + i * 0.25, 3.2 - i * 0.25, 0.14, "cathedral"));
      } },
    { id: "death-sting", label: "Death sting", dur: 4.0, text: "Dm, then C♯ diminished 7th, then Dm. The only effect with a note outside the key, on purpose.",
      build(ctx, out) {
        A.noiseHit(ctx, node(ctx, out, 1), 0.02, { type: "lowpass", freq: 900, peak: 0.6, decay: 0.3 });
        chordInto(ctx, out, [N.D2, N.D3, N.F3, N.A3, N.D4], 0.02, 0.55, 0.13, "cathedral");
        chordInto(ctx, out, [37, 49, 55, 58, 61], 0.6, 0.55, 0.13, "strings");
        chordInto(ctx, out, [N.D2, N.D3, N.F3, N.A3, N.D4], 1.2, 2.4, 0.13, "cathedral");
        chordInto(ctx, out, [N.D3, N.A3], 1.2, 2.4, 0.1, "drone");
      } },
    { id: "victory", label: "Victory", dur: 5.0, text: "Dm, Gm, A7, then D major. The Picardy third.",
      build(ctx, out) {
        chordInto(ctx, out, [N.D3, N.F3, N.A3, N.D4], 0.02, 0.5, 0.13, "cathedral");
        chordInto(ctx, out, [43, 50, 55, 58], 0.55, 0.5, 0.13, "cathedral");
        chordInto(ctx, out, [45, 52, 55, 61, 67], 1.1, 0.5, 0.13, "cathedral");
        chordInto(ctx, out, [N.D2, N.D3, N.A3, 66, N.D4], 1.65, 3.0, 0.14, "cathedral");
        chordInto(ctx, out, [66, N.A4, N.D5], 1.65, 3.0, 0.1, "choir");
        [N.D5, 78, N.A5, N.D6].forEach((m, i) => K.noteInto(ctx, out, m, 1.7 + i * 0.1, 2.4, 0.06, "bells"));
      } },
    { id: "phase-shift", label: "Phase shift gong", dur: 4.6, text: "A low gong on D for the start of a new phase.",
      build(ctx, out) {
        const b = node(ctx, out, 1);
        A.noiseHit(ctx, b, 0.02, { type: "lowpass", freq: 1400, peak: 0.6, decay: 0.25 });
        [1, 1.47, 2.09, 2.56, 3.33, 4.2].forEach((r, i) => {
          const f = HZ(N.D2) * 2 * r;
          A.tone(ctx, node(ctx, b, 0.9 / (1 + i * 0.5)), 0.02, "sine", f, f * 0.995, 2, 1, 3.8 - i * 0.3);
          A.tone(ctx, node(ctx, b, 0.5 / (1 + i * 0.6)), 0.02, "sine", f * 1.007, f * 1.002, 2, 1, 3.4 - i * 0.3);
        });
      } },
  ];

  const cache = new Map();

  function normalise(buffer) {
    let peak = 0;
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const d = buffer.getChannelData(c);
      for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
    }
    if (peak < 0.0001) return buffer;
    const k = 0.89 / peak;
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const d = buffer.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] *= k;
    }
    return buffer;
  }

  async function renderSfx(sfx, fresh) {
    if (!fresh && cache.has(sfx.id)) return cache.get(sfx.id);
    const buffer = normalise(await A.renderBuffer(sfx.dur, (ctx, out) => sfx.build(ctx, out)));
    cache.set(sfx.id, buffer);
    return buffer;
  }

  const sfxNote = $("kit-sfx-note");
  let sfxSource = null;

  async function playSfx(sfx) {
    sfxNote.textContent = "";
    try {
      const buffer = await renderSfx(sfx, false);
      const ctx = K.getCtx();
      if (sfxSource) { try { sfxSource.stop(); } catch (error) { /* already finished */ } }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const g = ctx.createGain();
      g.gain.value = 0.8;
      src.connect(g);
      g.connect(K.getMix());
      src.start();
      sfxSource = src;
    } catch (error) {
      sfxNote.textContent = "Could not play it: " + error.message;
    }
  }

  async function downloadSfx(sfx) {
    try {
      const buffer = await renderSfx(sfx, false);
      A.download(A.encodeWav(buffer), "soulbind-" + sfx.id + ".wav");
      sfxNote.textContent = "Saved soulbind-" + sfx.id + ".wav";
    } catch (error) {
      sfxNote.textContent = "Could not save it: " + error.message;
    }
  }

  const sfxBox = $("kit-sfx");
  SFX.forEach((sfx) => {
    const row = document.createElement("div");
    row.className = "studio-kit-sfx-row";
    row.dataset.sfx = sfx.id;
    row.innerHTML = '<div class="studio-kit-sfx-text"><strong></strong><span></span></div>' +
      '<button type="button" class="studio-small-button" data-act="play">▶ Play</button>' +
      '<button type="button" class="studio-small-button" data-act="save" aria-label="Download WAV">⬇ WAV</button>';
    row.querySelector("strong").textContent = sfx.label;
    row.querySelector("span").textContent = sfx.text;
    row.querySelector('[data-act="play"]').addEventListener("click", () => playSfx(sfx));
    row.querySelector('[data-act="save"]').addEventListener("click", () => downloadSfx(sfx));
    sfxBox.appendChild(row);
  });

  // ---------- a small .zip writer (files stored, not compressed) ----------
  const CRC = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return (bytes) => {
      let c = 0xffffffff;
      for (let i = 0; i < bytes.length; i++) c = table[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
      return (c ^ 0xffffffff) >>> 0;
    };
  })();

  function makeZip(files) { // files: [{ name, data: Uint8Array }]
    const enc = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;
    files.forEach((f) => {
      const name = enc.encode(f.name);
      const crc = CRC(f.data);
      const head = new DataView(new ArrayBuffer(30));
      head.setUint32(0, 0x04034b50, true);
      head.setUint16(4, 20, true);
      head.setUint16(6, 0x0800, true); // names are UTF-8
      head.setUint16(8, 0, true);      // stored
      head.setUint16(10, 0, true);
      head.setUint16(12, 0x21, true);  // 1980-01-01
      head.setUint32(14, crc, true);
      head.setUint32(18, f.data.length, true);
      head.setUint32(22, f.data.length, true);
      head.setUint16(26, name.length, true);
      head.setUint16(28, 0, true);
      chunks.push(new Uint8Array(head.buffer), name, f.data);
      const dir = new DataView(new ArrayBuffer(46));
      dir.setUint32(0, 0x02014b50, true);
      dir.setUint16(4, 20, true);
      dir.setUint16(6, 20, true);
      dir.setUint16(8, 0x0800, true);
      dir.setUint16(10, 0, true);
      dir.setUint16(12, 0, true);
      dir.setUint16(14, 0x21, true);
      dir.setUint32(16, crc, true);
      dir.setUint32(20, f.data.length, true);
      dir.setUint32(24, f.data.length, true);
      dir.setUint16(28, name.length, true);
      dir.setUint32(42, offset, true);
      central.push(new Uint8Array(dir.buffer), name);
      offset += 30 + name.length + f.data.length;
    });
    const dirSize = central.reduce((s, c) => s + c.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, dirSize, true);
    end.setUint32(16, offset, true);
    return new Blob(chunks.concat(central, [new Uint8Array(end.buffer)]), { type: "application/zip" });
  }

  $("kit-sfx-zip").addEventListener("click", async () => {
    const button = $("kit-sfx-zip");
    button.disabled = true;
    try {
      const files = [];
      for (let i = 0; i < SFX.length; i++) {
        sfxNote.textContent = "Rendering " + (i + 1) + " of " + SFX.length + "…";
        const wav = A.encodeWav(await renderSfx(SFX[i], false));
        files.push({ name: "soulbind-" + SFX[i].id + ".wav", data: new Uint8Array(await wav.arrayBuffer()) });
      }
      const zip = makeZip(files);
      A.download(zip, "soulbind-sfx.zip");
      sfxNote.textContent = "Saved soulbind-sfx.zip with " + files.length + " files (" + (zip.size / 1048576).toFixed(1) + " MB).";
    } catch (error) {
      sfxNote.textContent = "Could not make the zip: " + error.message;
    }
    button.disabled = false;
  });

  syncFromState();
  window.StudioKit = { SFX, PROGS, MOMENTS, MODES, parseChord, makeZip, renderSfx, writeProgression, applyScale };
})();
