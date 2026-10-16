(function () {
  "use strict";
  const K = window.PianoKit;
  const M = window.MidiFile;
  const $ = (id) => document.getElementById(id);

  const keyboard = K.createKeyboard(
    $("main-keyboard-keys"),
    document.querySelector(".main-keyboard-case")
  );

  const titleOut = $("songs-now-title");
  const metaOut = $("songs-now-meta");
  const statusOut = $("songs-status");
  const playButton = $("songs-play");
  const exportButton = $("songs-export");
  const recordButton = $("songs-record");
  const importInput = $("songs-import-input");
  const speedSelect = $("songs-speed");

  const S = window.SongStore;
  const mineList = $("songs-mine-list");
  const mineCount = $("songs-mine-count");
  const mineEmpty = $("songs-mine-empty");

  const MAX_NOTES = 20000; // a normal piano piece has far fewer
  let song = null; // { title, notes: [{ midi, t, dur, vel }], duration }

  function say(text) {
    statusOut.textContent = text;
  }

  function clock(seconds) {
    const whole = Math.round(seconds);
    return Math.floor(whole / 60) + ":" + String(whole % 60).padStart(2, "0");
  }

  function setSong(next) {
    song = next;
    titleOut.textContent = song.title;
    metaOut.textContent = song.notes.length + " notes · " + clock(song.duration);
    playButton.disabled = false;
    exportButton.disabled = false;
  }

  // ---------- playing ----------
  // One sound event per note, plus "light" events that keep every held key lit.
  function toEvents(notes, scale) {
    const events = notes.map((n) => ({
      t: n.t * scale,
      midi: [n.midi],
      dur: Math.max(0.12, n.dur * scale),
      volume: 0.03 + 0.17 * (n.vel / 127),
      show: false,
    }));

    const changes = [];
    notes.forEach((n) => {
      changes.push({ t: n.t, midi: n.midi, add: 1 });
      changes.push({ t: n.t + n.dur, midi: n.midi, add: -1 });
    });
    changes.sort((a, b) => a.t - b.t || a.add - b.add);

    const held = new Map();
    changes.forEach((change, i) => {
      held.set(change.midi, (held.get(change.midi) || 0) + change.add);
      const nextChange = changes[i + 1];
      if (nextChange && nextChange.t === change.t) return; // light once per moment
      const lit = [...held.entries()].filter(([, count]) => count > 0).map(([midi]) => midi);
      events.push({ t: change.t * scale, midi: [], dur: 0, show: lit });
    });
    return events;
  }

  function play() {
    if (!song || !song.notes.length) return;
    const speed = Number(speedSelect.value);
    keyboard.schedule(toEvents(song.notes, 1 / speed));
    say("Playing at " + speed + "× speed.");
  }

  async function loadBuiltIn(button) {
    say("Loading…");
    try {
      const response = await fetch(button.dataset.src);
      if (!response.ok) throw new Error("File not found");
      const data = M.parse(await response.arrayBuffer());
      data.title = button.dataset.title;
      setSong(data);
      play();
    } catch (error) {
      say("Could not load that song: " + error.message);
    }
  }

  document.querySelectorAll(".songs-library-play").forEach((button) => {
    button.addEventListener("click", () => loadBuiltIn(button));
  });
  playButton.addEventListener("click", play);

  // ---------- import ----------
  importInput.addEventListener("change", async () => {
    const file = importInput.files[0];
    importInput.value = "";
    if (!file) return;
    if (file.size > 3000000) {
      say("That file is too big. MIDI files are normally under 1 MB.");
      return;
    }
    try {
      const data = M.parse(await file.arrayBuffer());
      if (!data.notes.length) throw new Error("It has no piano notes in it.");
      if (data.notes.length > MAX_NOTES) throw new Error("It has too many notes (" + MAX_NOTES + " is the limit).");
      data.title = data.title || file.name.replace(/\.midi?$/i, "");
      setSong(data);
      say("Imported " + file.name + ". " + (await save(data, "import")));
    } catch (error) {
      say("Could not read that file: " + error.message);
    }
  });

  // ---------- export ----------
  function download(item) {
    const bytes = M.write(item.notes, 120, item.title);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([bytes], { type: "audio/midi" }));
    link.download = (item.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "tcsmusic") + ".mid";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    say("Exported " + link.download + ". Drag it into FL Studio or any music app.");
  }

  exportButton.addEventListener("click", () => {
    if (song) download(song);
  });

  // ---------- saved songs (kept in this browser, not on the server) ----------
  function fromRecord(record) {
    return {
      title: record.title,
      duration: record.duration,
      notes: record.notes.map(([midi, t, dur, vel]) => ({ midi, t, dur, vel })),
    };
  }

  async function save(next, source) {
    try {
      await S.add(next, source);
      renderSaved();
      return "Saved to My songs.";
    } catch (error) {
      if (error.message === "full") return "Not saved: My songs is full (" + S.MAX_SAVED + "). Delete one to make room.";
      return "Not saved: this browser is blocking storage.";
    }
  }

  function button(label, handler) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "songs-mine-button";
    el.textContent = label;
    el.addEventListener("click", handler);
    return el;
  }

  function deleteButton(record) {
    const el = button("✕ Delete", async () => {
      if (el.dataset.sure !== "yes") {
        el.dataset.sure = "yes";
        el.textContent = "Sure? Click again";
        setTimeout(() => {
          el.dataset.sure = "";
          el.textContent = "✕ Delete";
        }, 3000);
        return;
      }
      await S.remove(record.id);
      say("Deleted " + record.title + ".");
      renderSaved();
    });
    return el;
  }

  function buildItem(record) {
    const item = document.createElement("li");
    item.className = "songs-mine-item";
    const text = document.createElement("div");
    text.className = "songs-mine-text";
    const name = document.createElement("strong");
    name.textContent = record.title; // textContent, so a strange file name can never run as HTML
    const meta = document.createElement("span");
    meta.textContent = (record.source === "recording" ? "Recording" : "Imported") + " · " + record.notes.length + " notes · " + clock(record.duration);
    text.append(name, meta);
    const buttons = document.createElement("div");
    buttons.className = "songs-mine-buttons";
    buttons.append(
      button("▶ Play", () => {
        setSong(fromRecord(record));
        play();
      }),
      button("⇩ Export", () => download(fromRecord(record))),
      deleteButton(record)
    );
    item.append(text, buttons);
    return item;
  }

  async function renderSaved() {
    let items;
    try {
      items = await S.list();
    } catch (error) {
      mineCount.textContent = "";
      mineEmpty.textContent = "Saving is not available in this browser mode. You can still play and export.";
      mineEmpty.hidden = false;
      mineList.replaceChildren();
      return;
    }
    mineCount.textContent = items.length + " / " + S.MAX_SAVED;
    mineEmpty.textContent = "Nothing saved yet. Imports and recordings appear here.";
    mineEmpty.hidden = items.length > 0;
    mineList.replaceChildren(...items.map(buildItem));
  }

  renderSaved();

  // ---------- record ----------
  let recording = false;
  let startedAt = 0;
  let taken = [];
  const down = new Map(); // midi -> { t, vel }

  function onNote(midi, isOn, volume) {
    if (isOn && !taken.length && !down.size) startedAt = performance.now(); // the clock starts with your first note
    const now = (performance.now() - startedAt) / 1000;
    if (isOn) {
      const level = volume === undefined ? 0.12 : volume;
      down.set(midi, { t: now, vel: Math.max(1, Math.min(127, Math.round(((level - 0.03) / 0.17) * 127))) });
    } else if (down.has(midi)) {
      const start = down.get(midi);
      taken.push({ midi, t: start.t, dur: Math.max(0.05, now - start.t), vel: start.vel });
      down.delete(midi);
    }
  }

  function stopRecording() {
    recording = false;
    keyboard.onNote(null);
    down.forEach((start, midi) => {
      taken.push({ midi, t: start.t, dur: Math.max(0.05, (performance.now() - startedAt) / 1000 - start.t), vel: start.vel });
    });
    down.clear();
    recordButton.textContent = "● Record";
    recordButton.setAttribute("aria-pressed", "false");
    if (!taken.length) {
      say("Nothing was recorded. Play some notes while recording.");
      return;
    }
    taken.sort((a, b) => a.t - b.t);
    const last = taken.reduce((latest, n) => Math.max(latest, n.t + n.dur), 0);
    const when = new Date().toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const recorded = { title: "Recording " + when, notes: taken, duration: last };
    setSong(recorded);
    save(recorded, "recording").then((result) => say("Recorded " + taken.length + " notes. " + result));
  }

  recordButton.addEventListener("click", () => {
    if (recording) {
      stopRecording();
      return;
    }
    recording = true;
    taken = [];
    down.clear();
    startedAt = performance.now();
    keyboard.onNote(onNote);
    recordButton.textContent = "■ Stop recording";
    recordButton.setAttribute("aria-pressed", "true");
    say("Recording. Play on the keys or your MIDI keyboard.");
  });
})();
