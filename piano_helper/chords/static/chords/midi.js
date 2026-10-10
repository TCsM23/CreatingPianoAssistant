(function () {
  "use strict";
  const K = window.PianoKit;
  const $ = (id) => document.getElementById(id);

  const connectButton = $("main-midi-connect");
  if (!connectButton || !K) return;

  const octaveBox = $("main-midi-octave");
  const octaveLabel = $("main-midi-octave-label");
  const statusOut = $("main-midi-status");

  let access = null;
  let shift = 0; // semitones, always a multiple of 12
  const sounding = new Map(); // note the keyboard sent -> note we played

  function say(text) {
    statusOut.textContent = text;
  }

  function inputNames() {
    const names = [];
    access.inputs.forEach((input) => names.push(input.name || "MIDI device"));
    return names;
  }

  function showDevices() {
    const names = inputNames();
    say(names.length ? "Connected: " + names.join(", ") : "No MIDI keyboard found. Plug one in.");
  }

  function noteOn(note, velocity) {
    const board = K.getBoard();
    if (!board) return;
    const played = note + shift;
    if (sounding.has(note)) board.up(sounding.get(note));
    sounding.set(note, played);
    board.down(played, 0.03 + 0.17 * (velocity / 127)); // louder when you hit harder
  }

  function noteOff(note) {
    const board = K.getBoard();
    if (!board || !sounding.has(note)) return;
    board.up(sounding.get(note));
    sounding.delete(note);
  }

  function allOff() {
    [...sounding.keys()].forEach(noteOff);
  }

  function sustain(value) {
    K.setMidiPedal(value < 32 ? 0 : value < 96 ? 0.5 : 1);
  }

  function onMessage(event) {
    const [status, a, b] = event.data;
    const kind = status & 0xf0;
    if (kind === 0x90 && b > 0) noteOn(a, b);
    else if (kind === 0x80 || (kind === 0x90 && b === 0)) noteOff(a);
    else if (kind === 0xb0 && a === 64) sustain(b);
    else if (kind === 0xb0 && (a === 123 || a === 120)) allOff();
  }

  function listen() {
    access.inputs.forEach((input) => {
      input.onmidimessage = onMessage;
    });
  }

  function drawOctave() {
    const octave = shift / 12;
    octaveLabel.textContent = "Octave " + (octave > 0 ? "+" : "") + octave;
  }

  function moveOctave(step) {
    allOff();
    shift = Math.max(-36, Math.min(36, shift + step * 12));
    drawOctave();
  }

  $("main-midi-octave-down").addEventListener("click", () => moveOctave(-1));
  $("main-midi-octave-up").addEventListener("click", () => moveOctave(1));

  connectButton.addEventListener("click", async () => {
    if (!navigator.requestMIDIAccess) {
      say("This browser has no MIDI support. Try Chrome, Edge or Opera.");
      return;
    }
    if (access) return;
    say("Waiting for permission…");
    try {
      access = await navigator.requestMIDIAccess();
    } catch (error) {
      say("MIDI access was blocked. Allow it in the address bar and try again.");
      return;
    }
    listen();
    showDevices();
    octaveBox.hidden = false;
    connectButton.textContent = "🎹 MIDI connected";
    connectButton.setAttribute("aria-pressed", "true");
    access.onstatechange = () => {
      listen();
      showDevices();
    };
  });
})();
