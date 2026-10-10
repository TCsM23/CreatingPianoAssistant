window.PianoKit = (function () {
  "use strict";

  const BLACK_PCS = [1, 3, 6, 8, 10];

  // ---------- sound: one master bus for everything ----------
  let audioCtx = null;
  let compressor = null;
  let master = null;
  const keyboards = [];
  let mainBoard = null; // the big keyboard on the page (not the floating copy)

  function getCtx() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtx.addEventListener("statechange", syncTransport);
      syncTransport();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function getBus() {
    const ctx = getCtx();
    if (!compressor) {
      compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 12;
      compressor.ratio.value = 6;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;
      compressor.connect(ctx.destination);
    }
    if (!master) {
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(compressor);
    }
    return master;
  }

  function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  // Low notes are quieter to our ears and high notes are sharper,
  // so tilt the volume by register and give low notes extra upper harmonics.
  function registerGain(midi) {
    const gain = Math.pow(2, (-0.8 * (midi - 60)) / 12);
    return Math.min(2.6, Math.max(0.35, gain));
  }
  // ---------- instruments ----------
  // partials: [wave, multiple of the pitch, level]. life: how long a ringing note lasts (seconds).
  // sustain: set it and the note holds at that level while the key is down (organ, synth).
  const INSTRUMENTS = {
    piano:    { name: "Grand Piano", partials: [["triangle", 1, 1], ["sine", 1, 1], ["sine", 2, 0.15], ["sine", 3, 0.08]], lowBoost: true, attack: 0.02, life: 99, trim: 1 },
    epiano:   { name: "Electric Piano", partials: [["sine", 1, 1], ["sine", 2, 0.3], ["sine", 4, 0.1], ["sine", 7, 0.04]], attack: 0.01, life: 4, trim: 1.6 },
    organ:    { name: "Organ", partials: [["sine", 0.5, 0.5], ["sine", 1, 1], ["sine", 2, 0.7], ["sine", 3, 0.35], ["sine", 4, 0.25]], attack: 0.015, sustain: 1, trim: 0.4 },
    synth:    { name: "Synthesizer", partials: [["sawtooth", 1, 0.5], ["sawtooth", 1.006, 0.5], ["square", 0.5, 0.3]], attack: 0.04, sustain: 0.7, cutoff: 2400, trim: 1.2 },
    harpsichord: { name: "Harpsichord", partials: [["sawtooth", 1, 0.45], ["square", 2, 0.2], ["triangle", 4, 0.15]], attack: 0.004, life: 1.3, cutoff: 5000, trim: 8 },
    musicbox: { name: "Music Box", partials: [["sine", 1, 1], ["sine", 2.76, 0.28], ["sine", 5.4, 0.1]], octave: 2, attack: 0.003, life: 2.2, trim: 1.3 },
  };
  let instrument = "piano";

  function setInstrument(name) {
    if (INSTRUMENTS[name]) instrument = name;
  }

  const instrumentSelect = document.getElementById("main-keyboard-instrument");
  if (instrumentSelect) {
    instrumentSelect.addEventListener("change", () => setInstrument(instrumentSelect.value));
  }

  function playNote(midi, duration = 1.8, when = 0, volume = 0.12) {
    const ctx = getCtx();
    const bus = getBus();
    const inst = INSTRUMENTS[instrument];
    const start = ctx.currentTime + when;
    const peak = volume * registerGain(midi) * inst.trim;
    const freq = midiToFreq(midi) * (inst.octave || 1);
    const low = inst.lowBoost ? Math.min(1, Math.max(0, (60 - midi) / 24)) : 0;
    const end = start + duration;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + inst.attack);
    if (inst.sustain) {
      // hold while the key is down, then fade at the very end
      const level = peak * inst.sustain;
      const settle = Math.min(start + inst.attack + 0.3, start + duration * 0.5);
      gain.gain.exponentialRampToValueAtTime(level, Math.max(settle, start + inst.attack + 0.01));
      gain.gain.setValueAtTime(level, Math.max(settle, end - 0.12));
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
    } else {
      gain.gain.exponentialRampToValueAtTime(0.0001, start + Math.min(duration, inst.life));
    }

    // the damper: stays wide open until we lower it (that is how a key lets go)
    const damper = ctx.createGain();
    gain.connect(damper);
    damper.connect(bus);

    let sink = gain;
    if (inst.cutoff) {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = inst.cutoff;
      filter.connect(gain);
      sink = filter;
    }

    const oscs = [];
    inst.partials.forEach(([type, multiple, level], index) => {
      let amount = level;
      if (index === 2) amount += 0.54 * low; // low piano notes get extra upper harmonics
      if (index === 3) amount += 0.4 * low;
      const osc = ctx.createOscillator();
      const part = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq * multiple;
      part.gain.value = amount;
      osc.connect(part);
      part.connect(sink);
      osc.start(start);
      osc.stop(end + 0.05);
      oscs.push(osc);
    });
    return { damper, oscs, end: end + 0.05, tau: null };
  }

  // ---------- sustain pedal ----------
  // Off damps a released key fast. Half lets it ring on, fading. Full lets it ring until the pedal lifts.
  const DAMP_TAU = { off: 0.08, half: 0.7 };
  const sounding = new Set(); // voices whose key is up but are still ringing
  let pedalLatched = 0; // set by the on-screen buttons: 0, 0.5 or 1
  let pedalKey = 0; // set by Space (1) or Shift (0.5) while held
  let pedalMidi = 0; // set by a MIDI keyboard's sustain pedal (CC 64)
  let pedalLevel = 0;

  function damp(voice, tau, delay = 0) {
    const now = audioCtx.currentTime;
    voice.tau = tau;
    voice.damper.gain.setTargetAtTime(0, now + delay, tau);
    const stopAt = Math.min(voice.end, now + delay + tau * 8 + 0.05);
    voice.oscs.forEach((osc) => {
      try { osc.stop(stopAt); } catch (e) { /* already stopped */ }
    });
  }

  // a key came up: let go according to the pedal
  function releaseVoice(voice, delay = 0) {
    if (!audioCtx) return;
    if (pedalLevel >= 1) {
      sounding.add(voice);
    } else if (pedalLevel > 0) {
      damp(voice, DAMP_TAU.half, delay);
      sounding.add(voice);
    } else {
      damp(voice, DAMP_TAU.off, delay);
    }
  }

  function setPedal(level) {
    const lower = level < pedalLevel;
    pedalLevel = level;
    if (lower && audioCtx) {
      sounding.forEach((voice) => {
        if (voice.end < audioCtx.currentTime) sounding.delete(voice);
        else if (level === 0) {
          damp(voice, DAMP_TAU.off);
          sounding.delete(voice);
        } else damp(voice, DAMP_TAU.half);
      });
    }
    drawPedal();
  }

  function refreshPedal() {
    setPedal(Math.max(pedalLatched, pedalKey, pedalMidi));
  }

  function drawPedal() {
    document.querySelectorAll("[data-pedal]").forEach((button) => {
      button.setAttribute("aria-pressed", String(Number(button.dataset.pedal) === pedalLevel));
    });
  }

  document.querySelectorAll("[data-pedal]").forEach((button) => {
    button.addEventListener("click", () => {
      pedalLatched = Number(button.dataset.pedal);
      refreshPedal();
      button.blur();
    });
  });

  function pedalFromKey(event) {
    const tag = event.target.tagName;
    if (["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(tag)) return;
    if (event.code === "Space") {
      pedalKey = event.type === "keydown" ? 1 : pedalKey === 1 ? 0 : pedalKey;
      event.preventDefault();
    } else if (event.key === "Shift") {
      pedalKey = event.type === "keydown" ? (pedalKey === 1 ? 1 : 0.5) : pedalKey === 0.5 ? 0 : pedalKey;
    } else return;
    refreshPedal();
  }
  document.addEventListener("keydown", pedalFromKey);
  document.addEventListener("keyup", pedalFromKey);
  window.addEventListener("blur", () => {
    pedalKey = 0;
    refreshPedal();
  });
  drawPedal();

  function playChord(midiList, volume = 0.12) {
    stopAll();
    midiList.forEach((midi) => playNote(midi, 1.8, 0, volume));
  }

  // Silence everything that is sounding or queued, and stop every keyboard's schedule.
  function stopAll() {
    keyboards.forEach((board) => board.cancel());
    sounding.clear();
    if (master) {
      const old = master;
      old.gain.cancelScheduledValues(audioCtx.currentTime);
      old.gain.setTargetAtTime(0, audioCtx.currentTime, 0.015);
      setTimeout(() => old.disconnect(), 200);
      master = null;
    }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  }

  // ---------- pause / stop buttons ----------
  function syncTransport() {
    const pause = document.getElementById("main-transport-pause");
    if (!pause) return;
    pause.disabled = !audioCtx;
    const paused = audioCtx && audioCtx.state === "suspended";
    pause.textContent = paused ? "▶ Resume" : "❚❚ Pause";
  }

  function togglePause() {
    if (!audioCtx) return;
    if (audioCtx.state === "running") audioCtx.suspend();
    else audioCtx.resume();
  }

  const pauseButton = document.getElementById("main-transport-pause");
  const stopButton = document.getElementById("main-transport-stop");
  if (pauseButton) pauseButton.addEventListener("click", togglePause);
  if (stopButton) {
    stopButton.addEventListener("click", () => {
      stopAll();
      keyboards.forEach((board) => board.light([]));
    });
  }
  syncTransport();

  // ---------- talking to Django ----------
  async function api(url, params) {
    const response = await fetch(url + "?" + new URLSearchParams(params).toString());
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Something went wrong");
    return data;
  }

  // ---------- keyboard ----------
  function createKeyboard(keysEl, caseEl, low = 48, high = 84, options = {}) {
    const mini = options.mini === true; // the small floating copy
    let dock = null;
    const keyByMidi = {};
    const leftOf = {};
    let whiteCount = 0;
    let timer = null;
    let keyHandler = null;

    // ---------- pressing and gliding ----------
    // Press a key and it sounds until you let go. Keep the button down and slide
    // across the keys and each one you cross sounds in turn: a glissando.
    const HOLD_MIN = 0.3; // a very quick tap still rings this long (seconds)
    const LOOKAHEAD = 3; // seconds of a scheduled song that are queued in advance
    let noteHandler = null; // the recorder listens here
    const touches = new Map(); // pointerId -> { midi, voice, at }

    function keyAt(x, y) {
      const el = document.elementFromPoint(x, y);
      return el && keysEl.contains(el) && el.dataset.midi ? Number(el.dataset.midi) : null;
    }

    function press(id, midi, volume) {
      if (audioCtx && audioCtx.state === "suspended") stopAll();
      const voice = playNote(midi, 9, 0, volume);
      touches.set(id, { midi, voice, at: audioCtx.currentTime });
      if (keyByMidi[midi]) keyByMidi[midi].classList.add("is-down");
      document.dispatchEvent(new CustomEvent("pianokit:play"));
      if (noteHandler) noteHandler(midi, true, volume);
    }

    function lift(id) {
      const held = touches.get(id);
      if (!held) return;
      touches.delete(id);
      const stillDown = [...touches.values()].some((other) => other.midi === held.midi);
      if (!stillDown && keyByMidi[held.midi]) keyByMidi[held.midi].classList.remove("is-down");
      releaseVoice(held.voice, Math.max(0, held.at + HOLD_MIN - audioCtx.currentTime));
      if (noteHandler) noteHandler(held.midi, false);
    }

    keysEl.addEventListener("pointerdown", (event) => {
      if (event.button > 0) return;
      const midi = keyAt(event.clientX, event.clientY);
      if (midi === null) return;
      keysEl.setPointerCapture(event.pointerId);
      keyByMidi[midi].classList.remove("is-lit"); // pressing a highlighted key un-highlights it
      press(event.pointerId, midi);
      if (keyHandler) keyHandler(midi);
    });

    keysEl.addEventListener("pointermove", (event) => {
      const held = touches.get(event.pointerId);
      if (!held || keyHandler) return; // no gliding while picking notes
      const midi = keyAt(event.clientX, event.clientY);
      if (midi === null || midi === held.midi) return;
      lift(event.pointerId);
      press(event.pointerId, midi);
    });

    ["pointerup", "pointercancel"].forEach((name) => {
      keysEl.addEventListener(name, (event) => lift(event.pointerId));
    });

    function build() {
      for (let midi = low; midi <= high; midi++) {
        const key = document.createElement("div");
        key.dataset.midi = midi;
        if (BLACK_PCS.includes(midi % 12)) {
          key.className = "main-keyboard-key main-keyboard-key-black";
        } else {
          key.className = "main-keyboard-key main-keyboard-key-white";
          whiteCount += 1;
        }
        keysEl.appendChild(key);
        keyByMidi[midi] = key;
      }
    }

    // Size the keys to fill the case (between 34px and 64px per white key).
    let lastRoom = -1;
    function layout() {
      const style = getComputedStyle(caseEl);
      const room = caseEl.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      if (room === lastRoom) return;
      lastRoom = room;
      const white = Math.max(mini ? 12 : 34, Math.min(mini ? 26 : 64, Math.floor(room / whiteCount)));
      const black = Math.round(white * 0.62);
      keysEl.style.setProperty("--white-w", white + "px");
      keysEl.style.setProperty("--black-w", black + "px");
      keysEl.style.setProperty("--white-h", Math.round(white * (mini ? 3.4 : 4.2)) + "px");
      keysEl.style.setProperty("--black-h", Math.round(white * (mini ? 2 : 2.6)) + "px");
      keysEl.style.width = white * whiteCount + "px";

      let whitesBefore = 0;
      for (let midi = low; midi <= high; midi++) {
        if (BLACK_PCS.includes(midi % 12)) {
          leftOf[midi] = whitesBefore * white - black / 2;
        } else {
          leftOf[midi] = whitesBefore * white;
          whitesBefore += 1;
        }
        keyByMidi[midi].style.left = leftOf[midi] + "px";
      }
    }

    function centerOn(midi) {
      if (leftOf[midi] === undefined) return;
      caseEl.scrollTo({ left: leftOf[midi] - caseEl.clientWidth / 2, behavior: "smooth" });
    }

    // paint only changes which keys are lit; light also scrolls, glows the backdrop and feeds the dock
    function paint(midiList) {
      Object.values(keyByMidi).forEach((key) => key.classList.remove("is-lit"));
      midiList.forEach((midi) => {
        if (keyByMidi[midi]) keyByMidi[midi].classList.add("is-lit");
      });
    }

    function light(midiList) {
      paint(midiList);
      if (midiList.length) centerOn(midiList[0]);
      if (midiList.length) document.dispatchEvent(new CustomEvent("pianokit:play"));
      if (dock) dock.follow(midiList);
    } 

    // Pick mode: onKey(fn) sends every key click to fn(midi); onKey(null) turns it off.
    function onKey(fn) {
      keyHandler = fn;
      caseEl.classList.toggle("is-picking", Boolean(fn));
    }

    // Mark the keys the user has picked (a separate look from the lit keys).
    function mark(midiList) {
      Object.keys(keyByMidi).forEach((midi) => {
        keyByMidi[midi].classList.toggle("is-picked", midiList.includes(Number(midi)));
      });
    }

    function cancel() {
      clearInterval(timer);
      timer = null;
    }

    // events: [{ t: seconds from now, midi: [numbers], dur: seconds }]
    // Lights follow the audio clock, so Pause freezes the keys together with the sound.
    function schedule(events) {
      stopAll();
      const ctx = getCtx();
      const origin = ctx.currentTime + 0.05;
      const queue = events.slice().sort((a, b) => a.t - b.t);
      const end = queue.reduce((latest, ev) => Math.max(latest, ev.t + ev.dur), 0) + 0.3;
      let next = 0;
      let planned = 0;

      // sound is queued only a few seconds ahead, so a long song never loads every note at once
      function plan(now) {
        while (planned < queue.length && queue[planned].t <= now + LOOKAHEAD) {
          const ev = queue[planned];
          ev.midi.forEach((m) => playNote(m, ev.dur, Math.max(0, origin - ctx.currentTime + ev.t), ev.volume));
          planned += 1;
        }
      }
      plan(0);

      timer = setInterval(() => {
        const now = ctx.currentTime - origin;
        plan(now);
        while (next < queue.length && now >= queue[next].t) {
          const ev = queue[next];
          if (ev.show !== false) light(ev.show || ev.midi); // show: which keys to light, or false for none
          next += 1;
        }
        if (now >= end) {
          cancel();
          light([]);
        }
      }, 25);
    }

    build();
    layout();
    if (window.ResizeObserver) new ResizeObserver(layout).observe(caseEl);
    else window.addEventListener("resize", layout);
    centerOn(60);

    // MIDI keyboards: a note on or off, the same as pressing and lifting a key with the mouse
    function down(midi, volume) {
      const id = "midi-" + midi;
      if (touches.has(id)) lift(id);
      if (keyByMidi[midi]) keyByMidi[midi].classList.remove("is-lit");
      press(id, midi, volume);
      if (keyHandler) keyHandler(midi);
    }

    function up(midi) {
      lift("midi-" + midi);
    }

    // onNote(fn): fn(midi, isOn, volume) for every key pressed or lifted, by mouse, touch or MIDI
    function onNote(fn) {
      noteHandler = fn;
    }

    const board = { light, paint, centerOn, schedule, cancel, onKey, mark, down, up, onNote };

    // ---------- the floating piano ----------
    // When this keyboard is scrolled out of view and something plays, a small copy
    // slides up from the bottom of the screen and lights the same keys.
    function makeDock() {
      const el = document.createElement("div");
      el.className = "main-dock";
      el.setAttribute("role", "group");
      el.setAttribute("aria-label", "Keys being played");
      el.innerHTML =
        '<div class="main-dock-case"><div class="main-dock-keys main-keyboard-keys"></div></div>' +
        '<button type="button" class="main-dock-stop">\u25A0 Stop</button>';
      document.body.appendChild(el);
      const copy = createKeyboard(el.querySelector(".main-dock-keys"), el.querySelector(".main-dock-case"), low, high, { mini: true });

      let visible = true;
      let hideTimer = null;
      function open() {
        clearTimeout(hideTimer);
        el.classList.add("is-open");
      }
      function close() {
        clearTimeout(hideTimer);
        el.classList.remove("is-open");
      }

      if (window.IntersectionObserver) {
        new IntersectionObserver(
          ([entry]) => {
            visible = entry.intersectionRatio > 0.25;
            if (visible) close();
          },
          { threshold: [0, 0.25, 0.5] }
        ).observe(caseEl);
      }

      el.querySelector(".main-dock-stop").addEventListener("click", () => {
        stopAll();
        keyboards.forEach((each) => each.light([]));
        close();
      });

      return {
        follow(midiList) {
          copy.paint(midiList);
          if (midiList.length) {
            if (!visible) open();
          } else {
            clearTimeout(hideTimer);
            hideTimer = setTimeout(close, 1500); // linger a moment after the last note
          }
        },
      };
    }

    if (!mini) dock = makeDock();
    const clearButton = document.getElementById("main-transport-clear");
    if (clearButton) clearButton.addEventListener("click", () => light([]));
    keyboards.push(board);
    if (!mini) mainBoard = board;
    return board;
  }

  function setMidiPedal(level) {
    pedalMidi = level;
    refreshPedal();
  }

  function getBoard() {
    return mainBoard;
  }

  return { playNote, playChord, stopAll, api, createKeyboard, getCtx, setInstrument, setMidiPedal, getBoard };
})();