(() => {
  const rail = document.getElementById("leftRail");
  const workspace = document.querySelector(".workspace");
  const collapseButton = document.getElementById("railToggle");
  const expandButton = document.getElementById("railReopen");

  if (!rail || !workspace || !collapseButton || !expandButton) return;

  const setCollapsed = (collapsed) => {
    rail.classList.toggle("is-collapsed", collapsed);
    workspace.classList.toggle("rail-collapsed", collapsed);

    collapseButton.setAttribute("aria-expanded", String(!collapsed));
    collapseButton.setAttribute(
      "aria-label",
      collapsed ? "Recolher barra lateral" : "Recolher barra lateral"
    );
    collapseButton.title = "Recolher barra lateral";

    expandButton.setAttribute("aria-expanded", String(collapsed));
    expandButton.setAttribute("aria-label", "Expandir barra lateral");
    expandButton.title = "Expandir barra lateral";
  };

  collapseButton.addEventListener("click", () => setCollapsed(true));
  expandButton.addEventListener("click", () => setCollapsed(false));
})();
