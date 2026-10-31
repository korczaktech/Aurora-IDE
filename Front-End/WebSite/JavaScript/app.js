(() => {
  const toast = document.getElementById("toast");
  const overlay = document.getElementById("commandOverlay");
  const commandInput = document.getElementById("commandInput");
  const sidePanel = document.getElementById("sidePanel");
  const panelTitle = document.getElementById("panelTitle");
  let toastTimer;

  function notify(message) {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
  }

  function openCommands() {
    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden", "false");
    commandInput.value = "";
    commandInput.focus();
  }

  function closeCommands() {
    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden", "true");
  }

  document.getElementById("commandButton").addEventListener("click", openCommands);
  document.getElementById("collapsePanel").addEventListener("click", () => {
    sidePanel.classList.toggle("collapsed");
  });

  document.querySelectorAll(".activity[data-panel]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".activity").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      const names = { explorer: "EXPLORADOR", search: "PESQUISA", source: "CONTROLE DE VERSÃO" };
      panelTitle.textContent = names[button.dataset.panel] || "AURORA";
      if (button.dataset.panel !== "explorer") {
        notify("Painel em desenvolvimento: " + names[button.dataset.panel].toLowerCase());
      }
      sidePanel.classList.remove("collapsed");
    });
  });

  document.querySelectorAll(".tree-row.file").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tree-row.file").forEach((item) => item.classList.remove("selected"));
      button.classList.add("selected");
      notify("Arquivo aberto: " + button.dataset.file);
    });
  });

  document.getElementById("openProject").addEventListener("click", () => {
    sidePanel.classList.remove("collapsed");
    notify("Projeto Aurora-IDE pronto para explorar.");
  });

  document.getElementById("learnMore").addEventListener("click", () => {
    notify("Aurora IDE — uma plataforma de desenvolvimento em construção.");
  });

  document.querySelectorAll("[data-command]").forEach((button) => {
    button.addEventListener("click", () => {
      const command = button.dataset.command;
      closeCommands();
      if (command === "explorer") {
        sidePanel.classList.remove("collapsed");
        document.querySelector('[data-panel="explorer"]').click();
      } else if (command === "welcome") {
        notify("Você já está na tela inicial.");
      } else {
        notify("Aurora IDE — versão de demonstração 0.0.1.");
      }
    });
  });

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeCommands();
  });

  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openCommands();
    }
    if (event.key === "Escape") closeCommands();
  });
})();
