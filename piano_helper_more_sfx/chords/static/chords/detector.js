(function () {
  "use strict";
  const K = window.PianoKit;
  const $ = (id) => document.getElementById(id);

  const chordOut = $("main-detect-chord");
  if (!chordOut || !K || !K.getBoard()) return;

  const chordDetail = $("main-detect-chord-detail");
  const keyOut = $("main-detect-key");
  const keyDetail = $("main-detect-key-detail");
  const keyOthers = $("main-detect-key-others");
  const identifyUrl = JSON.parse($("main-api-identify").textContent);
  const keyUrl = JSON.parse($("main-api-key").textContent);

  const WINDOW_MS = 15000;   // how long a played note counts toward the key
  const LINGER_MS = 2500;    // how long a chord name stays after you let go
  const WAIT_MS = 60;        // wait for a burst of notes to finish before asking

  const held = new Set();          // keys that are down right now
  const recent = new Map();        // note -> when it was last played
  let chordAsk = 0;
  let keyAsk = 0;
  let waitTimer = null;
  let lingerTimer = null;
  let lastKeyRequest = "";

  // ---------- the chord you are holding ----------
  async function showChord() {
    clearTimeout(lingerTimer);
    const notes = [...held].sort((a, b) => a - b);
    if (notes.length < 2) {
      lingerTimer = setTimeout(() => {
        if (held.size < 2) {
          chordOut.textContent = "Hold two or more keys.";
          chordDetail.textContent = "";
        }
      }, LINGER_MS);
      return;
    }
    const ask = ++chordAsk;
    try {
      const data = await K.api(identifyUrl, { notes: notes.join(",") });
      if (ask !== chordAsk) return; // a newer chord has already replaced this answer
      const names = notes.map((midi) => K.noteName(midi)).join("  ");
      if (data.chords.length) {
        const best = data.chords[0];
        chordOut.textContent = best.name;
        const others = data.chords.slice(1, 3).map((chord) => chord.name).join(", ");
        chordDetail.textContent =
          best.kind + " · " + best.label + (best.inversion ? " (inverted)" : " (root position)") +
          (others ? " · also reads as " + others : "") + " · " + names;
      } else if (data.interval) {
        chordOut.textContent = data.interval;
        chordDetail.textContent = "Two notes: " + names;
      } else {
        chordOut.textContent = "No chord";
        chordDetail.textContent = names + " does not match a triad or seventh chord exactly.";
      }
    } catch (error) {
      chordDetail.textContent = error.message;
    }
  }

  // ---------- the key of your recent notes ----------
  function drop(now) {
    recent.forEach((time, midi) => {
      if (now - time > WINDOW_MS) recent.delete(midi);
    });
  }

  function clearKeyList() {
    keyOthers.replaceChildren();
    keyDetail.textContent = "";
  }

  async function showKey() {
    drop(performance.now());
    const notes = [...recent.keys()].sort((a, b) => a - b);
    const classes = new Set(notes.map((midi) => midi % 12));
    if (classes.size < 3) {
      lastKeyRequest = "";
      keyAsk += 1;
      keyOut.textContent = "Play a few different notes.";
      clearKeyList();
      return;
    }
    const request = notes.join(",");
    if (request === lastKeyRequest) return;
    lastKeyRequest = request;
    const ask = ++keyAsk;
    try {
      const data = await K.api(keyUrl, { notes: request });
      if (ask !== keyAsk) return;
      clearKeyList();
      if (!data.keys.length) {
        keyOut.textContent = "No single key";
        keyDetail.textContent = "These notes do not all belong to one major or natural minor key.";
        return;
      }
      const best = data.keys[0];
      keyOut.textContent = best.name;
      keyDetail.textContent = "Key signature: " + best.signature + " · relative " + best.relative;
      data.keys.slice(1).forEach((key) => {
        const item = document.createElement("li");
        const name = document.createElement("strong");
        name.textContent = key.name;
        const note = document.createElement("span");
        note.textContent = key.signature;
        item.append(name, note);
        keyOthers.appendChild(item);
      });
    } catch (error) {
      keyDetail.textContent = error.message;
    }
  }

  function update() {
    clearTimeout(waitTimer);
    waitTimer = setTimeout(() => {
      showChord();
      showKey();
    }, WAIT_MS);
  }

  K.getBoard().onNote((midi, isOn) => {
    if (isOn) {
      held.add(midi);
      recent.set(midi, performance.now());
    } else {
      held.delete(midi);
    }
    update();
  });

  // notes fall out of the key window as time passes
  setInterval(() => {
    if (recent.size) showKey();
  }, 1000);

  $("main-detect-reset").addEventListener("click", () => {
    recent.clear();
    lastKeyRequest = "";
    showKey();
  });
})();
