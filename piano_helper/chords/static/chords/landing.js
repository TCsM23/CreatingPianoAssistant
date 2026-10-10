(function () {
  "use strict";
  const K = window.PianoKit;
  const stage = document.getElementById("home-stage");
  const keysEl = document.getElementById("home-stage-keys");
  const barsEl = document.getElementById("home-stage-bars");
  const hearButton = document.getElementById("home-hear");
  if (!stage || !keysEl || !barsEl) return;

  const LOW = 60;   // C4
  const HIGH = 83;  // B5
  const BLACK_PCS = [1, 3, 6, 8, 10];
  const FALL = 1.6; // seconds a bar takes to fall onto its key
  const GAP = 1.5;  // seconds between chords

  // 1-5-6m-4 in C, in a comfortable spread
  const CHORDS = [
    [60, 64, 67, 72],
    [59, 62, 67, 71],
    [57, 60, 64, 69],
    [60, 65, 69, 72],
  ];

  // ---------- build the little piano ----------
  const whites = [];
  for (let m = LOW; m <= HIGH; m++) if (!BLACK_PCS.includes(m % 12)) whites.push(m);
  const keyEls = {};
  whites.forEach((midi, i) => {
    const key = document.createElement("div");
    key.className = "home-stage-key";
    key.style.left = (i / whites.length) * 100 + "%";
    key.style.width = 100 / whites.length + "%";
    keyEls[midi] = key;
    keysEl.appendChild(key);
  });
  for (let m = LOW; m <= HIGH; m++) {
    if (!BLACK_PCS.includes(m % 12)) continue;
    const before = whites.filter((w) => w < m).length;
    const width = (100 / whites.length) * 0.6;
    const key = document.createElement("div");
    key.className = "home-stage-key home-stage-key-black";
    key.style.left = (before * 100) / whites.length - width / 2 + "%";
    key.style.width = width + "%";
    keyEls[m] = key;
    keysEl.appendChild(key);
  }

  Object.keys(keyEls).forEach((midi) => {
    keyEls[midi].addEventListener("click", () => {
      K.playNote(Number(midi), 1.4);
      flash(Number(midi));
    });
  });

  function flash(midi) {
    const key = keyEls[midi];
    if (!key) return;
    key.classList.add("is-lit");
    setTimeout(() => key.classList.remove("is-lit"), 650);
  }

  // ---------- falling bars ----------
  function bar(midi, delay) {
    const key = keyEls[midi];
    if (!key) return;
    const el = document.createElement("span");
    el.className = "home-stage-bar" + (BLACK_PCS.includes(midi % 12) ? " is-black" : "");
    el.style.left = key.style.left;
    el.style.width = key.style.width;
    el.style.setProperty("--fall", FALL + "s");
    el.style.animationDelay = delay + "s";
    el.addEventListener("animationend", () => {
      el.remove();
      flash(midi);
    });
    barsEl.appendChild(el);
  }

  let loop = null;
  let restart = null;
  function chordAt(index, delay, withSound) {
    const chord = CHORDS[index % CHORDS.length];
    chord.forEach((midi) => {
      bar(midi, delay);
      if (withSound) K.playNote(midi, 1.4, delay + FALL);
    });
  }

  let hearing = false; // true while the "Hear" button's sequence is playing

  function startLoop() {
    clearInterval(loop);
    barsEl.replaceChildren(); // always start from a clean stage
    let i = 0;
    chordAt(i++, 0, false);
    loop = setInterval(() => {
      if (document.hidden) return; // tab in the background: don't pile up chords
      chordAt(i++, 0, false);
    }, GAP * 1000);
  }

  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!calm) startLoop();

  // coming back to the tab: restart cleanly so old and new chords never fall together
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !calm && !hearing) startLoop();
  });

  if (hearButton) {
    hearButton.addEventListener("click", () => {
      K.stopAll();
      clearInterval(loop);
      clearTimeout(restart);
      barsEl.replaceChildren();
      CHORDS.forEach((_, i) => chordAt(i, i * GAP, true));
      hearing = true;
      restart = setTimeout(() => {
        hearing = false;
        startLoop();
      }, (CHORDS.length * GAP + FALL + 1) * 1000);
    });
  }
})();