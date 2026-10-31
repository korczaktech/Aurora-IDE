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
        const menu = document.createElement("div");
        menu.className = "account-menu";
        menu.id = "accountMenu";
        menu.hidden = true;
        menu.setAttribute("role", "menu");
        menu.innerHTML = `
          <div class="account-menu-heading">
            <span class="account-menu-avatar">${(account.name || "A").trim().charAt(0).toUpperCase()}</span>
            <span class="account-menu-identity"><strong>${String(account.name || "Conta Aurora").replace(/[&<>"]/g, "")}</strong><small>Conta Korczak</small></span>
          </div>
          <div class="account-menu-divider"></div>
          <a class="account-menu-item" role="menuitem" href="https://vault.korczaktech.com.br/">
            <span class="account-menu-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M4 3.75h16a1.75 1.75 0 0 1 1.75 1.75v13A1.75 1.75 0 0 1 20 20.25H4A1.75 1.75 0 0 1 2.25 18.5v-13A1.75 1.75 0 0 1 4 3.75Z"/><path d="M6.5 6.5h11v11h-11z"/><circle cx="12" cy="12" r="2.1"/><path d="M12 8.1v1.7m0 4.4v1.7m3.9-3.9h-1.7m-4.4 0H8.1"/></svg></span>
            <span>Korczak Vault</span><span class="account-menu-arrow">↗</span>
          </a>
          <a class="account-menu-item" role="menuitem" href="https://site.korczaktech.com.br/#/contato">
            <span class="account-menu-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M4 5.25h16A1.75 1.75 0 0 1 21.75 7v9A1.75 1.75 0 0 1 20 17.75H10l-5.5 3v-3H4A1.75 1.75 0 0 1 2.25 16V7A1.75 1.75 0 0 1 4 5.25Z"/><path d="m12 7.8 1.25 2.55 2.82.41-2.04 1.99.48 2.81L12 14.23l-2.51 1.33.48-2.81-2.04-1.99 2.82-.41L12 7.8Z"/></svg></span>
            <span>FeedBack</span><span class="account-menu-arrow">↗</span>
          </a>
          <a class="account-menu-item" role="menuitem" href="planos.html">
            <span class="account-menu-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M5 3.75h14A1.75 1.75 0 0 1 20.75 5.5v13A1.75 1.75 0 0 1 19 20.25H5A1.75 1.75 0 0 1 3.25 18.5v-13A1.75 1.75 0 0 1 5 3.75Z"/><path d="m7 8 1.55 1.55L11 7.1m2 1.15h3.5M7 14h10m-10 3h7"/><path d="m12 2 1.05 1.4 1.7-.12.4 1.65 1.55.7-.7 1.55"/></svg></span>
            <span>Planos do EDS</span><span class="account-menu-arrow">↗</span>
          </a>
          <button class="account-menu-item" type="button" role="menuitem" data-account-profile>
            <span class="account-menu-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><circle cx="10" cy="8" r="3.25"/><path d="M3.75 19.25a6.25 6.25 0 0 1 12.5 0"/><path d="m18.2 12.1.7 1.25 1.45.25-1.02 1 .24 1.45-1.37-.68-1.3.68.25-1.45-1.05-1 1.46-.25.64-1.25Z"/></svg></span>
            <span>Meu perfil</span><span class="account-menu-arrow">→</span>
          </button>
        `;
        accountArea.appendChild(menu);
        avatar.title = "Abrir menu da conta";
        avatar.setAttribute("aria-label", "Abrir menu da conta");
        avatar.setAttribute("aria-haspopup", "menu");
        avatar.setAttribute("aria-expanded", "false");
        const closeMenu = () => {
          menu.hidden = true;
          avatar.setAttribute("aria-expanded", "false");
        };
        avatar.addEventListener("click", event => {
          event.stopPropagation();
          const opening = menu.hidden;
          menu.hidden = !opening;
          avatar.setAttribute("aria-expanded", String(opening));
        });
        menu.addEventListener("click", event => {
          if (event.target.closest("[data-account-profile]")) {
            closeMenu();
            document.querySelector('.rail-item[data-page="configuracoes"]')?.click();
          }
        });
        document.addEventListener("click", event => {
          if (!accountArea.contains(event.target)) closeMenu();
        });
        document.addEventListener("keydown", event => {
          if (event.key === "Escape") {
            closeMenu();
            avatar.focus();
          }
        });
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