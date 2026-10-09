(function () {
  "use strict";
  const K = window.PianoKit;
  const $ = (id) => document.getElementById(id);

  const keyboard = K.createKeyboard(
    $("main-keyboard-keys"),
    document.querySelector(".main-keyboard-case")
  );

  const chordUrl = JSON.parse($("main-api-url").textContent);
  const scaleUrl = JSON.parse($("main-api-scale").textContent);
  const progressionUrl = JSON.parse($("main-api-progression").textContent);

  let currentMidi = [];

  async function findChord() {
    const out = $("main-chord-result");
    try {
      const data = await K.api(chordUrl, {
        root: $("main-chord-root").value,
        quality: $("main-chord-quality").value,
      });
      out.textContent = data.label + ": " + data.notes.join("  ");
      currentMidi = data.midi;
      keyboard.light(currentMidi);
      K.playChord(currentMidi);
    } catch (error) {
      out.textContent = error.message;
      keyboard.light([]);
    }
  }

  async function playScale() {
    const out = $("main-scale-result");
    try {
      const data = await K.api(scaleUrl, {
        root: $("main-scale-root").value,
        scale: $("main-scale-type").value,
      });
      out.textContent = data.name + ": " + data.notes.join("  ");
      keyboard.schedule(data.midi.map((m, i) => ({ midi: [m], t: i * 0.4, dur: 0.7 })));
    } catch (error) {
      out.textContent = error.message;
    }
  }

  async function playProgression() {
    const out = $("main-progression-result");
    try {
      const data = await K.api(progressionUrl, {
        key: $("main-progression-key").value,
        numerals: $("main-progression-input").value,
      });
      out.textContent = data.chords.map((c) => c.numeral + " = " + c.name).join("    ");
      keyboard.schedule(data.chords.map((c, i) => ({ midi: c.midi, t: i * 1.4, dur: 1.6 })));
    } catch (error) {
      out.textContent = error.message;
    }
  }

  $("main-chord-find").addEventListener("click", findChord);
  $("main-chord-play").addEventListener("click", () => {
    if (currentMidi.length) K.playChord(currentMidi);
  });
  $("main-scale-play").addEventListener("click", playScale);
  $("main-progression-play").addEventListener("click", playProgression);
})();