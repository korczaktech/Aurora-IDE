"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.resolve(root, "..", "HTML", "editor.html"), "utf8");
const css = fs.readFileSync(path.resolve(root, "..", "CSS", "editor.css"), "utf8");
const intelligence = fs.readFileSync(path.join(root, "editor-intelligence.js"), "utf8");
const controls = fs.readFileSync(path.join(root, "editor-controls.js"), "utf8");

test("loads cursor, selection and autocomplete after the editor API exists", () => {
  const editorInit = html.indexOf("window.AuroraEditor =");
  const intelligenceScript = html.indexOf("../JavaScript/editor-intelligence.js");
  const controlsScript = html.indexOf("../JavaScript/editor-controls.js");
  assert.ok(editorInit >= 0);
  assert.ok(intelligenceScript > editorInit);
  assert.ok(controlsScript > intelligenceScript);
});

test("keeps caret, selection direction and scroll position per open file", () => {
  assert.match(html, /const codeSelections = new Map\(\)/);
  assert.match(html, /start: codeInput\.selectionStart/);
  assert.match(html, /end: codeInput\.selectionEnd/);
  assert.match(html, /direction: codeInput\.selectionDirection/);
  assert.match(html, /codeInput\.scrollTop = savedSelection\.scrollTop/);
  assert.match(html, /codeInput\.scrollLeft = savedSelection\.scrollLeft/);
});

test("provides cursor and selection operations without replacing the native textarea", () => {
  for (const operation of ["selectLine", "selectWord", "nextOccurrence", "moveLine", "duplicateLine", "smartHome"]) {
    assert.ok(intelligence.includes("function " + operation + "("), "missing " + operation);
  }
  assert.match(intelligence, /setSelectionRange/);
  assert.match(intelligence, /setRangeText/);
  assert.match(html, /<textarea class="code-input" id="codeInput"/);
});

test("provides contextual autocomplete for JavaScript, HTML and CSS", () => {
  for (const language of ["javascript", "html", "css"]) {
    assert.ok(intelligence.includes(language + ": ["), "missing " + language + " suggestions");
  }
  for (const key of ["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"]) {
    assert.ok(intelligence.includes('event.key === "' + key + '"'), "missing " + key);
  }
  assert.match(intelligence, /aria-activedescendant/);
  assert.match(intelligence, /role", "listbox"/);
  assert.match(intelligence, /function accept/);
});

test("exposes selection commands in the Selection tool", () => {
  for (const command of ["Selecionar palavra", "Selecionar linha", "Próxima ocorrência", "Duplicar linha", "Mover linha para cima", "Mover linha para baixo"]) {
    assert.ok(controls.includes(command), "missing command: " + command);
  }
  assert.match(controls, /AuroraEditorIntelligence/);
});

test("styles autocomplete as a bounded, keyboard-navigable suggestion list", () => {
  assert.match(css, /\.aurora-intellisense\s*\{/);
  assert.match(css, /max-height:\s*156px/);
  assert.match(css, /\.aurora-intellisense-option\.is-active/);
  assert.match(css, /\[aria-selected="true"\]/);
});


test("opens and closes independent editor tabs while retaining per-file state", () => {
  assert.match(html, /const openCodeFiles = new Set\(\["index\\.html"\]\)/);
  assert.match(html, /function renderCodeTabs\(/);
  assert.match(html, /function closeCodeFile\(/);
  assert.match(html, /codeSelections\.set\(activeCodeFile/);
  assert.match(html, /get openFiles\(\)/);
  assert.match(html, /data-close-code-file/);
});

test("provides find and replace with navigation, case sensitivity and replace-all", () => {
  assert.match(controls, /function openFindReplace\(/);
  assert.match(controls, /function selectMatch/);
  assert.match(controls, /caseSensitive/);
  assert.match(controls, /replaceAll\.onclick/);
  assert.match(controls, /for\(let i=matches\.length-1;i>=0;i--\)/);
  assert.match(controls, /k==="f"/);
  assert.match(controls, /k==="h"/);
});
