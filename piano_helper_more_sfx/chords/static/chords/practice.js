(function () {
  "use strict";
  const K = window.PianoKit;
  const $ = (id) => document.getElementById(id);

  const keyboard = K.createKeyboard(
    $("main-keyboard-keys"),
    document.querySelector(".main-keyboard-case")
  );
  const chordUrl = JSON.parse($("practice-api-chord").textContent);
  const progressionUrl = JSON.parse($("practice-api-progression").textContent);

  const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const NUMBERS = ["1", "2m", "3m", "4", "5", "6m"];
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  // =============== ear trainer ===============
  const modeSel = $("practice-ear-mode");
  const keySel = $("practice-ear-key");
  const helpEl = $("practice-ear-help");
  const answersEl = $("practice-ear-answers");
  const feedbackEl = $("practice-ear-feedback");
  const scoreEl = $("practice-ear-score");
  const streakEl = $("practice-ear-streak");
  const replayBtn = $("practice-ear-replay");
  const contextBtn = $("practice-ear-context");

  const HELP = {
    majmin: "You hear one chord with the keys dark. Is it major (bright) or minor (darker)?",
    number: "You hear one of the six chords in the key you picked. Which number is it? Tip: hear chord 1 first, then compare.",
  };

  let score = { right: 0, total: 0, streak: 0 };
  let current = null;     // { answer, chord }
  let answered = true;

  function loadScore() {
    try {
      const saved = JSON.parse(localStorage.getItem("tcsmusic-ear-score") || "null");
      if (saved && typeof saved.right === "number") score = saved;
    } catch (e) { /* storage blocked: start at zero */ }
  }
  function saveScore() {
    try { localStorage.setItem("tcsmusic-ear-score", JSON.stringify(score)); } catch (e) { /* ignore */ }
  }
  function showScore() {
    scoreEl.textContent = "Score " + score.right + " / " + score.total;
    streakEl.textContent = "Streak " + score.streak;
  }

  function choices() {
    if (modeSel.value === "majmin") return [["maj", "Major"], ["min", "Minor"]];
    return NUMBERS.map((n) => [n, n]);
  }

  function drawAnswers() {
    answersEl.replaceChildren();
    choices().forEach(([value, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "practice-ear-answer-button";
      button.dataset.value = value;
      button.textContent = label;
      button.addEventListener("click", () => answer(value, button));
      answersEl.appendChild(button);
    });
  }

  async function newQuestion() {
    keyboard.light([]);
    feedbackEl.textContent = "";
    feedbackEl.className = "practice-ear-feedback";
    drawAnswers();
    try {
      let chord, correctValue;
      if (modeSel.value === "number") {
        correctValue = pick(NUMBERS);
        const data = await K.api(progressionUrl, { key: keySel.value, numerals: correctValue });
        chord = data.chords[0];
      } else {
        correctValue = pick(["maj", "min"]);
        chord = await K.api(chordUrl, { root: pick(NOTES), quality: correctValue });
      }
      current = { answer: correctValue, chord: chord };
      answered = false;
      replayBtn.disabled = false;
      contextBtn.disabled = modeSel.value !== "number";
      K.playChord(chord.midi);
      feedbackEl.textContent = "Listen. Which one is it?";
    } catch (error) {
      feedbackEl.textContent = error.message;
    }
  }

  async function playContext() {
    if (!current || modeSel.value !== "number") return;
    const data = await K.api(progressionUrl, { key: keySel.value, numerals: "1" });
    K.stopAll();
    data.chords[0].midi.forEach((m) => K.playNote(m, 1.4, 0));
    current.chord.midi.forEach((m) => K.playNote(m, 1.7, 1.7));
  }

  function answer(value, button) {
    if (!current || answered) return;
    answered = true;
    const ok = value === current.answer;
    score.total += 1;
    if (ok) { score.right += 1; score.streak += 1; } else { score.streak = 0; }
    saveScore();
    showScore();

    answersEl.querySelectorAll("button").forEach((b) => {
      if (b.dataset.value === current.answer) b.classList.add("is-correct");
    });
    if (!ok) button.classList.add("is-wrong");

    const c = current.chord;
    feedbackEl.textContent = (ok ? "Correct! " : "Not quite. ") +
      "It was " + c.name + ": " + c.notes.join(" ") + ".";
    feedbackEl.className = "practice-ear-feedback " + (ok ? "is-good" : "is-bad");
    keyboard.light(c.midi);
  }

  function changeMode() {
    helpEl.textContent = HELP[modeSel.value];
    keySel.disabled = modeSel.value !== "number";
    drawAnswers();
    current = null;
    answered = true;
    replayBtn.disabled = true;
    contextBtn.disabled = true;
    feedbackEl.textContent = "";
    keyboard.light([]);
  }

  $("practice-ear-new").addEventListener("click", newQuestion);
  replayBtn.addEventListener("click", () => { if (current) K.playChord(current.chord.midi); });
  contextBtn.addEventListener("click", playContext);
  $("practice-ear-reset").addEventListener("click", () => {
    score = { right: 0, total: 0, streak: 0 };
    saveScore();
    showScore();
  });
  modeSel.addEventListener("change", changeMode);

  loadScore();
  showScore();
  changeMode();

  
  // =============== metronome ===============
  const startIn = $("practice-metro-start");
  const targetIn = $("practice-metro-target");
  const stepIn = $("practice-metro-step");
  const needIn = $("practice-metro-need");
  const bpmEl = $("practice-metro-bpm");
  const barEl = $("practice-metro-bar");
  const toggleBtn = $("practice-metro-toggle");
  const statusEl = $("practice-metro-status");

  let bpm = 60;
  let startBpm = 60;
  let correct = 0;          // clean plays at the current tempo
  let running = false;
  let nextTime = 0;
  let beatIndex = 0;
  let timerId = null;

  function readNumber(input, fallback, low, high) {
    const value = parseInt(input.value, 10);
    return Number.isFinite(value) ? Math.min(high, Math.max(low, value)) : fallback;
  }

  function click(time, accent) {
    const ctx = K.getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = accent ? 1500 : 1000;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.3, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.08);
  }

  function tick() {
    const ctx = K.getCtx();
    while (nextTime < ctx.currentTime + 0.15) {
      click(nextTime, beatIndex % 4 === 0);
      nextTime += 60 / bpm;
      beatIndex += 1;
    }
  }

  function startClick() {
    if (running) return;
    running = true;
    nextTime = K.getCtx().currentTime + 0.08;
    beatIndex = 0;
    timerId = setInterval(tick, 25);
    toggleBtn.textContent = "■ Stop";
  }

  function stopClick() {
    running = false;
    clearInterval(timerId);
    toggleBtn.textContent = "▶ Start";
  }

  function render(message) {
    const target = readNumber(targetIn, 100, 30, 260);
    const need = readNumber(needIn, 2, 1, 10);
    bpmEl.textContent = String(bpm);
    const progress = ((bpm - startBpm) / Math.max(1, target - startBpm)) * 100;
    barEl.style.width = Math.max(0, Math.min(100, progress)) + "%";
    statusEl.textContent = message ||
      ("Clean plays at " + bpm + " BPM: " + correct + " of " + need + ". Target " + target + " BPM.");
  }

  function restart() {
    startBpm = readNumber(startIn, 60, 20, 240);
    bpm = startBpm;
    correct = 0;
    render("Back at the start tempo. Play slowly enough to be correct.");
  }

  $("practice-metro-good").addEventListener("click", () => {
    const need = readNumber(needIn, 2, 1, 10);
    const step = readNumber(stepIn, 3, 1, 20);
    const target = readNumber(targetIn, 100, 30, 260);
    correct += 1;
    if (correct >= need) {
      correct = 0;
      if (bpm >= target) {
        render("You reached " + target + " BPM. Raise the target or try a new passage.");
        return;
      }
      bpm = Math.min(target, bpm + step);
      render("Tempo up: " + bpm + " BPM.");
    } else {
      render();
    }
  });

  $("practice-metro-miss").addEventListener("click", () => {
    correct = 0;
    render("Mistake at " + bpm + " BPM. Stay here or drop the tempo, then count clean plays again from zero.");
  });

  $("practice-metro-restart").addEventListener("click", restart);
  toggleBtn.addEventListener("click", () => (running ? stopClick() : startClick()));
  startIn.addEventListener("change", restart);
  window.addEventListener("pagehide", stopClick);

  restart();
})();