(() => {
  const form = document.getElementById("loginForm");
  const email = document.getElementById("email");
  const password = document.getElementById("password");
  const message = document.getElementById("formMessage");
  const toggle = document.getElementById("togglePassword");

  function notice(text, type = "") {
    message.textContent = text;
    message.className = "form-message" + (type ? " " + type : "");
  }

  toggle.addEventListener("click", () => {
    const visible = password.type === "password";
    password.type = visible ? "text" : "password";
    toggle.setAttribute("aria-pressed", String(visible));
    toggle.setAttribute("aria-label", visible ? "Ocultar senha" : "Mostrar senha");
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!email.value.trim() || !email.validity.valid) {
      notice("Informe um endereço de e-mail válido.", "error");
      email.focus();
      return;
    }
    if (password.value.length < 8) {
      notice("A senha precisa ter pelo menos 8 caracteres.", "error");
      password.focus();
      return;
    }
    notice("A interface está pronta. A autenticação será conectada ao serviço Aurora nas próximas etapas.");
  });

  document.getElementById("forgotPassword").addEventListener("click", () => {
    notice("A recuperação de acesso será disponibilizada quando o serviço de autenticação estiver integrado.");
  });

  document.getElementById("createAccount").addEventListener("click", () => {
    notice("A criação de contas será ativada junto ao sistema de autenticação.");
  });
})();