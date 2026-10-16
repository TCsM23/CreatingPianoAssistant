(function () {
  "use strict";
  const root = document.documentElement;
  const button = document.getElementById("site-theme-toggle");
  if (!button) return;

  function show(theme) {
    root.dataset.theme = theme;
    const light = theme === "light";
    button.setAttribute("aria-pressed", String(light));
    button.setAttribute("aria-label", light ? "Switch to dark mode" : "Switch to light mode");
  }

  show(root.dataset.theme === "light" ? "light" : "dark");

  button.addEventListener("click", () => {
    const next = root.dataset.theme === "light" ? "dark" : "light";
    show(next);
    try {
      localStorage.setItem("tcsmusic-theme", next);
    } catch (e) {
      /* private window: the choice just won't be remembered */
    }
  });
})();