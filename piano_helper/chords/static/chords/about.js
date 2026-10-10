(function () {
  var form = document.getElementById("about-form");
  if (!form || !window.emailjs) return;

  var button = document.getElementById("about-submit");
  var status = document.getElementById("about-status");

  window.emailjs.init({ publicKey: form.dataset.key });

  function say(text, kind) {
    status.textContent = text;
    status.dataset.kind = kind || "";
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    button.disabled = true;
    say("Sending…");

    window.emailjs.sendForm(form.dataset.service, form.dataset.template, form).then(
      function () {
        form.reset();
        button.disabled = false;
        say("Message sent. Thank you!", "ok");
      },
      function () {
        button.disabled = false;
        say("Could not send. Please use one of the direct channels instead.", "error");
      }
    );
  });
})();
