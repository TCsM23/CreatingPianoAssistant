// Read and write Standard MIDI Files (.mid), in the browser.
// parse(arrayBuffer)  ->  { title, notes: [{ midi, t, dur, vel }], duration }   (t and dur in seconds)
// write(notes, bpm)   ->  Uint8Array, a format 0 file you can download
window.MidiFile = (function () {
  "use strict";

  function parse(buffer) {
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    let pos = 0;

    function text(length) {
      let out = "";
      for (let i = 0; i < length; i++) out += String.fromCharCode(bytes[pos + i]);
      pos += length;
      return out;
    }

    function varLength() {
      let value = 0;
      let byte;
      do {
        byte = bytes[pos++];
        value = (value << 7) | (byte & 0x7f);
      } while (byte & 0x80);
      return value;
    }

    if (bytes.length < 14 || text(4) !== "MThd") throw new Error("This is not a MIDI file.");
    pos += 4; // header length
    const trackCount = view.getUint16(pos + 2);
    const division = view.getUint16(pos + 4);
    pos += 6;
    if (division & 0x8000) throw new Error("This MIDI file uses timecode timing, which is not supported.");

    const tempos = [{ tick: 0, micros: 500000 }]; // 120 bpm until a file says otherwise
    const raw = []; // { midi, start, end, vel } in ticks
    let title = "";

    for (let track = 0; track < trackCount && pos + 8 <= bytes.length; track++) {
      if (text(4) !== "MTrk") throw new Error("The MIDI file is damaged.");
      const length = view.getUint32(pos);
      pos += 4;
      const stop = pos + length;
      let tick = 0;
      let status = 0;
      const open = new Map(); // channel*128+note -> [raw notes still sounding]

      while (pos < stop) {
        tick += varLength();
        let first = bytes[pos];
        if (first & 0x80) {
          status = first;
          pos += 1;
        } // otherwise "running status": reuse the last one
        if (status === 0xff) {
          const type = bytes[pos++];
          const size = varLength();
          if (type === 0x51 && size === 3) {
            tempos.push({ tick, micros: (bytes[pos] << 16) | (bytes[pos + 1] << 8) | bytes[pos + 2] });
          } else if (type === 0x03 && !title && track === 0) {
            const at = pos;
            title = text(size);
            pos = at;
          }
          pos += size;
        } else if (status === 0xf0 || status === 0xf7) {
          pos += varLength();
        } else {
          const kind = status & 0xf0;
          const channel = status & 0x0f;
          const a = bytes[pos++];
          const b = kind === 0xc0 || kind === 0xd0 ? 0 : bytes[pos++];
          if (channel === 9) continue; // channel 10 is drums
          const key = channel * 128 + a;
          if (kind === 0x90 && b > 0) {
            const note = { midi: a, start: tick, end: null, vel: b };
            raw.push(note);
            if (!open.has(key)) open.set(key, []);
            open.get(key).push(note);
          } else if (kind === 0x80 || (kind === 0x90 && b === 0)) {
            const list = open.get(key);
            if (list && list.length) list.shift().end = tick;
          }
        }
      }
      open.forEach((list) => list.forEach((note) => (note.end = tick)));
      pos = stop;
    }

    // ticks -> seconds, following every tempo change
    tempos.sort((x, y) => x.tick - y.tick);
    const marks = [];
    let seconds = 0;
    let lastTick = 0;
    let micros = tempos[0].micros;
    tempos.forEach((change) => {
      seconds += ((change.tick - lastTick) * micros) / 1e6 / division;
      marks.push({ tick: change.tick, seconds, micros: change.micros });
      lastTick = change.tick;
      micros = change.micros;
    });

    function toSeconds(tick) {
      let mark = marks[0];
      for (let i = 0; i < marks.length && marks[i].tick <= tick; i++) mark = marks[i];
      return mark.seconds + ((tick - mark.tick) * mark.micros) / 1e6 / division;
    }

    const notes = raw
      .map((n) => ({
        midi: n.midi,
        t: toSeconds(n.start),
        dur: Math.max(0.05, toSeconds(n.end === null ? n.start : n.end) - toSeconds(n.start)),
        vel: n.vel,
      }))
      .sort((x, y) => x.t - y.t);

    const duration = notes.reduce((latest, n) => Math.max(latest, n.t + n.dur), 0);
    return { title: title.trim(), notes, duration };
  }

  function varBytes(value) {
    const out = [value & 0x7f];
    value >>= 7;
    while (value) {
      out.push((value & 0x7f) | 0x80);
      value >>= 7;
    }
    return out.reverse();
  }

  function write(notes, bpm = 120, title = "TCsMusic") {
    const PPQ = 480;
    const perSecond = (PPQ * bpm) / 60;
    const events = [];
    notes.forEach((n) => {
      const on = Math.round(n.t * perSecond);
      const off = Math.max(on + 1, Math.round((n.t + n.dur) * perSecond));
      events.push({ tick: on, order: 1, status: 0x90, midi: n.midi, vel: Math.max(1, Math.min(127, Math.round(n.vel || 80))) });
      events.push({ tick: off, order: 0, status: 0x80, midi: n.midi, vel: 0 });
    });
    events.sort((x, y) => x.tick - y.tick || x.order - y.order); // a note ends before the next one starts

    const body = [];
    const name = Array.from(title).map((c) => c.charCodeAt(0) & 0x7f);
    body.push(0x00, 0xff, 0x03, ...varBytes(name.length), ...name);
    const micros = Math.round(60000000 / bpm);
    body.push(0x00, 0xff, 0x51, 0x03, (micros >> 16) & 0xff, (micros >> 8) & 0xff, micros & 0xff);
    let last = 0;
    events.forEach((ev) => {
      body.push(...varBytes(ev.tick - last), ev.status, ev.midi, ev.vel);
      last = ev.tick;
    });
    body.push(0x00, 0xff, 0x2f, 0x00);

    const head = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (PPQ >> 8) & 0xff, PPQ & 0xff];
    const size = body.length;
    const track = [0x4d, 0x54, 0x72, 0x6b, (size >>> 24) & 0xff, (size >>> 16) & 0xff, (size >>> 8) & 0xff, size & 0xff];
    return new Uint8Array([...head, ...track, ...body]);
  }

  return { parse, write };
})();
