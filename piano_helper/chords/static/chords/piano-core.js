window.PianoKit = (function () {
  "use strict";

  const BLACK_PCS = [1, 3, 6, 8, 10];
  const WHITE_WIDTH = 44;
  const BLACK_WIDTH = 28;

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

  function playNote(midi, duration = 1.8, when = 0, volume = 0.12) {
    const ctx = getCtx();
    const start = ctx.currentTime + when;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
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

  function playChord(midiList, volume = 0.12) {
    midiList.forEach((midi) => playNote(midi, 1.8, 0, volume));
  }

  // ---------- talking to Django ----------
  async function api(url, params) {
    const response = await fetch(url + "?" + new URLSearchParams(params).toString());
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Something went wrong");
    return data;
  }

  // ---------- keyboard ----------
  function createKeyboard(keysEl, caseEl, low = 48, high = 84) {
    const keyByMidi = {};
    let timers = [];

    function build() {
      let whitesBefore = 0;
      for (let midi = low; midi <= high; midi++) {
        const key = document.createElement("div");
        key.dataset.midi = midi;
        if (BLACK_PCS.includes(midi % 12)) {
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

    function centerOn(midi) {
      const key = keyByMidi[midi];
      if (!key) return;
      const target = parseFloat(key.style.left) - caseEl.clientWidth / 2;
      caseEl.scrollTo({ left: target, behavior: "smooth" });
    }

    function light(midiList) {
      Object.values(keyByMidi).forEach((key) => key.classList.remove("is-lit"));
      midiList.forEach((midi) => {
        if (keyByMidi[midi]) keyByMidi[midi].classList.add("is-lit");
      });
      if (midiList.length) centerOn(midiList[0]);
      if (midiList.length) document.dispatchEvent(new CustomEvent("pianokit:play"));
    }

    // events: [{ t: seconds from now, midi: [numbers], dur: seconds }]
    function schedule(events) {
      timers.forEach(clearTimeout);
      timers = [];
      events.forEach((ev) => {
        ev.midi.forEach((m) => playNote(m, ev.dur, ev.t));
        timers.push(setTimeout(() => light(ev.midi), ev.t * 1000));
      });
    }

    build();
    centerOn(60);
    return { light, centerOn, schedule };
  }

  return { playNote, playChord, api, createKeyboard, getCtx };
})();