// Play the on-screen piano with the computer keyboard, two rows like FL Studio:
//   lower row  Z S X D C V G B H N J M   = C C# D D# E F F# G G# A A# B
//   upper row  Q 2 W 3 E R 5 T 6 Y 7 U I 9 O 0 P [ = ]   = one octave higher, and on up
(function () {
  "use strict";
  const K = window.PianoKit;
  const $ = (id) => document.getElementById(id);

  const toggle = $("main-typing-toggle");
  if (!toggle || !K) return;

  const octaveBox = $("main-typing-octave");
  const octaveLabel = $("main-typing-octave-label");

  // key code -> semitones above the lowest key. The upper row is listed first so it wins
  // the label where the two rows overlap. Codes are physical keys, so other layouts work too.
  const KEYS = {
    KeyQ: 12, Digit2: 13, KeyW: 14, Digit3: 15, KeyE: 16, KeyR: 17, Digit5: 18, KeyT: 19,
    Digit6: 20, KeyY: 21, Digit7: 22, KeyU: 23, KeyI: 24, Digit9: 25, KeyO: 26, Digit0: 27,
    KeyP: 28, BracketLeft: 29, Equal: 30, BracketRight: 31,
    KeyZ: 0, KeyS: 1, KeyX: 2, KeyD: 3, KeyC: 4, KeyV: 5, KeyG: 6, KeyB: 7,
    KeyH: 8, KeyN: 9, KeyJ: 10, KeyM: 11, Comma: 12, KeyL: 13, Period: 14, Semicolon: 15, Slash: 16,
  };
  const SYMBOLS = { Comma: ",", Period: ".", Semicolon: ";", Slash: "/", BracketLeft: "[", BracketRight: "]", Equal: "=" };
  const BASE = 48; // C3, the lowest key on the screen

  let on = true;
  let shift = 0; // semitones, a multiple of 12
  const held = new Map(); // key code -> the note it started

  try {
    if (localStorage.getItem("tcsmusic-typing") === "off") on = false;
  } catch (error) {
    /* storage can be blocked; the default is fine */
  }

  function labelFor(code) {
    if (SYMBOLS[code]) return SYMBOLS[code];
    return code.replace("Key", "").replace("Digit", "");
  }

  function drawLabels() {
    const keys = document.querySelectorAll("#main-keyboard-keys [data-midi]");
    keys.forEach((key) => key.removeAttribute("data-key"));
    if (!on) return;
    const names = {};
    Object.keys(KEYS).forEach((code) => {
      const midi = BASE + shift + KEYS[code];
      if (!names[midi]) names[midi] = labelFor(code);
    });
    keys.forEach((key) => {
      const name = names[key.dataset.midi];
      if (name) key.setAttribute("data-key", name);
    });
  }

  function release(code) {
    const board = K.getBoard();
    if (board && held.has(code)) board.up(held.get(code));
    held.delete(code);
  }

  function releaseAll() {
    [...held.keys()].forEach(release);
  }

  function draw() {
    toggle.setAttribute("aria-pressed", String(on));
    toggle.textContent = "⌨ Typing keys: " + (on ? "on" : "off");
    octaveBox.hidden = !on;
    const octave = shift / 12;
    octaveLabel.textContent = "Octave " + (octave > 0 ? "+" : "") + octave;
    drawLabels();
  }

  function typingTarget(event) {
    const el = event.target;
    return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
  }

  document.addEventListener("keydown", (event) => {
    if (!on || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    if (!(event.code in KEYS) || typingTarget(event)) return;
    const board = K.getBoard();
    if (!board) return;
    event.preventDefault(); // stops "/" opening quick find in some browsers
    if (held.has(event.code)) return;
    const note = BASE + shift + KEYS[event.code];
    held.set(event.code, note);
    board.down(note);
  });

  document.addEventListener("keyup", (event) => release(event.code));
  window.addEventListener("blur", releaseAll);

  // a dropdown keeps keyboard focus after you pick from it, which would swallow the letters
  document.addEventListener("change", (event) => {
    if (event.target.tagName === "SELECT") event.target.blur();
  });

  toggle.addEventListener("click", () => {
    on = !on;
    if (!on) releaseAll();
    try {
      localStorage.setItem("tcsmusic-typing", on ? "on" : "off");
    } catch (error) {
      /* not saved, still works */
    }
    toggle.blur();
    draw();
  });

  function moveOctave(step) {
    releaseAll();
    shift = Math.max(-24, Math.min(24, shift + step * 12));
    draw();
  }

  $("main-typing-octave-down").addEventListener("click", (event) => {
    moveOctave(-1);
    event.currentTarget.blur();
  });
  $("main-typing-octave-up").addEventListener("click", (event) => {
    moveOctave(1);
    event.currentTarget.blur();
  });

  draw();
  if (document.readyState === "complete") drawLabels();
  else window.addEventListener("load", drawLabels); // the keys are built by the page's own script
})();