(function () {
  "use strict";

  const LOWEST = 48;    // C3
  const HIGHEST = 84;   // C6
  const BLACK_PCS = [1, 3, 6, 8, 10];   // C#, D#, F#, G#, A#
  const WHITE_WIDTH = 44;
  const BLACK_WIDTH = 28;

  const keysEl = document.getElementById("main-keyboard-keys");
  const rootEl = document.getElementById("main-chord-root");
  const qualityEl = document.getElementById("main-chord-quality");
  const resultEl = document.getElementById("main-chord-result");
  const apiUrl = JSON.parse(document.getElementById("main-api-url").textContent);
  const caseEl = document.querySelector(".main-keyboard-case");

	let currentMidi = [];

  const keyByMidi = {};

  function isBlack(midi) {
    return BLACK_PCS.includes(midi % 12);
  }

  function centerOn(midi) {
    const key = keyByMidi[midi];
    if (!key) return;
    const keyLeft = parseFloat(key.style.left);
    const target = keyLeft - caseEl.clientWidth / 2;
    caseEl.scrollTo({ left: target, behavior: "smooth" });
  }

    // ---------- sound ----------
  let audioCtx = null;

  function getCtx() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function playNote(midi, duration = 1.8, when = 0) {
    const ctx = getCtx();
    const start = ctx.currentTime + when;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.12, start + 0.02);       // quick attack
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration); // slow fade
    gain.connect(ctx.destination);

    ["triangle", "sine"].forEach((type) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = midiToFreq(midi);
      osc.connect(gain);
      osc.start(start);
      osc.stop(start + duration + 0.05);
    });
  }

  function playChord(midiList) {
    midiList.forEach((midi) => playNote(midi));
  }

	let timers = [];

  function schedule(events) {
    timers.forEach(clearTimeout);
    timers = [];
    events.forEach((ev) => {
      ev.midi.forEach((m) => playNote(m, ev.dur, ev.t));
      timers.push(setTimeout(() => light(ev.midi), ev.t * 1000));
    });
  }

  function buildKeyboard() {
    let whitesBefore = 0;
    for (let midi = LOWEST; midi <= HIGHEST; midi++) {
      const key = document.createElement("div");
      key.dataset.midi = midi;
      if (isBlack(midi)) {
        key.className = "main-keyboard-key main-keyboard-key-black";
        key.style.left = (whitesBefore * WHITE_WIDTH - BLACK_WIDTH / 2) + "px";
      } else {
        key.className = "main-keyboard-key main-keyboard-key-white";
        key.style.left = (whitesBefore * WHITE_WIDTH) + "px";
        whitesBefore += 1;
      }
      key.addEventListener("click", () => playNote(midi, 1.2));
      keysEl.appendChild(key);
      keyByMidi[midi] = key;
    }
    keysEl.style.width = (whitesBefore * WHITE_WIDTH) + "px";
  }

  function light(midiList) {
    Object.values(keyByMidi).forEach((key) => key.classList.remove("is-lit"));
    midiList.forEach((midi) => {
      if (keyByMidi[midi]) keyByMidi[midi].classList.add("is-lit");
    });
    if (midiList.length) centerOn(midiList[0]);
  }

  async function findChord() {
    const params = new URLSearchParams({
      root: rootEl.value,
      quality: qualityEl.value,
    });
    const response = await fetch(apiUrl + "?" + params.toString());
    const data = await response.json();
    if (!response.ok) {
      resultEl.textContent = data.error;
      light([]);
      return;
    }
    resultEl.textContent = data.label + ": " + data.notes.join("  ");
    currentMidi = data.midi;
    light(currentMidi);
    playChord(currentMidi);
  }

	const scaleUrl = JSON.parse(document.getElementById("main-api-scale").textContent);
  const progressionUrl = JSON.parse(document.getElementById("main-api-progression").textContent);

  async function playScale() {
    const params = new URLSearchParams({
      root: document.getElementById("main-scale-root").value,
      scale: document.getElementById("main-scale-type").value,
    });
    const response = await fetch(scaleUrl + "?" + params.toString());
    const data = await response.json();
    const out = document.getElementById("main-scale-result");
    if (!response.ok) { out.textContent = data.error; return; }
    out.textContent = data.name + ": " + data.notes.join("  ");
    schedule(data.midi.map((m, i) => ({ midi: [m], t: i * 0.4, dur: 0.7 })));
  }

  async function playProgression() {
    const params = new URLSearchParams({
      key: document.getElementById("main-progression-key").value,
      numerals: document.getElementById("main-progression-input").value,
    });
    const response = await fetch(progressionUrl + "?" + params.toString());
    const data = await response.json();
    const out = document.getElementById("main-progression-result");
    if (!response.ok) { out.textContent = data.error; return; }
    out.textContent = data.chords.map((c) => c.numeral + " = " + c.name).join("    ");
    schedule(data.chords.map((c, i) => ({ midi: c.midi, t: i * 1.4, dur: 1.6 })));
  }

  document.getElementById("main-chord-find").addEventListener("click", findChord);
  document.getElementById("main-chord-play").addEventListener("click", () => {
  	if (currentMidi.length) playChord(currentMidi);
  });
	document.getElementById("main-scale-play").addEventListener("click", playScale);
  document.getElementById("main-progression-play").addEventListener("click", playProgression);
	buildKeyboard();
  centerOn(60);  
})();