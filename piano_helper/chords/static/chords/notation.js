(function () {
  "use strict";
  const K = window.PianoKit;
  const $ = (id) => document.getElementById(id);

  const keyboard = K.createKeyboard(
    $("main-keyboard-keys"),
    document.querySelector(".main-keyboard-case")
  );
  const scaleUrl = JSON.parse($("notation-api-scale").textContent);
  const statusEl = $("notation-status");

  const C_MAJOR = [60, 64, 67];

  async function handle(button) {
    const d = button.dataset;
    K.stopAll();
    try {
      if (d.kind === "duration") {
        // a bar of four pulses at 60 BPM (one per second), then the note over the top
        const beats = parseFloat(d.beats);
        const events = [{ t: 0, midi: [72], dur: beats, volume: 0.12, show: false }];
        for (let i = 0; i < 4; i++) {
          events.push({ t: i, midi: [48], dur: 0.15, volume: 0.05, show: i < beats ? [72, 48] : [48] });
        }
        keyboard.schedule(events);
        statusEl.textContent = beats + (beats === 1 ? " beat" : " beats") + " at 60 BPM";
      } else if (d.kind === "dynamic") {
        keyboard.schedule([{ t: 0, midi: C_MAJOR, dur: 1.8, volume: parseFloat(d.volume) }]);
        statusEl.textContent = button.textContent + ": C major";
      } else if (d.kind === "tempo") {
        const bpm = parseInt(d.bpm, 10);
        const events = [];
        for (let i = 0; i < 8; i++) {
          events.push({ t: (i * 60) / bpm, midi: [i % 4 === 0 ? 72 : 67], dur: 0.15, volume: 0.1 });
        }
        keyboard.schedule(events);
        statusEl.textContent = bpm + " BPM";
      } else if (d.kind === "key") {
        const data = await K.api(scaleUrl, { root: d.root, scale: "major" });
        statusEl.textContent = data.name + ": " + data.notes.join("  ");
        keyboard.schedule(data.midi.map((m, i) => ({ t: i * 0.4, midi: [m], dur: 0.7 })));
      }
    } catch (error) {
      statusEl.textContent = error.message;
    }
  }

  document.querySelectorAll(".notation-play-button").forEach((button) => {
    button.addEventListener("click", () => handle(button));
  });

  // ---- live search over the reference tables ----
  $("notation-filter-input").addEventListener("input", (event) => {
    const query = event.target.value.trim().toLowerCase();
    document.querySelectorAll(".notation-ref-section").forEach((section) => {
      let shown = 0;
      section.querySelectorAll(".notation-ref-row").forEach((row) => {
        const match = row.textContent.toLowerCase().includes(query);
        row.hidden = !match;
        if (match) shown += 1;
      });
      section.hidden = shown === 0;
    });
  });
})();