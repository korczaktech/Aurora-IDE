(() => {
  "use strict";

  const API_BASE = "https://aurora-api-cc1d.onrender.com";
  const TOKEN_KEY = "aurora-access-token";
  const ACCOUNT_KEY = "aurora-account";
  const page = window.location.pathname.split("/").pop() || "index.html";
  const isEditor = page === "editor.html";

  if (isEditor) document.documentElement.style.visibility = "hidden";

  const readToken = () => {
    try {
      return window.localStorage.getItem(TOKEN_KEY) || window.sessionStorage.getItem(TOKEN_KEY);
    } catch (_) {
      return null;
    }
  };

  const saveSession = (token, account, remember) => {
    const target = remember ? window.localStorage : window.sessionStorage;
    const other = remember ? window.sessionStorage : window.localStorage;
    other.removeItem(TOKEN_KEY);
    other.removeItem(ACCOUNT_KEY);
    target.setItem(TOKEN_KEY, token);
    target.setItem(ACCOUNT_KEY, JSON.stringify(account));
  };

  const clearSession = () => {
    try {
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(ACCOUNT_KEY);
      window.sessionStorage.removeItem(TOKEN_KEY);
      window.sessionStorage.removeItem(ACCOUNT_KEY);
    } catch (_) {}
  };

  async function api(path, options = {}) {
    let response;
    try {
      response = await fetch(API_BASE + path, {
        ...options,
        headers: {
          Accept: "application/json",
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...(options.token ? { Authorization: "Bearer " + options.token } : {}),
          ...options.headers
        }
      });
    } catch (_) {
      throw new Error("Não foi possível conectar ao serviço Aurora. Tente novamente em instantes.");
    }

    if (response.status === 204) return null;
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const messages = {
        400: "Confira os dados informados.",
        401: "E-mail ou senha inválidos.",
        403: "Esta conta não possui acesso.",
        429: "Muitas tentativas. Aguarde um pouco e tente novamente.",
        503: "O serviço de contas está temporariamente indisponível."
      };
      throw new Error(payload.error || messages[response.status] || "Não foi possível concluir a operação.");
    }
    return payload;
  }

  function statusElement(form) {
    let status = form.querySelector("[data-auth-status]");
    if (!status) {
      status = document.createElement("p");
      status.className = "auth-status";
      status.dataset.authStatus = "";
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      form.appendChild(status);
    }
    return status;
  }

  function showStatus(form, message, kind = "error") {
    const status = statusElement(form);
    status.textContent = message;
    status.dataset.kind = kind;
    status.hidden = !message;
  }

  function setBusy(form, busy, label) {
    const button = form.querySelector(".auth-submit");
    if (!button) return;
    if (busy) {
      button.dataset.originalLabel = button.textContent;
      button.textContent = label;
    } else {
      button.textContent = button.dataset.originalLabel || button.textContent;
    }
    button.disabled = busy;
    button.setAttribute("aria-busy", String(busy));
  }

  function redirectAfterLogin() {
    const next = new URLSearchParams(window.location.search).get("next");
    window.location.replace(next === "editor.html" ? "editor.html" : "index.html");
  }

  async function handleLogin(form) {
    const data = new FormData(form);
    const email = String(data.get("email") || "").trim();
    const password = String(data.get("password") || "");
    if (!email || !password) {
      showStatus(form, "Informe seu e-mail e sua senha.");
      return;
    }

    setBusy(form, true, "Entrando...");
    showStatus(form, "");
    try {
      const result = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      if (!result?.access_token || !result?.account) {
        throw new Error("O servidor retornou uma resposta de autenticação inválida.");
      }
      saveSession(result.access_token, result.account, data.get("remember") === "on");
      redirectAfterLogin();
    } catch (error) {
      showStatus(form, error.message);
      setBusy(form, false);
    }
  }

  async function handleRegister(form) {
    const data = new FormData(form);
    const name = String(data.get("name") || "").trim();
    const email = String(data.get("email") || "").trim();
    const password = String(data.get("password") || "");
    const confirmation = String(data.get("password-confirm") || "");

    if (name.length < 2) return showStatus(form, "Informe seu nome completo.");
    if (!email) return showStatus(form, "Informe um endereço de e-mail válido.");
    if (new TextEncoder().encode(password).length < 8) return showStatus(form, "A senha deve ter pelo menos 8 bytes.");
    if (new TextEncoder().encode(password).length > 72) return showStatus(form, "A senha deve ter no máximo 72 bytes.");
    if (password !== confirmation) return showStatus(form, "As senhas não coincidem.");

    setBusy(form, true, "Criando conta...");
    showStatus(form, "");
    try {
      const result = await api("/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password })
      });
      if (!result?.access_token || !result?.account) {
        throw new Error("O servidor retornou uma resposta de cadastro inválida.");
      }
      saveSession(result.access_token, result.account, true);
      redirectAfterLogin();
    } catch (error) {
      showStatus(form, error.message);
      setBusy(form, false);
    }
  }

  async function currentAccount(token) {
    const result = await api("/auth/me", { method: "GET", token });
    if (!result?.account) throw new Error("Sessão inválida.");
    return result.account;
  }

  async function initializeHome() {
    const loginLink = document.getElementById("loginLink");
    const createLink = document.getElementById("createLink");
    const accountArea = document.getElementById("accountArea");
    const accountName = document.getElementById("accountName");
    const avatar = document.getElementById("accountAvatar");
    const initial = document.getElementById("avatarInitial");
    const token = readToken();
    if (!token || !accountArea) return;

    try {
      const account = await currentAccount(token);
      if (loginLink) loginLink.hidden = true;
      if (createLink) createLink.hidden = true;
      accountArea.hidden = false;
      accountArea.style.display = "flex";
      if (accountName) accountName.textContent = account.name;
      if (initial) initial.textContent = (account.name || "A").trim().charAt(0).toUpperCase();
      if (avatar) {
        avatar.title = "Sair da conta";
        avatar.setAttribute("aria-label", "Sair da conta");
        avatar.addEventListener("click", async () => {
          avatar.disabled = true;
          try { await api("/auth/logout", { method: "POST", token }); } catch (_) {}
          clearSession();
          window.location.reload();
        }, { once: true });
      }
    } catch (_) {
      clearSession();
    }
  }

  async function protectEditor() {
    const token = readToken();
    if (!token) {
      window.location.replace("entrar.html?next=editor.html");
      return;
    }
    try {
      await currentAccount(token);
      document.documentElement.style.visibility = "visible";
    } catch (_) {
      clearSession();
      window.location.replace("entrar.html?next=editor.html");
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const form = document.querySelector(".auth-form");
    if (form && page === "entrar.html") {
      form.addEventListener("submit", event => {
        event.preventDefault();
        handleLogin(form);
      });
    } else if (form && page === "criar-conta.html") {
      form.addEventListener("submit", event => {
        event.preventDefault();
        handleRegister(form);
      });
    }

    if (page === "index.html" || page === "") initializeHome();
    if (isEditor) protectEditor();
  });
})();