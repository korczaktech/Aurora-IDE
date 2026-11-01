"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const moduleSource = fs.readFileSync(path.join(root, "syntax-highlighting.js"), "utf8");
const editorHTML = fs.readFileSync(path.resolve(root, "..", "HTML", "editor.html"), "utf8");
const editorCSS = fs.readFileSync(path.resolve(root, "..", "CSS", "editor.css"), "utf8");

function loadHighlighter(hljs) {
  const window = { hljs };
  const quietConsole = { warn() {} };
  vm.runInNewContext(moduleSource, { window, console: quietConsole });
  return window.AuroraSyntaxHighlight;
}

test("detects the language from common source-file extensions", () => {
  const api = loadHighlighter();
  const cases = new Map([
    ["index.html", "xml"],
    ["component.tsx", "typescript"],
    ["main.js", "javascript"],
    ["styles.css", "css"],
    ["main.rs", "rust"],
    ["main.c", "c"],
    ["main.cpp", "cpp"],
    ["Main.kt", "kotlin"],
    ["app.py", "python"],
    ["query.sql", "sql"],
    ["config.yaml", "yaml"],
    ["README.md", "markdown"],
    ["unknown.file", "plaintext"]
  ]);

  for (const [filename, expected] of cases) {
    assert.equal(api.languageFor(filename), expected, filename);
  }
});

test("provides a readable language label", () => {
  const api = loadHighlighter();
  assert.equal(api.labelFor("main.rs"), "RUST");
  assert.equal(api.labelFor("index.html"), "HTML / XML");
  assert.equal(api.labelFor("unknown.bin"), "TEXTO");\n  assert.equal(api.labelFor("Dockerfile"), "DOCKERFILE");\n  assert.equal(api.labelFor("Makefile"), "MAKEFILE");
});

test("escapes source safely when no grammar engine is available", () => {
  const api = loadHighlighter();
  assert.equal(
    api.highlight('<script>alert("x")</script>', "unknown.txt"),
    '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'
  );
});

test("preserves a trailing newline for editor line alignment", () => {
  const api = loadHighlighter();
  assert.equal(api.highlight("const value = 1;\n", "unknown.txt"), "const value = 1;\n ");
});

test("passes the detected grammar to Highlight.js", () => {
  let receivedLanguage = null;
  const hljs = {
    getLanguage(language) { return language === "rust"; },
    highlight(source, options) {
      receivedLanguage = options.language;
      return { value: '<span class="hljs-keyword">fn</span> main() {}' };
    }
  };
  const api = loadHighlighter(hljs);
  assert.match(api.highlight("fn main() {}", "main.rs"), /hljs-keyword/);
  assert.equal(receivedLanguage, "rust");
});

test("falls back to escaped source if the grammar engine throws", () => {
  const hljs = {
    getLanguage() { return true; },
    highlight() { throw new Error("engine failure"); }
  };
  const api = loadHighlighter(hljs);
  assert.equal(api.highlight("<tag>", "index.html"), "&lt;tag&gt;");
});

test("loads Highlight.js and the Aurora adapter before initializing the editor", () => {
  const cdnIndex = editorHTML.indexOf("highlight.min.js");
  const adapterIndex = editorHTML.indexOf("../JavaScript/syntax-highlighting.js");
  const editorInitIndex = editorHTML.indexOf("const codeInput = document.getElementById");
  assert.notEqual(cdnIndex, -1);
  assert.notEqual(adapterIndex, -1);
  assert.notEqual(editorInitIndex, -1);
  assert.ok(cdnIndex < adapterIndex);
  assert.ok(adapterIndex < editorInitIndex);
  assert.match(editorHTML, /AuroraSyntaxHighlight\.highlight\(source, file\)/);
});

test("renders the highlight layer and keeps the textarea text transparent", () => {
  assert.match(editorCSS, /\.code-highlight\s*\{[^}]*display:\s*block/s);
  assert.match(editorCSS, /\.code-input\s*\{[^}]*-webkit-text-fill-color:\s*transparent/s);
  assert.match(editorCSS, /\.code-highlight \.hljs-keyword/);
  assert.match(editorCSS, /\.code-highlight \.hljs-string/);
});
