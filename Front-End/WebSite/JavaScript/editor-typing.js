(() => {
  "use strict";

  const editor = window.AuroraEditor;
  const textarea = editor?.textarea;
  if (!textarea) return;

  const INDENT = "  ";
  const pairs = { "(": ")", "[": "]", "{": "}", '"': '"', "'": "'" };
  pairs[String.fromCharCode(96)] = String.fromCharCode(96);
  const closers = new Set([")", "]", "}"]);

  function emitInput() {
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function lineStartAt(value, position) {
    return value.lastIndexOf("\n", Math.max(0, position - 1)) + 1;
  }

  function lineEndAt(value, position) {
    const end = value.indexOf("\n", position);
    return end < 0 ? value.length : end;
  }

  function indentOf(line) {
    return (line.match(/^[ \t]*/) || [""])[0];
  }

  function replace(start, end, text, caret) {
    textarea.setRangeText(text, start, end, "end");
    const next = caret == null ? start + text.length : caret;
    textarea.setSelectionRange(next, next);
    emitInput();
  }

  function changeSelectionIndent(remove) {
    const value = textarea.value;
    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
    const start = lineStartAt(value, selectionStart);
    const lastPosition = selectionEnd > start && value[selectionEnd - 1] === "\n"
      ? selectionEnd - 1
      : selectionEnd;
    const end = lineEndAt(value, lastPosition);
    const lines = value.slice(start, end).split("\n");
    let totalDelta = 0;
    let firstDelta = 0;
    const updated = lines.map((line, index) => {
      let next = line;
      let delta = 0;
      if (remove) {
        if (next.startsWith(INDENT)) { next = next.slice(INDENT.length); delta = -INDENT.length; }
        else if (next.startsWith("\t")) { next = next.slice(1); delta = -1; }
        else if (next.startsWith(" ")) { next = next.slice(1); delta = -1; }
      } else {
        next = INDENT + next;
        delta = INDENT.length;
      }
      if (index === 0) firstDelta = delta;
      totalDelta += delta;
      return next;
    }).join("\n");
    textarea.setRangeText(updated, start, end, "end");
    const nextStart = Math.max(start, Math.min(textarea.value.length, selectionStart + firstDelta));
    const nextEnd = Math.max(nextStart, Math.min(textarea.value.length, selectionEnd + totalDelta));
    textarea.setSelectionRange(nextStart, nextEnd);
    emitInput();
  }

  function language() {
    const name = editor.activeFile || "";
    if (/\.html?$/i.test(name)) return "html";
    if (/\.css$/i.test(name)) return "css";
    return "javascript";
  }

  function shouldIncreaseIndent(before, lang) {
    const trimmed = before.trimEnd();
    if (/[{[(]$/.test(trimmed)) return true;
    if (lang === "html") {
      const tag = trimmed.match(/<([a-z][\w:-]*)\b[^>]*>$/i);
      if (tag && !/\/\s*>$/.test(trimmed) && !/^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i.test(tag[1])) return true;
    }
    return false;
  }

  function handleEnter() {
    const value = textarea.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const lineStart = lineStartAt(value, start);
    const lineEnd = lineEndAt(value, start);
    const line = value.slice(lineStart, lineEnd);
    const indent = indentOf(line);
    const before = value.slice(lineStart, start);
    const after = value.slice(end, lineEnd);
    const lang = language();
    const previous = value[start - 1];
    const next = value[end];
    const matchingPair = pairs[previous] === next && ["(", "[", "{"].includes(previous);
    const trimmedBefore = before.trimEnd();
    const trimmedAfter = after.trimStart();
    const openingTag = lang === "html" ? trimmedBefore.match(/<([a-z][\w:-]*)\b[^>]*>$/i) : null;
    const closingTag = lang === "html" ? trimmedAfter.match(/^<\/([a-z][\w:-]*)\s*>/i) : null;
    const matchingHtmlTags = Boolean(openingTag && closingTag && openingTag[1].toLowerCase() === closingTag[1].toLowerCase());
    const closingAhead = lang === "html" ? /^<\//.test(trimmedAfter) : /^\}/.test(trimmedAfter);
    const increase = shouldIncreaseIndent(before, lang);
    let innerIndent = increase ? indent + INDENT : indent;
    if (closingAhead && !increase) innerIndent = indent.slice(0, Math.max(0, indent.length - INDENT.length));

    if (matchingPair || matchingHtmlTags) {
      const insertion = "\n" + innerIndent + "\n" + indent;
      replace(start, end, insertion, start + 1 + innerIndent.length);
      return;
    }
    replace(start, end, "\n" + innerIndent);
  }

  function handleClosingBrace() {
    const value = textarea.value;
    const start = textarea.selectionStart;
    if (start !== textarea.selectionEnd) return false;
    const lineStart = lineStartAt(value, start);
    const before = value.slice(lineStart, start);
    if (!/^\s*$/.test(before) || !before.length) return false;
    const currentIndent = indentOf(before);
    const nextIndent = currentIndent.slice(0, Math.max(0, currentIndent.length - INDENT.length));
    replace(lineStart, start, nextIndent + "}", lineStart + nextIndent.length + 1);
    return true;
  }

  function handlePair(event) {
    const key = event.key;
    const value = textarea.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    if (closers.has(key) && start === end && value[start] === key) {
      event.preventDefault();
      textarea.setSelectionRange(start + 1, start + 1);
      return;
    }
    if (key === "}" && start === end && handleClosingBrace()) {
      event.preventDefault();
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(pairs, key)) return;
    if (key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
    if (["'", '"', String.fromCharCode(96)].includes(key)) {
      if (value[start - 1] === "\\") return;
      if (start === end && value[start] === key) {
        event.preventDefault();
        textarea.setSelectionRange(start + 1, start + 1);
        return;
      }
    }

    event.preventDefault();
    const selected = value.slice(start, end);
    replace(start, end, key + selected + pairs[key], start + 1 + selected.length);
  }

  const htmlVoidElements = new Set([
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr"
  ]);
  let insertingHtmlCloser = false;

  function hasExistingHtmlCloser(tagName, sourceAfterCaret) {
    const tokenPattern = new RegExp("<\\\\s*(/?)\\\\s*" + tagName + "\\\\b([^>]*)>", "gi");
    let nestedOpenTags = 0;
    let token;

    while ((token = tokenPattern.exec(sourceAfterCaret))) {
      const isClosing = Boolean(token[1]);
      const attributes = token[2] || "";
      const isSelfClosing = /\/\s*$/.test(attributes);

      if (isClosing) {
        if (nestedOpenTags === 0) return true;
        nestedOpenTags -= 1;
      } else if (!isSelfClosing) {
        nestedOpenTags += 1;
      }
    }

    return false;
  }

  function autoCloseHtmlTag(event) {
    if (language() !== "html" || insertingHtmlCloser) return;
    if (event.inputType !== "insertText" || event.data !== ">") return;

    const caret = textarea.selectionStart;
    if (caret !== textarea.selectionEnd || caret < 3) return;

    const before = textarea.value.slice(0, caret);
    const openingTag = before.match(/<([a-z][\w:-]*)(?:\s[^<>]*)?>$/i);
    if (!openingTag) return;

    const tagName = openingTag[1];
    if (htmlVoidElements.has(tagName.toLowerCase())) return;
    if (/\/\s*>$/.test(openingTag[0])) return;

    const after = textarea.value.slice(caret);
    if (hasExistingHtmlCloser(tagName, after)) return;

    const closingTag = "</" + tagName + ">";
    insertingHtmlCloser = true;
    try {
      textarea.setRangeText(closingTag, caret, caret, "end");
      textarea.setSelectionRange(caret, caret);
      emitInput();
    } finally {
      insertingHtmlCloser = false;
    }
  }

  textarea.addEventListener("input", autoCloseHtmlTag);

  textarea.addEventListener("keydown", event => {
    if (event.isComposing || event.defaultPrevented) return;
    if (event.key === "Tab") {
      event.preventDefault();
      changeSelectionIndent(event.shiftKey);
      return;
    }
    if (event.key === "Enter" && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      handleEnter();
      return;
    }
    if (event.key === "Backspace" && textarea.selectionStart === textarea.selectionEnd) {
      const start = textarea.selectionStart;
      const value = textarea.value;
      if (start > 0 && pairs[value[start - 1]] === value[start]) {
        event.preventDefault();
        replace(start - 1, start + 1, "");
        return;
      }
    }
    handlePair(event);
  });

  window.AuroraEditorTyping = {
    indent: () => changeSelectionIndent(false),
    outdent: () => changeSelectionIndent(true),
    get indentSize() { return INDENT.length; }
  };
})();
