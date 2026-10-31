(() => {
  "use strict";

  const textarea = document.getElementById("codeInput");
  const gutter = document.getElementById("codeGutter");
  const tabs = document.getElementById("codeTabs");
  if (!textarea || !gutter) return;

  const renderLineNumbers = () => {
    const lineCount = textarea.value.split(/\r\n|\r|\n/).length;
    const fragment = document.createDocumentFragment();

    for (let line = 1; line <= lineCount; line += 1) {
      const number = document.createElement("span");
      number.className = "code-gutter-line";
      number.textContent = String(line);
      fragment.appendChild(number);
    }

    gutter.replaceChildren(fragment);
    gutter.scrollTop = textarea.scrollTop;
    gutter.setAttribute("data-line-count", String(lineCount));
  };

  textarea.addEventListener("input", renderLineNumbers);
  textarea.addEventListener("scroll", () => {
    gutter.scrollTop = textarea.scrollTop;
  }, { passive: true });

  if (tabs) {
    tabs.addEventListener("click", () => {
      requestAnimationFrame(renderLineNumbers);
    });
  }

  window.addEventListener("resize", renderLineNumbers, { passive: true });
  renderLineNumbers();
  requestAnimationFrame(renderLineNumbers);
})();
