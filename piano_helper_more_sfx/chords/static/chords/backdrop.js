(function () {
  "use strict";
  const backdrop = document.querySelector(".site-backdrop");
  if (!backdrop) return;

  function melody(staff, count, duration) {
    let k = 3 + Math.floor(Math.random() * 3);          // start near the middle of the staff
    const steps = [-3, -2, -1, 1, 2, 3];
    for (let i = 0; i < count; i++) {
      k = Math.max(-1, Math.min(9, k + steps[Math.floor(Math.random() * steps.length)]));
      const note = document.createElement("span");
      note.className = "site-backdrop-note" + (k >= 4 ? " is-down" : "");
      note.style.setProperty("--k", k);
      note.style.setProperty("--dur", duration + "s");
      note.style.setProperty("--delay", (-i * duration / count) + "s");
      note.style.setProperty("--x", (i / count) * 100 + "vw");
      staff.appendChild(note);
    }
  }

  melody(backdrop.querySelector(".site-backdrop-staff-upper"), 10, 70);
  melody(backdrop.querySelector(".site-backdrop-staff-lower"), 5, 90);

  document.addEventListener("pianokit:play", () => {
    backdrop.classList.remove("is-ringing");
    void backdrop.offsetWidth;                            // restart the animation
    backdrop.classList.add("is-ringing");
  });
})();