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
  const identifyUrl = JSON.parse($("main-api-identify").textContent);

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
  // ---------- identify a chord from picked keys ----------
  const toggleButton = $("main-identify-toggle");
  const playPicked = $("main-identify-play");
  const clearPicked = $("main-identify-clear");
  const notesOut = $("main-identify-notes");
  const resultOut = $("main-identify-result");

  let picked = [];
  let asked = 0;

  function listItem(main, detail) {
    const item = document.createElement("li");
    const name = document.createElement("strong");
    name.textContent = main;
    const note = document.createElement("span");
    note.textContent = detail;
    item.append(name, note);
    return item;
  }

  async function identify() {
    const ask = ++asked;
    keyboard.mark(picked);
    playPicked.disabled = picked.length === 0;
    clearPicked.disabled = picked.length === 0;
    resultOut.replaceChildren();

    if (picked.length === 0) {
      notesOut.textContent = "No notes picked yet.";
      return;
    }
    try {
      const data = await K.api(identifyUrl, { notes: picked.join(",") });
      if (ask !== asked) return;               // a newer click has already replaced this answer
      notesOut.textContent = "Notes: " + data.notes.join("  ");
      if (data.interval) resultOut.appendChild(listItem(data.interval, "the distance between your two notes"));
      data.chords.forEach((chord, index) => {
        const detail = chord.label + (chord.inversion ? " (inverted)" : index === 0 ? " (root position)" : "");
        resultOut.appendChild(listItem(chord.name, detail));
      });
      if (!data.interval && data.chords.length === 0) {
        const hint = picked.length < 3 ? "Pick at least three notes to name a chord." : "No chord matches these notes exactly. Try adding or removing a note.";
        resultOut.appendChild(listItem("No match", hint));
      }
    } catch (error) {
      notesOut.textContent = error.message;
    }
  }

  function togglePick(midi) {
    const at = picked.indexOf(midi);
    if (at >= 0) picked.splice(at, 1);
    else picked.push(midi);
    picked.sort((a, b) => a - b);
    identify();
  }

  function setPicking(on) {
    toggleButton.setAttribute("aria-pressed", on ? "true" : "false");
    toggleButton.textContent = on ? "Pick notes: on" : "Pick notes: off";
    keyboard.onKey(on ? togglePick : null);
    if (!on) {
      picked = [];
      identify();
    }
  }

  toggleButton.addEventListener("click", () => setPicking(toggleButton.getAttribute("aria-pressed") !== "true"));
  clearPicked.addEventListener("click", () => {
    picked = [];
    identify();
  });
  playPicked.addEventListener("click", () => {
    keyboard.mark(picked);
    K.playChord(picked);
  });

  $("main-chord-find").addEventListener("click", findChord);
  $("main-chord-play").addEventListener("click", () => {
    if (currentMidi.length) {
      keyboard.light(currentMidi);
      K.playChord(currentMidi);
    }
  });
  $("main-scale-play").addEventListener("click", playScale);
  $("main-progression-play").addEventListener("click", playProgression);
})();