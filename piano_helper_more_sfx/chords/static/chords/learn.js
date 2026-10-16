(function () {
  "use strict";
  const K = window.PianoKit;
  const $ = (id) => document.getElementById(id);

  const keyboard = K.createKeyboard(
    $("main-keyboard-keys"),
    document.querySelector(".main-keyboard-case")
  );
  const scaleUrl = JSON.parse($("learn-api-scale").textContent);
  const progressionUrl = JSON.parse($("learn-api-progression").textContent);
  const statusEl = $("learn-key-status");
  const keySelect = $("learn-key-select");

  function patternEvents(midi, pattern) {
    if (pattern === "block") return [{ t: 0, midi: midi, dur: 1.8 }];
    const up = midi.map((m, i) => ({ t: i * 0.4, midi: [m], dur: 0.8 }));
    if (pattern === "broken") return up;
    const down = midi.slice(0, -1).reverse()
      .map((m, i) => ({ t: (midi.length + i) * 0.4, midi: [m], dur: 0.8 }));
    return up.concat(down);
  }

  async function handle(button) {
    const key = keySelect.value;
    const d = button.dataset;
    try {
      if (d.kind === "scale") {
        const data = await K.api(scaleUrl, { root: key, scale: d.scale });
        statusEl.textContent = data.name + ": " + data.notes.join("  ");
        keyboard.schedule(data.midi.map((m, i) => ({ t: i * 0.4, midi: [m], dur: 0.7 })));
      } else if (d.kind === "progression") {
        const data = await K.api(progressionUrl, { key: key, numerals: d.numerals });
        statusEl.textContent = data.chords.map((c) => c.numeral + " = " + c.name).join("    ");
        keyboard.schedule(data.chords.map((c, i) => ({ t: i * 1.4, midi: c.midi, dur: 1.6 })));
      } else if (d.kind === "pattern") {
        const data = await K.api(progressionUrl, { key: key, numerals: "1" });
        const chord = data.chords[0];
        statusEl.textContent = chord.name + ": " + chord.notes.join("  ");
        keyboard.schedule(patternEvents(chord.midi, d.pattern));
      }
    } catch (error) {
      statusEl.textContent = error.message;
    }
  }

  document.querySelectorAll(".learn-play-button").forEach((button) => {
    button.addEventListener("click", () => handle(button));
  });
})();