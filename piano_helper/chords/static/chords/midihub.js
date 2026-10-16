// MidiHub: owns the Web MIDI connection and turns raw bytes into plain messages.
// Anything on the page can listen:  MidiHub.on(function (msg) { ... })
// msg = { type, ch (1-16), a, b, value (0-1), key }  where key names the physical control,
// like "cc:1:21" (channel 1, controller 21) or "note:10:36" (channel 10, note 36).
(function () {
  "use strict";
  let access = null;
  let busy = false;
  const listeners = [];
  const stateListeners = [];

  function emit(msg) { listeners.forEach((fn) => fn(msg)); }
  function emitState() { stateListeners.forEach((fn) => fn(status())); }

  function parse(data) {
    const status = data[0], a = data[1] || 0, b = data[2] || 0;
    const kind = status & 0xf0, ch = (status & 0x0f) + 1;
    if (status >= 0xf0) return null; // clock, sysex and friends
    if (kind === 0x90 && b > 0) return { type: "noteon", ch, a, b, value: b / 127, key: "note:" + ch + ":" + a };
    if (kind === 0x80 || kind === 0x90) return { type: "noteoff", ch, a, b, value: 0, key: "note:" + ch + ":" + a };
    if (kind === 0xb0) return { type: "cc", ch, a, b, value: b / 127, key: "cc:" + ch + ":" + a };
    if (kind === 0xe0) {
      const norm = Math.max(-1, Math.min(1, ((b << 7) + a - 8192) / 8192));
      return { type: "bend", ch, a, b, value: (norm + 1) / 2, norm, key: "bend:" + ch };
    }
    if (kind === 0xd0) return { type: "pressure", ch, a, b: a, value: a / 127, key: "at:" + ch };
    if (kind === 0xa0) return { type: "poly", ch, a, b, value: b / 127, key: "poly:" + ch + ":" + a };
    if (kind === 0xc0) return { type: "program", ch, a, b: a, value: a / 127, key: "pc:" + ch + ":" + a };
    return null;
  }

  function onMessage(event) {
    const msg = parse(event.data);
    if (msg) emit(msg);
  }

  function listen() {
    access.inputs.forEach((input) => { input.onmidimessage = onMessage; });
  }

  function names() {
    const out = [];
    if (access) access.inputs.forEach((input) => out.push(input.name || "MIDI device"));
    return out;
  }

  function status() {
    return { connected: !!access, busy, devices: names(), message: "" };
  }

  async function connect() {
    if (access || busy) return status();
    if (!navigator.requestMIDIAccess) {
      const s = status();
      s.message = "This browser has no MIDI support. Try Chrome, Edge or Opera.";
      stateListeners.forEach((fn) => fn(s));
      return s;
    }
    busy = true;
    try {
      access = await navigator.requestMIDIAccess();
    } catch (error) {
      access = null;
      busy = false;
      const s = status();
      s.message = "MIDI access was blocked. Allow it in the address bar and try again.";
      stateListeners.forEach((fn) => fn(s));
      return s;
    }
    busy = false;
    listen();
    access.onstatechange = () => { listen(); emitState(); };
    emitState();
    return status();
  }

  function disconnect() {
    if (!access) return;
    access.inputs.forEach((input) => { input.onmidimessage = null; });
    access.onstatechange = null;
    access = null;
    emitState();
  }

  window.MidiHub = {
    connect, disconnect, status,
    toggle() { return access ? (disconnect(), Promise.resolve(status())) : connect(); },
    on(fn) { listeners.push(fn); },
    onState(fn) { stateListeners.push(fn); },
    // for tests and for pretend controllers
    inject(msg) { emit(msg); },
    parse,
  };
})();
