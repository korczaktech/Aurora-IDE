(() => {
  const rail = document.getElementById("leftRail");
  const toggle = document.getElementById("railToggle");

  toggle.addEventListener("click", () => {
    const collapsed = rail.classList.toggle("is-collapsed");
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.setAttribute("aria-label", collapsed ? "Expandir barra lateral" : "Recolher barra lateral");
    toggle.title = collapsed ? "Expandir barra lateral" : "Recolher barra lateral";
  });

  document.querySelectorAll(".rail-item").forEach((item) => {
    item.addEventListener("click", () => {
      document.querySelectorAll(".rail-item").forEach((entry) => entry.classList.remove("is-active"));
      item.classList.add("is-active");
    });
  });

  // Molduras de perfil são aplicadas somente quando uma conta estiver autenticada.
  // Evento 1: moldura bronze | Evento 2: prata | Evento 3: dourado
  // Evento 4: vermelho | Evento 5: roxo | Evento 6: verde esmeralda
  // Evento 7: libera todas as molduras anteriores para a conta.
  const frameByEvent = {
    1: "bronze",
    2: "prata",
    3: "dourado",
    4: "vermelho",
    5: "roxo",
    6: "esmeralda"
  };
  const unlockedFrames = new Set();
  const accountAvatar = document.getElementById("accountAvatar");

  function handleProfileEvent(event) {
    const eventNumber = Number(event.detail?.event);
    if (eventNumber === 7) {
      Object.values(frameByEvent).forEach((frame) => unlockedFrames.add(frame));
      document.dispatchEvent(new CustomEvent("aurora:profile-frames-unlocked", {
        detail: { frames: [...unlockedFrames] }
      }));
      return;
    }
    const frame = frameByEvent[eventNumber];
    if (!frame) return;
    unlockedFrames.add(frame);
    if (accountAvatar && !accountAvatar.hidden) accountAvatar.dataset.frame = frame;
    document.dispatchEvent(new CustomEvent("aurora:profile-frame-unlocked", {
      detail: { event: eventNumber, frame }
    }));
  }

  for (let eventNumber = 1; eventNumber <= 7; eventNumber += 1) {
    document.addEventListener(`aurora:event-${eventNumber}`, handleProfileEvent);
  }
  document.addEventListener("aurora:profile-event", handleProfileEvent);

  // A área de conta permanece oculta até a autenticação real ser integrada.
})();