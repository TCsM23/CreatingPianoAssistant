(function () {
  "use strict";

  const K = window.PianoKit;
  const Hub = window.MidiHub;
  const $ = (id) => document.getElementById(id);

  const grid = $("studio-grid");
  if (!grid || !K) return;

  const STEPS = 16;             // sixteenth notes in one bar
  const LOOKAHEAD_MS = 25;      // how often the scheduler wakes up
  const SCHEDULE_AHEAD = 0.1;   // how far ahead (seconds) it plans sounds
  const STORE_KEY = "tcsmusic-studio";
  const MAP_KEY = "tcsmusic-studio-midi";
  const TRACKS = JSON.parse($("studio-tracks-data").textContent);
  const TRACK_IDS = TRACKS.map((t) => t.id);
  const CHANNELS = TRACK_IDS.concat(["keys"]);
  const NAME = {};
  TRACKS.forEach((t) => { NAME[t.id] = t.name; });
  NAME.keys = "Keys";

  const playButton = $("studio-play");
  const stopButton = $("studio-stop");
  const recordButton = $("studio-record");
  const bpmInput = $("studio-bpm");
  const bpmValue = $("studio-bpm-value");
  const barsSelect = $("studio-bars");
  const presetSelect = $("studio-preset");
  const clearButton = $("studio-clear");
  const exportButton = $("studio-export");
  const exportNote = $("studio-export-note");

  // ---------- data ----------
  // pattern.kick[3] === true means "play the kick on step 4"
  const S = {
    bars: 1,
    pattern: {},
    notes: [],      // piano roll: { midi, start (in steps), len (in steps), vel (0-1) }
    mixer: {},      // { vol 0-1, pan -1..1, mute, solo } per channel
    master: 0.9,
    pads: ["kick", "snare", "clap", "hat", "open", "tom", "rim", "cow",
           "kick", "snare", "clap", "hat", "open", "tom", "rim", "cow"],
    snap: 2,
    rollBase: 48,
  };
  const stepButtons = {};
  TRACK_IDS.forEach((id) => {
    S.pattern[id] = new Array(STEPS).fill(false);
    stepButtons[id] = [];
  });
  CHANNELS.forEach((id) => { S.mixer[id] = { vol: 0.8, pan: 0, mute: false, solo: false }; });

  grid.querySelectorAll(".studio-grid-step").forEach((button) => {
    stepButtons[button.dataset.track][Number(button.dataset.step)] = button;
  });

  // "x" is a hit, "." is a rest. Easy to read and easy to type.
  const PRESETS = {
    four: { kick: "x...x...x...x...", snare: "....x.......x...", hat: "..x...x...x...x." },
    boom: { kick: "x.....x...x.....", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.x.", open: "......x.......x." },
    half: { kick: "x...............", snare: "........x.......", clap: "........x.......", hat: "x.x.x.x.x.x.x.x." },
  };

  const totalSteps = () => S.bars * STEPS;
  const stepLength = () => 60 / Number(bpmInput.value) / 4; // one sixteenth note, in seconds

  // ---------- sounds (all built from oscillators and noise) ----------
  const noises = new WeakMap();

  function noiseBuffer(ctx) {
    if (!noises.has(ctx)) {
      const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      noises.set(ctx, buffer);
    }
    return noises.get(ctx);
  }

  function noiseHit(ctx, bus, time, o) {
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = o.type;
    filter.frequency.value = o.freq;
    filter.Q.value = o.q || 0.7;
    const gain = ctx.createGain();
    const start = time + (o.offset || 0);
    gain.gain.setValueAtTime(o.peak, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + o.decay);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(bus);
    source.start(start, Math.random() * 0.5);
    source.stop(start + o.decay + 0.05);
  }

  function tone(ctx, bus, time, type, from, to, sweep, peak, decay) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, time);
    osc.frequency.exponentialRampToValueAtTime(to, time + sweep);
    gain.gain.setValueAtTime(peak, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + decay);
    osc.connect(gain);
    gain.connect(bus);
    osc.start(time);
    osc.stop(time + decay + 0.05);
  }

  const VOICES = {
    kick(ctx, bus, t) { tone(ctx, bus, t, "sine", 150, 45, 0.12, 1, 0.4); },
    snare(ctx, bus, t) {
      noiseHit(ctx, bus, t, { type: "highpass", freq: 1200, peak: 0.7, decay: 0.18 });
      tone(ctx, bus, t, "triangle", 190, 120, 0.08, 0.5, 0.12);
    },
    clap(ctx, bus, t) {
      [0, 0.012, 0.024].forEach((offset) => {
        noiseHit(ctx, bus, t, { type: "bandpass", freq: 1400, q: 1, peak: 0.6, decay: 0.012, offset });
      });
      noiseHit(ctx, bus, t, { type: "bandpass", freq: 1400, q: 1, peak: 0.5, decay: 0.16, offset: 0.036 });
    },
    hat(ctx, bus, t) { noiseHit(ctx, bus, t, { type: "highpass", freq: 7000, peak: 0.35, decay: 0.05 }); },
    open(ctx, bus, t) { noiseHit(ctx, bus, t, { type: "highpass", freq: 7000, peak: 0.3, decay: 0.35 }); },
    tom(ctx, bus, t) { tone(ctx, bus, t, "sine", 190, 85, 0.18, 0.9, 0.38); },
    rim(ctx, bus, t) {
      tone(ctx, bus, t, "square", 1700, 1100, 0.01, 0.25, 0.04);
      noiseHit(ctx, bus, t, { type: "bandpass", freq: 3200, q: 2, peak: 0.35, decay: 0.03 });
    },
    cow(ctx, bus, t) {
      tone(ctx, bus, t, "square", 560, 560, 0.01, 0.22, 0.3);
      tone(ctx, bus, t, "square", 845, 845, 0.01, 0.22, 0.3);
    },
  };

  // ---------- the engine: channels -> master -> output ----------
  // The same code builds the live engine and the offline one that renders a WAV.
  function buildEngine(ctx, dest, live) {
    const master = ctx.createGain();
    master.connect(dest);
    const ch = {};
    CHANNELS.forEach((id) => {
      const input = ctx.createGain();
      const pan = ctx.createStereoPanner();
      input.connect(pan);
      pan.connect(master);
      let analyser = null;
      if (live) {
        analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        pan.connect(analyser);
      }
      ch[id] = { input, pan, analyser };
    });
    let masterAnalyser = null;
    if (live) {
      masterAnalyser = ctx.createAnalyser();
      masterAnalyser.fftSize = 512;
      master.connect(masterAnalyser);
    }
    const engine = { ctx, master, ch, masterAnalyser, live };
    applyMixer(engine);
    return engine;
  }

  function anySolo() { return CHANNELS.some((id) => S.mixer[id].solo); }

  function applyMixer(e) {
    const solo = anySolo();
    const now = e.ctx.currentTime;
    CHANNELS.forEach((id) => {
      const m = S.mixer[id];
      const audible = !m.mute && (!solo || m.solo);
      const target = audible ? m.vol : 0;
      if (e.live) {
        e.ch[id].input.gain.setTargetAtTime(target, now, 0.01);
        e.ch[id].pan.pan.setTargetAtTime(m.pan, now, 0.01);
      } else {
        e.ch[id].input.gain.value = target;
        e.ch[id].pan.pan.value = m.pan;
      }
    });
    if (e.live) e.master.gain.setTargetAtTime(S.master, now, 0.01);
    else e.master.gain.value = S.master;
  }

  let live = null;
  function engine() {
    if (!live) {
      const ctx = K.getCtx();
      live = buildEngine(ctx, K.getMix(), true);
    }
    return live;
  }

  function hitDrum(e, id, time, vel) {
    const g = e.ctx.createGain();
    g.gain.value = vel;
    g.connect(e.ch[id].input);
    VOICES[id](e.ctx, g, time);
  }

  function playKey(e, midi, time, dur, vel) {
    K.noteInto(e.ctx, e.ch.keys.input, midi, time, dur, 0.04 + 0.14 * vel, K.getInstrument());
  }

  function scheduleStepInto(e, step, time, stepLen) {
    const ds = step % STEPS;
    TRACK_IDS.forEach((id) => {
      if (S.pattern[id][ds]) hitDrum(e, id, time, 1);
    });
    S.notes.forEach((n) => {
      if (n.start === step) playKey(e, n.midi, time, Math.max(0.08, n.len * stepLen), n.vel);
    });
  }

  // ---------- the clock ----------
  let playing = false;
  let recording = false;
  let timer = null;
  let frameId = null;
  let nextStep = 0;
  let nextTime = 0;
  let queue = [];     // steps that are scheduled but not yet shown
  let lit = -1;
  let curStep = 0;    // the step that is sounding now
  let curTime = 0;    // when it started (audio clock)

  function scheduler() {
    const e = engine();
    while (nextTime < e.ctx.currentTime + SCHEDULE_AHEAD) {
      scheduleStepInto(e, nextStep, nextTime, stepLength());
      queue.push({ step: nextStep, time: nextTime });
      nextTime += stepLength();
      nextStep = (nextStep + 1) % totalSteps();
    }
  }

  function showStep(step) {
    TRACK_IDS.forEach((id) => {
      if (lit >= 0) stepButtons[id][lit].classList.remove("studio-grid-step-now");
      if (step >= 0) stepButtons[id][step % STEPS].classList.add("studio-grid-step-now");
    });
    lit = step >= 0 ? step % STEPS : -1;
  }

  // where we are right now, in steps (with a fraction), for recording and the playhead
  function position() {
    if (!playing) return 0;
    const e = engine();
    const frac = Math.max(0, Math.min(1, (e.ctx.currentTime - curTime) / stepLength()));
    return curStep + frac;
  }

  function start() {
    const e = engine();
    playing = true;
    nextStep = 0;
    curStep = 0;
    nextTime = e.ctx.currentTime + 0.06;
    curTime = nextTime;
    queue = [];
    scheduler();
    timer = setInterval(scheduler, LOOKAHEAD_MS);
    playButton.textContent = "■ Stop";
    playButton.setAttribute("aria-pressed", "true");
    dirty = true;
  }

  function stop() {
    playing = false;
    clearInterval(timer);
    queue = [];
    showStep(-1);
    curStep = 0;
    playButton.textContent = "▶ Play";
    playButton.setAttribute("aria-pressed", "false");
    setRecording(false);
    dirty = true;
  }

  function setRecording(on) {
    recording = on;
    recordButton.setAttribute("aria-pressed", String(on));
    recordButton.textContent = on ? "● Recording" : "● Record";
  }

  // ---------- drawing the grid from the data ----------
  function paint() {
    TRACK_IDS.forEach((id) => {
      for (let i = 0; i < STEPS; i++) {
        stepButtons[id][i].setAttribute("aria-pressed", String(S.pattern[id][i]));
      }
      grid.querySelector('.studio-grid-mute[data-track="' + id + '"]')
        .setAttribute("aria-pressed", String(S.mixer[id].mute));
    });
  }

  // ---------- remembering ----------
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        pattern: S.pattern, notes: S.notes, mixer: S.mixer, master: S.master, pads: S.pads,
        bars: S.bars, snap: S.snap, rollBase: S.rollBase, bpm: Number(bpmInput.value),
      }));
    } catch (error) { /* private window: just don't remember */ }
  }

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (!saved) return;
      TRACK_IDS.forEach((id) => {
        if (Array.isArray(saved.pattern && saved.pattern[id])) {
          for (let i = 0; i < STEPS; i++) S.pattern[id][i] = saved.pattern[id][i] === true;
        }
        if (saved.muted && saved.muted[id]) S.mixer[id].mute = true; // the first Studio saved mutes here
      });
      if (saved.mixer) {
        CHANNELS.forEach((id) => {
          const m = saved.mixer[id];
          if (!m) return;
          S.mixer[id] = {
            vol: Math.max(0, Math.min(1, Number(m.vol))) || 0,
            pan: Math.max(-1, Math.min(1, Number(m.pan))) || 0,
            mute: m.mute === true,
            solo: m.solo === true,
          };
        });
      }
      if (Array.isArray(saved.notes)) {
        S.notes = saved.notes
          .filter((n) => n && n.midi >= 21 && n.midi <= 108 && n.start >= 0 && n.len > 0)
          .map((n) => ({ midi: n.midi | 0, start: n.start | 0, len: Math.max(1, n.len | 0), vel: Math.max(0.05, Math.min(1, Number(n.vel) || 0.8)) }));
      }
      if (typeof saved.master === "number") S.master = Math.max(0, Math.min(1, saved.master));
      if (Array.isArray(saved.pads) && saved.pads.length === 16) {
        S.pads = saved.pads.map((id, i) => (TRACK_IDS.includes(id) ? id : S.pads[i]));
      }
      if ([1, 2, 4, 8, 16].includes(saved.bars)) S.bars = saved.bars;
      if ([1, 2, 4].includes(saved.snap)) S.snap = saved.snap;
      if (saved.rollBase >= 24 && saved.rollBase <= 84) S.rollBase = saved.rollBase;
      const bpm = Number(saved.bpm);
      if (bpm >= 60 && bpm <= 180) bpmInput.value = bpm;
      const limit = totalSteps();
      S.notes = S.notes.filter((n) => n.start < limit).map((n) => ({ ...n, len: Math.min(n.len, limit - n.start) }));
    } catch (error) { /* bad data: start empty */ }
  }

  // ---------- setters (one place changes things, so the screen never disagrees with the sound) ----------
  function setBpm(value) {
    const bpm = Math.round(Math.max(60, Math.min(180, value)));
    bpmInput.value = bpm;
    bpmValue.textContent = bpm;
    save();
  }

  function setBars(bars) {
    S.bars = bars;
    barsSelect.value = String(bars);
    const limit = totalSteps();
    S.notes = S.notes.filter((n) => n.start < limit).map((n) => ({ ...n, len: Math.min(n.len, limit - n.start) }));
    if (playing) nextStep = nextStep % limit;
    sizeRoll();
    dirty = true;
    save();
  }

  const mixerEls = {};
  function syncMixerUi(id) {
    const els = mixerEls[id];
    if (!els) return;
    const m = id === "master" ? { vol: S.master, pan: 0, mute: false, solo: false } : S.mixer[id];
    els.fader.value = Math.round(m.vol * 100);
    if (els.pan) els.pan.value = Math.round(m.pan * 100);
    if (els.mute) els.mute.setAttribute("aria-pressed", String(m.mute));
    if (els.solo) els.solo.setAttribute("aria-pressed", String(m.solo));
  }

  function mixChanged() {
    if (live) applyMixer(live);
    CHANNELS.forEach(syncMixerUi);
    syncMixerUi("master");
    paint();
    save();
  }

  function setVol(id, value) {
    if (id === "master") S.master = Math.max(0, Math.min(1, value));
    else S.mixer[id].vol = Math.max(0, Math.min(1, value));
    mixChanged();
  }
  function setPan(id, value) { S.mixer[id].pan = Math.max(-1, Math.min(1, value)); mixChanged(); }
  function toggleMute(id) { S.mixer[id].mute = !S.mixer[id].mute; mixChanged(); }
  function toggleSolo(id) { S.mixer[id].solo = !S.mixer[id].solo; mixChanged(); }

  // ---------- pads ----------
  const padEls = [];
  const padsBox = $("studio-pads");
  S.pads.forEach((voice, i) => {
    const wrap = document.createElement("div");
    wrap.className = "studio-pad-wrap";
    const pad = document.createElement("button");
    pad.type = "button";
    pad.className = "studio-pad";
    pad.dataset.target = "pad:" + i;
    pad.innerHTML = '<span class="studio-pad-num">' + (i + 1) + "</span>";
    const select = document.createElement("select");
    select.className = "studio-pad-voice";
    select.setAttribute("aria-label", "Sound for pad " + (i + 1));
    TRACKS.forEach((t) => {
      const o = document.createElement("option");
      o.value = t.id;
      o.textContent = t.name;
      select.appendChild(o);
    });
    select.value = voice;
    select.addEventListener("change", () => { S.pads[i] = select.value; save(); });
    pad.addEventListener("pointerdown", (event) => {
      if (learning) return;
      event.preventDefault();
      hitPad(i, 0.85);
    });
    wrap.append(pad, select);
    padsBox.appendChild(wrap);
    padEls.push({ pad, select });
  });

  function flash(el) {
    el.classList.add("is-hit");
    setTimeout(() => el.classList.remove("is-hit"), 110);
  }

  function hitPad(i, vel) {
    const voice = S.pads[i];
    const e = engine();
    hitDrum(e, voice, e.ctx.currentTime, 0.4 + 0.6 * vel);
    flash(padEls[i].pad);
    if (recording && playing) {
      const step = Math.round(position()) % totalSteps();
      S.pattern[voice][step % STEPS] = true;
      paint();
      save();
    }
  }

  // ---------- piano roll ----------
  const roll = $("studio-roll");
  const rollScroll = $("studio-roll-scroll");
  const rollCtx = roll.getContext("2d");
  const LABEL_W = 58;
  const ROW_H = 16;
  const ROWS = 36;
  const BLACK = [1, 3, 6, 8, 10];
  let stepW = 24;
  let dirty = true;
  let lastLen = 2;
  let drag = null;

  function cssVar(name, fallback) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  }

  function sizeRoll() {
    const avail = Math.max(300, rollScroll.clientWidth - LABEL_W);
    stepW = Math.max(22, Math.floor(avail / totalSteps()));
    const w = LABEL_W + stepW * totalSteps();
    const h = ROWS * ROW_H;
    const dpr = window.devicePixelRatio || 1;
    roll.style.width = w + "px";
    roll.style.height = h + "px";
    roll.width = Math.round(w * dpr);
    roll.height = Math.round(h * dpr);
    rollCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dirty = true;
  }

  const rowOf = (midi) => ROWS - 1 - (midi - S.rollBase);
  const midiOf = (row) => S.rollBase + ROWS - 1 - row;

  function drawRoll() {
    const w = LABEL_W + stepW * totalSteps();
    const h = ROWS * ROW_H;
    const light = document.documentElement.dataset.theme === "light";
    const ink = light ? "#1a0b0f" : "#f3e9e9";
    rollCtx.clearRect(0, 0, w, h);
    for (let r = 0; r < ROWS; r++) {
      const midi = midiOf(r);
      const black = BLACK.includes(midi % 12);
      rollCtx.fillStyle = black
        ? (light ? "rgba(80,10,12,0.10)" : "rgba(0,0,0,0.38)")
        : (light ? "rgba(80,10,12,0.03)" : "rgba(255,238,238,0.04)");
      rollCtx.fillRect(LABEL_W, r * ROW_H, w - LABEL_W, ROW_H);
    }
    drawKeys(h);
    for (let s = 0; s <= totalSteps(); s++) {
      const x = LABEL_W + s * stepW + 0.5;
      rollCtx.strokeStyle = s % STEPS === 0 ? (light ? "rgba(80,10,12,0.6)" : "rgba(255,238,238,0.5)")
        : s % 4 === 0 ? (light ? "rgba(80,10,12,0.3)" : "rgba(255,238,238,0.2)")
        : (light ? "rgba(80,10,12,0.1)" : "rgba(255,238,238,0.07)");
      rollCtx.beginPath();
      rollCtx.moveTo(x, 0);
      rollCtx.lineTo(x, h);
      rollCtx.stroke();
    }
    S.notes.forEach((n) => {
      const r = rowOf(n.midi);
      if (r < 0 || r >= ROWS) return;
      const x = LABEL_W + n.start * stepW;
      const nw = Math.max(4, n.len * stepW - 1);
      rollCtx.fillStyle = "rgba(255," + Math.round(40 + 70 * (1 - n.vel)) + ",60,0.95)";
      rollCtx.fillRect(x, r * ROW_H + 1, nw, ROW_H - 2);
      rollCtx.strokeStyle = "rgba(0,0,0,0.5)";
      rollCtx.strokeRect(x + 0.5, r * ROW_H + 1.5, nw - 1, ROW_H - 3);
    });
    if (playing) {
      const x = LABEL_W + position() * stepW;
      rollCtx.fillStyle = ink;
      rollCtx.fillRect(x, 0, 2, h);
    }
    $("studio-roll-range").textContent = K.noteName(S.rollBase) + " – " + K.noteName(S.rollBase + ROWS - 1);
  }

  // The keyboard down the left side: white keys are tall bars, black keys sit on top, a little shorter.
  function drawKeys(h) {
    const half = ROW_H / 2;
    const whiteGrad = rollCtx.createLinearGradient(0, 0, LABEL_W, 0);
    whiteGrad.addColorStop(0, "#fbf6f4");
    whiteGrad.addColorStop(0.85, "#efe6e3");
    whiteGrad.addColorStop(1, "#cfc3c0");
    for (let r = 0; r < ROWS; r++) {
      const midi = midiOf(r);
      if (BLACK.includes(midi % 12)) continue;
      const top = r * ROW_H - (BLACK.includes((midi + 1) % 12) ? half : 0);
      const bottom = (r + 1) * ROW_H + (BLACK.includes((midi + 11) % 12) ? half : 0);
      rollCtx.fillStyle = whiteGrad;
      rollCtx.fillRect(0, Math.max(0, top), LABEL_W - 1, Math.min(h, bottom) - Math.max(0, top) - 1);
      rollCtx.fillStyle = "#8c7b78";
      rollCtx.fillRect(0, Math.min(h, bottom) - 1, LABEL_W - 1, 1);
      if (midi % 12 === 0) {
        rollCtx.fillStyle = "#7a1b22";
        rollCtx.font = "700 10px sans-serif";
        rollCtx.textBaseline = "middle";
        rollCtx.fillText(K.noteName(midi), LABEL_W - 27, r * ROW_H + ROW_H / 2);
      }
    }
    for (let r = 0; r < ROWS; r++) {
      const midi = midiOf(r);
      if (!BLACK.includes(midi % 12)) continue;
      const bw = LABEL_W * 0.62;
      const grad = rollCtx.createLinearGradient(0, 0, bw, 0);
      grad.addColorStop(0, "#2a1a1d");
      grad.addColorStop(0.8, "#0d0506");
      grad.addColorStop(1, "#000");
      rollCtx.fillStyle = grad;
      rollCtx.fillRect(0, r * ROW_H + 1, bw, ROW_H - 2);
      rollCtx.fillStyle = "rgba(255,255,255,0.14)";
      rollCtx.fillRect(0, r * ROW_H + 1, bw - 3, 1);
    }
    rollCtx.fillStyle = "#1b0b0e";
    rollCtx.fillRect(LABEL_W - 1, 0, 1, h);
  }

  function noteAt(midi, step) {
    for (let i = S.notes.length - 1; i >= 0; i--) {
      const n = S.notes[i];
      if (n.midi === midi && step >= n.start && step < n.start + n.len) return n;
    }
    return null;
  }

  function rollPoint(event) {
    const rect = roll.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const row = Math.max(0, Math.min(ROWS - 1, Math.floor(y / ROW_H)));
    return { x, row, midi: midiOf(row), step: (x - LABEL_W) / stepW };
  }

  function preview(midi) {
    const e = engine();
    playKey(e, midi, e.ctx.currentTime, 0.4, 0.8);
  }

  roll.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    const p = rollPoint(event);
    const n = noteAt(p.midi, Math.floor(p.step));
    if (n) {
      S.notes.splice(S.notes.indexOf(n), 1);
      dirty = true;
      save();
    }
  });

  roll.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const p = rollPoint(event);
    if (p.x < LABEL_W) { preview(p.midi); return; }
    const total = totalSteps();
    const cell = Math.max(0, Math.min(total - 1, Math.floor(p.step)));
    const snapped = Math.floor(cell / S.snap) * S.snap;
    const hit = noteAt(p.midi, cell);
    roll.setPointerCapture(event.pointerId);
    if (hit) {
      const edge = LABEL_W + (hit.start + hit.len) * stepW - p.x < 8;
      drag = { note: hit, mode: edge ? "resize" : "move", grab: p.step - hit.start };
    } else {
      const note = { midi: p.midi, start: snapped, len: Math.min(Math.max(lastLen, S.snap), total - snapped), vel: 0.8 };
      S.notes.push(note);
      preview(p.midi);
      drag = { note, mode: "new", grab: 0 };
    }
    dirty = true;
  });

  roll.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const p = rollPoint(event);
    const total = totalSteps();
    const n = drag.note;
    if (drag.mode === "move") {
      const start = Math.round((p.step - drag.grab) / S.snap) * S.snap;
      n.start = Math.max(0, Math.min(total - n.len, start));
      if (p.midi !== n.midi) { n.midi = p.midi; preview(p.midi); }
    } else {
      const end = Math.round(p.step / S.snap) * S.snap;
      n.len = Math.max(S.snap, Math.min(total - n.start, end - n.start));
    }
    dirty = true;
  });

  function endDrag() {
    if (!drag) return;
    lastLen = drag.note.len;
    drag = null;
    save();
  }
  roll.addEventListener("pointerup", endDrag);
  roll.addEventListener("pointercancel", endDrag);

  $("studio-snap").addEventListener("change", (event) => { S.snap = Number(event.target.value); save(); });
  $("studio-roll-up").addEventListener("click", () => rollShift(12));
  $("studio-roll-down").addEventListener("click", () => rollShift(-12));
  $("studio-roll-clear").addEventListener("click", () => { S.notes = []; dirty = true; save(); });

  function rollShift(delta) {
    S.rollBase = Math.max(24, Math.min(84, S.rollBase + delta));
    dirty = true;
    save();
  }

  // ---------- recording the keys ----------
  const held = new Map(); // midi -> { step, time }
  const board = K.createKeyboard($("main-keyboard-keys"), document.querySelector(".main-keyboard-case"));

  board.onNote((midi, isOn) => {
    if (!recording || !playing) return;
    const e = engine();
    if (isOn) {
      held.set(midi, { step: Math.round(position()) % totalSteps(), time: e.ctx.currentTime });
    } else if (held.has(midi)) {
      const h = held.get(midi);
      held.delete(midi);
      const len = Math.max(1, Math.round((e.ctx.currentTime - h.time) / stepLength()));
      S.notes.push({ midi, start: h.step, len: Math.min(len, totalSteps() - h.step), vel: 0.8 });
      dirty = true;
      save();
    }
  });

  // ---------- the mixer ----------
  const mixer = $("studio-mixer");

  function makeStrip(id, name, isMaster) {
    const strip = document.createElement("div");
    strip.className = "studio-mix-strip" + (isMaster ? " studio-mix-master" : "");
    const meter = document.createElement("div");
    meter.className = "studio-mix-meter";
    const fill = document.createElement("span");
    fill.className = "studio-mix-meter-fill";
    meter.appendChild(fill);
    const faderBox = document.createElement("div");
    faderBox.className = "studio-mix-fader-box";
    const fader = document.createElement("input");
    fader.type = "range";
    fader.min = 0;
    fader.max = 100;
    fader.className = "studio-mix-fader";
    fader.dataset.target = (isMaster ? "master" : "vol:" + id);
    fader.setAttribute("aria-label", name + " volume");
    fader.addEventListener("input", () => setVol(id, fader.value / 100));
    faderBox.appendChild(fader);
    const els = { fader, fill };
    strip.append(meter, faderBox);
    if (!isMaster) {
      const pan = document.createElement("input");
      pan.type = "range";
      pan.min = -100;
      pan.max = 100;
      pan.className = "studio-mix-pan";
      pan.dataset.target = "pan:" + id;
      pan.setAttribute("aria-label", name + " pan");
      pan.addEventListener("input", () => setPan(id, pan.value / 100));
      pan.addEventListener("dblclick", () => setPan(id, 0));
      const buttons = document.createElement("div");
      buttons.className = "studio-mix-buttons";
      const mute = document.createElement("button");
      mute.type = "button";
      mute.className = "studio-mix-mute";
      mute.textContent = "M";
      mute.dataset.target = "mute:" + id;
      mute.setAttribute("aria-label", "Mute " + name);
      mute.addEventListener("click", () => { if (!learning) toggleMute(id); });
      const solo = document.createElement("button");
      solo.type = "button";
      solo.className = "studio-mix-solo";
      solo.textContent = "S";
      solo.dataset.target = "solo:" + id;
      solo.setAttribute("aria-label", "Solo " + name);
      solo.addEventListener("click", () => { if (!learning) toggleSolo(id); });
      buttons.append(mute, solo);
      strip.append(pan, buttons);
      els.pan = pan;
      els.mute = mute;
      els.solo = solo;
    }
    const label = document.createElement("span");
    label.className = "studio-mix-name";
    label.textContent = name;
    strip.appendChild(label);
    mixer.appendChild(strip);
    mixerEls[id] = els;
  }

  CHANNELS.forEach((id) => makeStrip(id, NAME[id], false));
  makeStrip("master", "Master", true);

  const meterBuf = new Float32Array(512);
  const levels = {};
  function drawMeters() {
    if (!live) return;
    CHANNELS.concat(["master"]).forEach((id) => {
      const analyser = id === "master" ? live.masterAnalyser : live.ch[id].analyser;
      analyser.getFloatTimeDomainData(meterBuf);
      let peak = 0;
      for (let i = 0; i < meterBuf.length; i++) peak = Math.max(peak, Math.abs(meterBuf[i]));
      levels[id] = Math.max(peak, (levels[id] || 0) * 0.9);
      mixerEls[id].fill.style.width = Math.min(100, Math.sqrt(levels[id]) * 100) + "%";
    });
  }

  // ---------- tabs ----------
  let tab = "seq";
  function showTab(name) {
    tab = name;
    document.querySelectorAll(".studio-tab").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === name)));
    ["seq", "roll", "mix"].forEach((t) => { $("studio-panel-" + t).hidden = t !== name; });
    if (name === "roll") sizeRoll();
    dirty = true;
  }
  document.querySelectorAll(".studio-tab").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
  window.addEventListener("resize", () => { if (tab === "roll") sizeRoll(); });

  // ---------- export a WAV ----------
  function encodeWav(buffer) {
    const channels = buffer.numberOfChannels;
    const frames = buffer.length;
    const bytes = 44 + frames * channels * 2;
    const view = new DataView(new ArrayBuffer(bytes));
    const text = (offset, s) => { for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i)); };
    text(0, "RIFF");
    view.setUint32(4, bytes - 8, true);
    text(8, "WAVE");
    text(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, buffer.sampleRate, true);
    view.setUint32(28, buffer.sampleRate * channels * 2, true);
    view.setUint16(32, channels * 2, true);
    view.setUint16(34, 16, true);
    text(36, "data");
    view.setUint32(40, frames * channels * 2, true);
    const data = [];
    for (let c = 0; c < channels; c++) data.push(buffer.getChannelData(c));
    let offset = 44;
    for (let i = 0; i < frames; i++) {
      for (let c = 0; c < channels; c++) {
        const s = Math.max(-1, Math.min(1, data[c][i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        offset += 2;
      }
    }
    return new Blob([view], { type: "audio/wav" });
  }

  async function exportWav() {
    const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Offline) { exportNote.textContent = "This browser cannot render audio offline."; return; }
    exportButton.disabled = true;
    exportNote.textContent = "Rendering your loop…";
    try {
      const total = totalSteps();
      const repeats = Math.max(1, Math.round(4 / S.bars)); // the loop, played to fill four bars
      const sl = stepLength();
      const seconds = total * repeats * sl + 1.5;       // a tail so the last notes can ring out
      const rate = 44100;
      const ctx = new Offline(2, Math.ceil(seconds * rate), rate);
      const out = ctx.createDynamicsCompressor();      // the same glue the live output has
      out.threshold.value = -12;
      out.knee.value = 24;
      out.ratio.value = 3;
      out.attack.value = 0.01;
      out.release.value = 0.25;
      out.connect(ctx.destination);
      const e = buildEngine(ctx, out, false);
      for (let s = 0; s < total * repeats; s++) scheduleStepInto(e, s % total, 0.05 + s * sl, sl);
      const rendered = await ctx.startRendering();
      const blob = encodeWav(rendered);
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "tcsmusic-loop.wav";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 2000);
      exportNote.textContent = "Saved tcsmusic-loop.wav (" + (blob.size / 1048576).toFixed(1) + " MB, " + (seconds - 1.5).toFixed(1) + " seconds + tail).";
    } catch (error) {
      exportNote.textContent = "Could not export: " + error.message;
    }
    exportButton.disabled = false;
  }

  // ---------- the control targets: everything MIDI can drive ----------
  const targets = {};
  function target(id, label, group, kind, fn) { targets[id] = { id, label, group, kind, fn }; }

  const toggleRecord = () => { setRecording(!recording); if (recording && !playing) start(); };
  target("play", "Play / Stop", "Transport", "trig", () => (playing ? stop() : start()));
  target("stop", "Stop", "Transport", "trig", () => stop());
  target("record", "Record", "Transport", "trig", toggleRecord);
  target("tempo", "Tempo", "Transport", "cont", (v) => setBpm(60 + v * 120));
  target("loop", "Loop length (1/2/4 bars)", "Transport", "trig", () => setBars(S.bars === 1 ? 2 : S.bars === 2 ? 4 : S.bars === 4 ? 8 : S.bars === 8 ? 16 : 1));
  target("clear", "Clear all", "Transport", "trig", () => clearAll());
  target("octave-up", "Keyboard octave up", "Keys", "trig", () => board.shiftOctave(1));
  target("octave-down", "Keyboard octave down", "Keys", "trig", () => board.shiftOctave(-1));
  target("master", "Master volume", "Mixer", "cont", (v) => setVol("master", v));
  CHANNELS.forEach((id) => {
    target("vol:" + id, NAME[id] + " volume", "Mixer", "cont", (v) => setVol(id, v));
    target("pan:" + id, NAME[id] + " pan", "Mixer", "cont", (v) => setPan(id, v * 2 - 1));
    target("mute:" + id, NAME[id] + " mute", "Mixer", "trig", () => toggleMute(id));
    target("solo:" + id, NAME[id] + " solo", "Mixer", "trig", () => toggleSolo(id));
  });
  for (let i = 0; i < 16; i++) target("pad:" + i, "Pad " + (i + 1), "Pads", "trig", (v) => hitPad(i, v === undefined ? 0.85 : v));

  function drive(id, value) {
    const t = targets[id];
    if (!t) return;
    t.fn(value);
  }

  // ---------- MIDI: the SMK-37 Pro and friends ----------
  let map = {};     // control key ("cc:1:21") -> target id
  let learning = false;
  let learnTarget = null;
  const lastValue = {};
  const seen = new Map();
  const learnNote = $("studio-learn-note");
  const learnButton = $("studio-learn");
  const seenBox = $("studio-midi-seen");

  try {
    const saved = JSON.parse(localStorage.getItem(MAP_KEY) || "null");
    if (saved && typeof saved === "object") {
      Object.keys(saved).forEach((key) => { if (targets[saved[key]]) map[key] = saved[key]; });
    }
  } catch (error) { /* keep empty */ }
  const saveMap = () => { try { localStorage.setItem(MAP_KEY, JSON.stringify(map)); } catch (error) { /* fine */ } };

  const CC_NAMES = { 1: "Mod wheel", 7: "Volume", 10: "Pan", 11: "Expression", 64: "Sustain pedal", 74: "Brightness" };
  function describe(m) {
    if (m.type === "cc") return (CC_NAMES[m.a] ? CC_NAMES[m.a] + " · " : "") + "CC " + m.a + " · ch " + m.ch;
    if (m.type === "noteon" || m.type === "noteoff") return "Note " + m.a + " (" + K.noteName(m.a) + ") · ch " + m.ch;
    if (m.type === "bend") return "Pitch wheel · ch " + m.ch;
    if (m.type === "pressure") return "Pressure · ch " + m.ch;
    if (m.type === "poly") return "Key pressure " + m.a + " · ch " + m.ch;
    return "Program " + m.a + " · ch " + m.ch;
  }

  function targetSelect(key) {
    const select = document.createElement("select");
    select.className = "main-midi-control-assign";
    select.setAttribute("aria-label", "What " + key + " controls");
    const none = document.createElement("option");
    none.value = "";
    none.textContent = "Nothing";
    select.appendChild(none);
    const groups = {};
    Object.keys(targets).forEach((id) => {
      const t = targets[id];
      if (!groups[t.group]) {
        groups[t.group] = document.createElement("optgroup");
        groups[t.group].label = t.group;
        select.appendChild(groups[t.group]);
      }
      const o = document.createElement("option");
      o.value = id;
      o.textContent = t.label;
      groups[t.group].appendChild(o);
    });
    select.value = map[key] || "";
    select.addEventListener("change", () => bind(key, select.value));
    return select;
  }

  function bind(key, id) {
    Object.keys(map).forEach((k) => { if (id && map[k] === id && k !== key) delete map[k]; });
    if (id) map[key] = id; else delete map[key];
    seen.forEach((row, k) => { row.select.value = map[k] || ""; });
    saveMap();
  }

  function showSeen(m) {
    if (m.type === "poly" || m.type === "program") return;
    const isNote = m.type === "noteon" || m.type === "noteoff";
    if (isNote && m.ch !== 10 && !map[m.key]) return; // the keys themselves would flood the list
    let row = seen.get(m.key);
    if (!row) {
      const empty = seenBox.querySelector(".studio-midi-empty");
      if (empty) empty.remove();
      const el = document.createElement("div");
      el.className = "main-midi-control-row";
      const label = document.createElement("span");
      label.className = "main-midi-control-label";
      label.textContent = describe(m);
      const meter = document.createElement("div");
      meter.className = "main-midi-control-meter";
      const fill = document.createElement("span");
      fill.className = "main-midi-control-fill";
      meter.appendChild(fill);
      const select = targetSelect(m.key);
      el.append(label, meter, select);
      seenBox.appendChild(el);
      row = { el, fill, select };
      seen.set(m.key, row);
    }
    row.fill.style.width = (m.type === "noteoff" ? 0 : m.value * 100) + "%";
  }

  function setLearning(on) {
    learning = on;
    learnTarget = null;
    learnButton.setAttribute("aria-pressed", String(on));
    learnButton.textContent = on ? "🎯 Learn: on" : "🎯 Learn: off";
    learnNote.textContent = on ? "Click any control on this page: a slider, pad, button or fader." : "";
    document.querySelectorAll(".is-learning").forEach((el) => el.classList.remove("is-learning"));
    document.body.classList.toggle("studio-learning", on);
  }

  learnButton.addEventListener("click", () => setLearning(!learning));
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && learning) setLearning(false); });
  $("studio-midi-reset").addEventListener("click", () => {
    map = {};
    saveMap();
    seen.forEach((row) => { row.select.value = ""; });
  });

  // in learn mode a click picks a control instead of using it
  document.addEventListener("pointerdown", (event) => {
    if (!learning) return;
    const el = event.target.closest("[data-target]");
    if (!el) return;
    event.preventDefault();
    event.stopPropagation();
    document.querySelectorAll(".is-learning").forEach((x) => x.classList.remove("is-learning"));
    el.classList.add("is-learning");
    learnTarget = el.dataset.target;
    learnNote.textContent = "Now move or press the control on your keyboard to link it to “" + (targets[learnTarget] ? targets[learnTarget].label : learnTarget) + "”.";
  }, true);
  document.addEventListener("click", (event) => {
    if (learning && event.target.closest("[data-target]")) { event.preventDefault(); event.stopPropagation(); }
  }, true);

  const modFill = $("studio-mod-fill");
  const pitchDot = $("studio-pitch-dot");
  const lastOut = $("studio-midi-last");

  function onMidi(m) {
    lastOut.textContent = describe(m) + " · " + (m.type === "bend" ? Math.round((m.norm || 0) * 100) + "%" : m.type === "noteon" || m.type === "noteoff" ? (m.type === "noteon" ? "on " + m.b : "off") : m.b);
    showSeen(m);

    // Learn: the next real control that moves gets linked
    if (learning && learnTarget && ["noteon", "cc", "pressure", "bend"].includes(m.type)) {
      if (m.type === "cc" && m.value === lastValue[m.key]) return;
      bind(m.key, learnTarget);
      if (!seen.has(m.key)) showSeen({ ...m, ch: 10 });
      learnNote.textContent = "Linked " + describe(m) + " → " + targets[learnTarget].label + ". Click another control to keep going.";
      document.querySelectorAll(".is-learning").forEach((el) => el.classList.remove("is-learning"));
      learnTarget = null;
      lastValue[m.key] = m.value;
      return;
    }

    const id = map[m.key];
    const prev = lastValue[m.key] === undefined ? 0 : lastValue[m.key];
    lastValue[m.key] = m.value;
    if (id) {
      const t = targets[id];
      if (m.type === "noteoff") return;
      if (t.kind === "cont") t.fn(m.value);
      else if (m.type === "noteon" || m.type === "pressure") { if (m.type === "noteon" || prev < 0.5) t.fn(m.value); }
      else if (m.value >= 0.5 && prev < 0.5) t.fn(1);
      return;
    }

    // the default wiring
    if (m.type === "noteon" && m.ch === 10) {
      drive("pad:" + (m.a >= 36 && m.a <= 51 ? m.a - 36 : m.a % 16), m.value);
    } else if (m.type === "noteon") {
      board.down(m.a, 0.03 + 0.17 * m.value);
    } else if (m.type === "noteoff") {
      if (m.ch !== 10) board.up(m.a);
    } else if (m.type === "bend") {
      K.setPitchBend(m.norm);
      pitchDot.style.left = m.value * 100 + "%";
    } else if (m.type === "cc") {
      if (m.a === 64) K.setMidiPedal(m.b < 32 ? 0 : m.b < 96 ? 0.5 : 1);
      else if (m.a === 1) { K.setVibrato(m.value); modFill.style.width = m.value * 100 + "%"; }
      else if (m.a === 7) setVol("master", m.value);
      else if (m.a === 74) K.setTone(m.value);
      else if (m.a === 123 || m.a === 120) { for (let n = 21; n <= 108; n++) board.up(n); }
    }
  }
  Hub.on(onMidi);

  const midiButton = $("studio-midi-connect");
  const midiStatus = $("studio-midi-status");
  Hub.onState((s) => {
    midiButton.setAttribute("aria-pressed", String(s.connected));
    midiButton.textContent = s.connected ? "🎹 Disconnect MIDI" : "🎹 Connect MIDI";
    midiStatus.textContent = s.message || (s.connected
      ? (s.devices.length ? "Connected: " + s.devices.join(", ") : "No MIDI keyboard found. Plug one in.")
      : "Not connected");
    if (!s.connected) {
      K.setPitchBend(0);
      K.setVibrato(0);
      K.setTone(1);
      K.setMidiPedal(0);
      pitchDot.style.left = "50%";
      modFill.style.width = "0%";
      for (let n = 21; n <= 108; n++) board.up(n);
    }
  });
  midiButton.addEventListener("click", () => {
    midiStatus.textContent = "Waiting for permission…";
    Hub.toggle();
  });

  // ---------- buttons ----------
  function clearAll() {
    TRACK_IDS.forEach((id) => S.pattern[id].fill(false));
    S.notes = [];
    paint();
    dirty = true;
    save();
  }

  grid.addEventListener("click", (event) => {
    if (learning) return;
    const stepButton = event.target.closest(".studio-grid-step");
    if (stepButton) {
      const id = stepButton.dataset.track;
      const step = Number(stepButton.dataset.step);
      S.pattern[id][step] = !S.pattern[id][step];
      if (S.pattern[id][step] && !playing) {
        const e = engine();
        hitDrum(e, id, e.ctx.currentTime, 1);
      }
      paint();
      save();
      return;
    }
    const muteButton = event.target.closest(".studio-grid-mute");
    if (muteButton) toggleMute(muteButton.dataset.track);
  });

  playButton.addEventListener("click", () => { if (!learning) (playing ? stop() : start()); });
  stopButton.addEventListener("click", () => { if (!learning) stop(); });
  recordButton.addEventListener("click", () => { if (!learning) toggleRecord(); });
  bpmInput.addEventListener("input", () => { bpmValue.textContent = bpmInput.value; save(); });
  barsSelect.addEventListener("change", () => setBars(Number(barsSelect.value)));
  clearButton.addEventListener("click", clearAll);
  exportButton.addEventListener("click", exportWav);

  presetSelect.addEventListener("change", () => {
    const preset = PRESETS[presetSelect.value];
    if (!preset) return;
    TRACK_IDS.forEach((id) => {
      const row = preset[id] || "";
      for (let i = 0; i < STEPS; i++) S.pattern[id][i] = row.charAt(i) === "x";
    });
    presetSelect.value = "";
    paint();
    save();
  });

  // a hidden tab slows timers down, which would make the beat stumble
  document.addEventListener("visibilitychange", () => { if (document.hidden && playing) stop(); });

  // ---------- one animation loop for everything that moves ----------
  function frame() {
    if (playing) {
      const e = engine();
      while (queue.length && queue[0].time <= e.ctx.currentTime) {
        const s = queue.shift();
        curStep = s.step;
        curTime = s.time;
        showStep(s.step);
      }
    }
    if (tab === "roll" && (dirty || playing)) { drawRoll(); dirty = false; }
    if (tab === "mix") drawMeters();
    frameId = requestAnimationFrame(frame);
  }

  load();
  padEls.forEach((p, i) => { p.select.value = S.pads[i]; });
  bpmValue.textContent = bpmInput.value;
  barsSelect.value = String(S.bars);
  $("studio-snap").value = String(S.snap);
  paint();
  CHANNELS.forEach(syncMixerUi);
  syncMixerUi("master");
  sizeRoll();
  frameId = requestAnimationFrame(frame);

  // tests drive the page through this
  window.StudioDebug = { S, targets, drive, getMap: () => map, position, get playing() { return playing; } };
})();
