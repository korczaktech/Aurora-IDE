(() => {
  "use strict";

  const editor = window.AuroraEditor;
  if (!editor?.textarea) return;

  const textarea = editor.textarea;
  const doc = textarea.ownerDocument;
  const selections = new Map();
  const popup = doc.createElement("div");
  popup.className = "aurora-intellisense";
  popup.id = "auroraIntellisense";
  popup.setAttribute("role", "listbox");
  popup.setAttribute("aria-label", "Sugestões de código");
  popup.hidden = true;
  doc.body.append(popup);

  const dictionaries = {
    javascript: ["addEventListener", "Array", "async", "await", "Boolean", "break", "case", "catch", "class", "const", "console", "Date", "document", "else", "Error", "export", "false", "fetch", "for", "forEach", "function", "if", "import", "in", "JSON", "let", "Math", "new", "null", "Number", "Object", "Promise", "querySelector", "return", "setTimeout", "String", "this", "throw", "true", "try", "undefined", "window", "while"],
    html: ["article", "aside", "button", "div", "footer", "form", "h1", "h2", "head", "header", "img", "input", "label", "li", "link", "main", "meta", "nav", "ol", "option", "p", "script", "section", "select", "span", "style", "table", "tbody", "td", "textarea", "th", "thead", "title", "tr", "ul"],
    css: ["align-items", "animation", "background", "background-color", "border", "border-radius", "box-sizing", "color", "display", "flex", "font-family", "font-size", "font-weight", "gap", "grid", "height", "justify-content", "margin", "max-width", "min-height", "opacity", "overflow", "padding", "position", "transform", "transition", "width", "z-index"]
  };

  function language() {
    const name = editor.activeFile || "";
    if (/\.html?$/i.test(name)) return "html";
    if (/\.css$/i.test(name)) return "css";
    return "javascript";
  }

  function lineBounds(value, position) {
    const start = value.lastIndexOf("\n", Math.max(0, position - 1)) + 1;
    const found = value.indexOf("\n", position);
    return { start, end: found < 0 ? value.length : found };
  }

  function replaceSelection(text, caret) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    textarea.setRangeText(text, start, end, "end");
    const next = caret == null ? start + text.length : caret;
    textarea.setSelectionRange(next, next);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.focus();
  }

  function selectLine() {
    const bounds = lineBounds(textarea.value, textarea.selectionStart);
    const end = bounds.end < textarea.value.length ? bounds.end + 1 : bounds.end;
    textarea.focus();
    textarea.setSelectionRange(bounds.start, end);
  }

  function selectWord() {
    const value = textarea.value;
    const pos = textarea.selectionStart;
    const left = value.slice(0, pos).match(/[A-Za-z_$][\w$]*$/);
    const right = value.slice(pos).match(/^[\w$]+/);
    const start = pos - (left?.[0].length || 0);
    const end = pos + (right?.[0].length || 0);
    if (start !== end) textarea.setSelectionRange(start, end);
  }

  function nextOccurrence() {
    const value = textarea.value;
    const selected = value.slice(textarea.selectionStart, textarea.selectionEnd);
    if (!selected) { selectWord(); return; }
    const found = value.indexOf(selected, textarea.selectionEnd);
    const start = found >= 0 ? found : value.indexOf(selected);
    if (start >= 0) textarea.setSelectionRange(start, start + selected.length);
  }

  function moveLine(direction) {
    const value = textarea.value;
    const bounds = lineBounds(value, textarea.selectionStart);
    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
    const offsetStart = Math.max(0, selectionStart - bounds.start);
    const offsetEnd = Math.max(0, selectionEnd - bounds.start);
    const line = value.slice(bounds.start, bounds.end);

    let replaceStart, replaceEnd, replacement, newLineStart;
    if (direction < 0) {
      if (bounds.start === 0) return;
      const previousStart = value.lastIndexOf("\n", bounds.start - 2) + 1;
      const previousEnd = bounds.start - 1;
      const previous = value.slice(previousStart, previousEnd);
      replaceStart = previousStart;
      replaceEnd = bounds.end;
      replacement = line + "\n" + previous;
      newLineStart = previousStart;
    } else {
      if (bounds.end === value.length) return;
      const nextStart = bounds.end + 1;
      const nextBreak = value.indexOf("\n", nextStart);
      const nextEnd = nextBreak < 0 ? value.length : nextBreak;
      const next = value.slice(nextStart, nextEnd);
      replaceStart = bounds.start;
      replaceEnd = nextEnd;
      replacement = next + "\n" + line;
      newLineStart = bounds.start + next.length + 1;
    }

    textarea.setRangeText(replacement, replaceStart, replaceEnd, "preserve");
    const start = Math.min(textarea.value.length, newLineStart + offsetStart);
    const end = Math.min(textarea.value.length, newLineStart + offsetEnd);
    textarea.setSelectionRange(start, end);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.focus();
  }

  function duplicateLine() {
    const bounds = lineBounds(textarea.value, textarea.selectionStart);
    const line = textarea.value.slice(bounds.start, bounds.end);
    const insertion = bounds.end < textarea.value.length ? bounds.end : bounds.end;
    const prefix = insertion < textarea.value.length ? "\n" : "\n";
    replaceSelectionAt(insertion, insertion, prefix + line);
  }

  function replaceSelectionAt(start, end, text) {
    textarea.setRangeText(text, start, end, "end");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.focus();
  }

  function smartHome() {
    const bounds = lineBounds(textarea.value, textarea.selectionStart);
    const text = textarea.value.slice(bounds.start, bounds.end);
    const first = bounds.start + (text.match(/^\s*/) || [""])[0].length;
    const target = textarea.selectionStart === first ? bounds.start : first;
    textarea.setSelectionRange(target, target);
  }

  function suggestions() {
    const value = textarea.value;
    const cursor = textarea.selectionStart;
    if (cursor !== textarea.selectionEnd) return [];
    const before = value.slice(0, cursor);
    const match = before.match(/([A-Za-z_$][\w$-]{1,})$/);
    if (!match) return [];
    const prefix = match[1];
    const lang = language();
    const pool = [...(dictionaries[lang] || dictionaries.javascript)];
    const allFiles = editor.files || {};
    if (lang === "javascript") {
      const source = String(allFiles[editor.activeFile] || value);
      const declarationPattern = /\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g;
      let declaration;
      while ((declaration = declarationPattern.exec(source))) pool.push(declaration[1]);
    } else if (lang === "css") {
      Object.entries(allFiles).filter(([name]) => /\.css$/i.test(name)).forEach(([, source]) => {
        const propertyPattern = /(?:^|[;{]\s*)([a-z-]{2,})\s*:/gim;
        let property;
        while ((property = propertyPattern.exec(String(source)))) pool.push(property[1]);
      });
    } else {
      Object.entries(allFiles).filter(([name]) => /\.html?$/i.test(name)).forEach(([, source]) => {
        const tagPattern = /<([a-z][a-z0-9-]*)/gi;
        let tag;
        while ((tag = tagPattern.exec(String(source)))) pool.push(tag[1]);
      });
    }
    const lower = prefix.toLowerCase();
    const unique = [...new Set(pool)];
    const items = unique.filter(item => item.toLowerCase().startsWith(lower) && item !== prefix).slice(0, 7);
    if (!items.length) return [];
    return items.map(label => ({ label, start: cursor - prefix.length, end: cursor }));
  }

  let current = [];
  let selected = 0;

  function hide() {
    popup.hidden = true;
    popup.replaceChildren();
    current = [];
    textarea.removeAttribute("aria-activedescendant");
    textarea.setAttribute("aria-expanded", "false");
  }

  function positionPopup() {
    const rect = textarea.getBoundingClientRect();
    const valueBefore = textarea.value.slice(0, textarea.selectionStart);
    const lines = valueBefore.split("\n");
    const style = getComputedStyle(textarea);
    const lineHeight = parseFloat(style.lineHeight) || 22;
    const fontSize = parseFloat(style.fontSize) || 13;
    const charWidth = fontSize * 0.61;
    const line = lines.length - 1;
    const column = lines[lines.length - 1].length;
    const left = Math.min(rect.right - 230, rect.left + 12 + column * charWidth - textarea.scrollLeft);
    const top = Math.min(rect.bottom - 12, rect.top + 8 + (line + 1) * lineHeight - textarea.scrollTop);
    popup.style.left = Math.max(8, left) + "px";
    popup.style.top = Math.max(8, top) + "px";
  }

  function render(items) {
    current = items;
    selected = 0;
    if (!items.length) { hide(); return; }
    popup.replaceChildren();
    items.forEach((item, index) => {
      const option = doc.createElement("button");
      option.type = "button";
      option.className = "aurora-intellisense-option";
      option.id = "aurora-suggestion-" + index;
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", String(index === selected));
      const label = doc.createElement("span");
      label.textContent = item.label;
      const kind = doc.createElement("small");
      kind.textContent = language().toUpperCase();
      option.append(label, kind);
      option.addEventListener("mousedown", event => {
        event.preventDefault();
        accept(index);
      });
      popup.append(option);
    });
    popup.hidden = false;
    textarea.setAttribute("aria-controls", popup.id);
    textarea.setAttribute("aria-expanded", "true");
    textarea.setAttribute("aria-activedescendant", "aurora-suggestion-0");
    positionPopup();
  }

  function highlightSelected() {
    [...popup.children].forEach((item, index) => {
      item.classList.toggle("is-active", index === selected);
      item.setAttribute("aria-selected", String(index === selected));
    });
    textarea.setAttribute("aria-activedescendant", "aurora-suggestion-" + selected);
  }

  function accept(index = selected) {
    const item = current[index];
    if (!item) return;
    textarea.setRangeText(item.label, item.start, item.end, "end");
    hide();
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.focus();
  }

  textarea.addEventListener("input", () => render(suggestions()));
  textarea.addEventListener("click", () => hide());
  textarea.addEventListener("blur", () => setTimeout(hide, 120));
  textarea.addEventListener("scroll", positionPopup, { passive: true });
  textarea.addEventListener("keydown", event => {
    if (!popup.hidden && current.length) {
      if (event.key === "ArrowDown") { event.preventDefault(); selected = (selected + 1) % current.length; highlightSelected(); return; }
      if (event.key === "ArrowUp") { event.preventDefault(); selected = (selected - 1 + current.length) % current.length; highlightSelected(); return; }
      if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); accept(); return; }
      if (event.key === "Escape") { event.preventDefault(); hide(); return; }
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) hide();
    }
    if (event.defaultPrevented || !(event.ctrlKey || event.metaKey) || event.altKey) {
      if (event.key === "Home" && !event.ctrlKey && !event.metaKey && !event.shiftKey) { event.preventDefault(); smartHome(); }
      return;
    }
    const key = event.key.toLowerCase();
    if (key === "l") { event.preventDefault(); selectLine(); }
    else if (key === "d") { event.preventDefault(); nextOccurrence(); }
    else if (key === "g") { event.preventDefault(); textarea.setSelectionRange(0, 0); }
  }, true);

  doc.addEventListener("keydown", event => {
    if (doc.activeElement !== textarea) return;
    if (event.altKey && event.shiftKey && event.key === "ArrowDown") { event.preventDefault(); duplicateLine(); }
    else if (event.altKey && !event.shiftKey && event.key === "ArrowUp") { event.preventDefault(); moveLine(-1); }
    else if (event.altKey && !event.shiftKey && event.key === "ArrowDown") { event.preventDefault(); moveLine(1); }
    else if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "k") {
      event.preventDefault();
      const bounds = lineBounds(textarea.value, textarea.selectionStart);
      const end = bounds.end < textarea.value.length ? bounds.end + 1 : bounds.end;
      textarea.setRangeText("", bounds.start, end, "end");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });

  const originalOpenFile = editor.openFile.bind(editor);
  editor.openFile = name => {
    if (editor.activeFile) selections.set(editor.activeFile, {
      start: textarea.selectionStart, end: textarea.selectionEnd,
      direction: textarea.selectionDirection, scrollTop: textarea.scrollTop, scrollLeft: textarea.scrollLeft
    });
    originalOpenFile(name);
    const saved = selections.get(name);
    if (saved) {
      const length = textarea.value.length;
      textarea.setSelectionRange(Math.min(saved.start, length), Math.min(saved.end, length), saved.direction);
      textarea.scrollTop = saved.scrollTop;
      textarea.scrollLeft = saved.scrollLeft;
    } else textarea.setSelectionRange(0, 0);
    textarea.focus();
  };

  window.AuroraEditorIntelligence = {
    selectLine, selectWord, nextOccurrence, moveLine, duplicateLine, hideAutocomplete: hide,
    get suggestions() { return current.map(item => item.label); },
    acceptAutocomplete: accept
  };
})();