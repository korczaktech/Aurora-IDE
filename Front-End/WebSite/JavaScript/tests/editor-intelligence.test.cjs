"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.resolve(root, "..", "HTML", "editor.html"), "utf8");
const css = fs.readFileSync(path.resolve(root, "..", "CSS", "editor.css"), "utf8");
const intelligence = fs.readFileSync(path.join(root, "editor-intelligence.js"), "utf8");
const typing = fs.readFileSync(path.join(root, "editor-typing.js"), "utf8");
const fileIcons = fs.readFileSync(path.join(root, "file-icons.js"), "utf8");
const controls = fs.readFileSync(path.join(root, "editor-controls.js"), "utf8");
const projectManager = fs.readFileSync(path.join(root, "project-manager.js"), "utf8");

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
  assert.ok(html.includes('const openCodeFiles = new Set()'));
  assert.match(html, /function renderCodeTabs\(/);
  assert.match(html, /function closeCodeFile\(/);
  assert.match(html, /codeSelections\.set\(activeCodeFile/);
  assert.match(html, /get openFiles\(\)/);
  assert.match(html, /data-close-code-file/);
});

test("provides find and replace with navigation, case sensitivity and replace-all", () => {
  assert.match(controls, /function openFindReplace\(/);
  assert.match(controls, /const selectMatch/);
  assert.match(controls, /caseSensitive/);
  assert.match(controls, /replaceAll\.onclick/);
  assert.match(controls, /for\(let i=matches\.length-1;i>=0;i--\)/);
  assert.match(controls, /k==="f"/);
  assert.match(controls, /k==="h"/);
});


test("parses the editor page inline JavaScript", () => {
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map(match => match[1])
    .filter(source => source.includes("const codeInput"));
  assert.equal(scripts.length, 1, "expected one inline editor bootstrap script");
  assert.doesNotThrow(() => new vm.Script(scripts[0], { filename: "editor.html:inline-script" }));
});


test("loads automatic indentation and paired-character editing", () => {
  assert.ok(html.indexOf("../JavaScript/editor-intelligence.js") < html.indexOf("../JavaScript/editor-typing.js"));
  assert.match(html, /editor-typing\.js/);
  for (const feature of ["handleEnter", "changeSelectionIndent", "shouldIncreaseIndent", "handleClosingBrace", "handlePair", "hasExistingHtmlCloser", "autoCloseHtmlTag"]) {
    assert.ok(typing.includes("function " + feature + "("), "missing " + feature);
  }
  for (const behavior of ["event.shiftKey", "matchingPair", "Backspace", "AuroraEditorTyping"]) {
    assert.ok(typing.includes(behavior), "missing behavior " + behavior);
  }
});

test("editor typing module parses as JavaScript", () => {
  assert.doesNotThrow(() => new vm.Script(typing, { filename: "editor-typing.js" }));
});


test("provides individually drawn SVG identities for major languages and frameworks", () => {
  const sandbox = { window: {}, document: { readyState: "complete", querySelectorAll: () => [] } };
  vm.runInNewContext(fileIcons, sandbox, { filename: "file-icons.js" });
  const api = sandbox.window.AuroraFileIcons;
  assert.ok(api, "file icon API must be exposed");
  const examples = {
    "index.html": "html",
    "style.css": "css",
    "app.js": "javascript",
    "app.ts": "typescript",
    "App.jsx": "react",
    "App.tsx": "react",
    "App.native.tsx": "reactNative",
    "native.android.tsx": "reactNative",
    "main.py": "python",
    "Main.java": "java",
    "Main.kt": "kotlin",
    "main.swift": "swift",
    "main.go": "go",
    "main.rs": "rust",
    "main.cpp": "cpp",
    "Program.cs": "csharp",
    "index.php": "php",
    "app.rb": "ruby",
    "component.vue": "vue",
    "component.svelte": "svelte",
    "query.graphql": "graphql",
    "Dockerfile": "docker",
    "schema.sql": "sql",
    "config.yaml": "yaml",
    "README.md": "markdown"
  };
  for (const [filename, expected] of Object.entries(examples)) {
    assert.equal(api.kindForFile(filename), expected, filename);
    const svg = api.svgForFile(filename);
    assert.ok(svg.includes("<svg") && (svg.includes("<path") || svg.includes("<circle")), filename + " must render SVG artwork");
  }
  const uniqueDrawings = new Set(Object.keys(examples).map(filename => api.svgForFile(filename)));
  assert.ok(uniqueDrawings.size >= 15, "language SVG drawings should be distinct");
  assert.equal(api.kindForFile("unknown.extension"), "generic");
});

test("loads the custom SVG icon module before the editor bootstrap", () => {
  const iconScript = html.indexOf("../JavaScript/file-icons.js");
  const inlineBootstrap = html.indexOf("const codeInput");
  assert.ok(iconScript >= 0 && iconScript < inlineBootstrap);
  assert.ok(projectManager.includes("icon.dataset.fileIcon = name"));
  assert.match(html, /icon\.innerHTML = iconForFile\(name\)/);
  assert.match(css, /\.aurora-file-svg/);
});

test("file icon module parses as JavaScript", () => {
  assert.doesNotThrow(() => new vm.Script(fileIcons, { filename: "file-icons.js" }));
});


test("integrates a real local project manager with folder and file operations", () => {
  for (const control of ["createProject", "openProject", "newProjectFile", "newProjectFolder", "renameProjectItem", "deleteProjectItem", "deleteProject", "projectTree", "projectStatus"]) {
    assert.ok(html.includes('id="' + control + '"'), "missing project manager control: " + control);
  }
  assert.match(html, /project-manager\.js/);
  assert.match(html, /replaceProject\(files, projectName, activeName, openNames = \[\], preserveState = false\)/);
  assert.match(html, /addFile\(name, content/);
  assert.match(html, /renameFile\(oldName, newName\)/);
  assert.match(html, /deleteFile\(name\)/);
  assert.match(html, /const codeFiles = Object\.create\(null\)/);
  assert.match(html, /if \(activeCodeFile === name\)/);
  assert.match(html, /codeInput\.disabled = true/);
  assert.match(html, /aurora:editor-change/);
});

test("supports actual directory access, nested traversal, persistence and filesystem mutations", () => {
  for (const feature of [
    "showDirectoryPicker", "getDirectoryHandle", "getFileHandle", "entries()",
    "createWritable", "removeEntry", "moveEntry", "copyDirectory",
    "indexedDB.open", "requestPermission", "validRelativePath",
    "function createProject", "function createProjectOnDevice", "function deleteProject", "function openProjectFolder", "function createFile",
    "function createFolder", "function renameSelected", "function deleteSelected",
    "function flushWrites", "function renderEntries"
  ]) {
    assert.ok(projectManager.includes(feature), "missing filesystem feature: " + feature);
  }
  assert.match(projectManager, /setTimeout\(\(\) => \{/);
  assert.match(projectManager, /280\)/);
  assert.match(projectManager, /getDirectoryHandle\(cleanName, \{ create: true \}\)/);
  assert.match(projectManager, /projectParentHandle\.removeEntry\(currentProjectName, \{ recursive: true \}\)/);
  assert.match(projectManager, /Excluir permanentemente o projeto/);
});

test("project manager and editor APIs parse as JavaScript", () => {
  assert.doesNotThrow(() => new vm.Script(projectManager, { filename: "project-manager.js" }));
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map(match => match[1])
    .filter(source => source.includes("const codeInput"));
  assert.equal(scripts.length, 1);
  assert.doesNotThrow(() => new vm.Script(scripts[0], { filename: "editor.html:inline-script" }));
});


test("rejects unsafe project paths while allowing nested source paths", () => {
  const elements = new Map();
  const element = () => ({
    dataset: {}, title: "", textContent: "",
    addEventListener() {},
  });
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    }
  };
  const window = { AuroraEditor: {}, addEventListener() {} };
  vm.runInNewContext(projectManager, { window, document, console, setTimeout, clearTimeout });
  const api = window.AuroraProjectManager;
  assert.equal(api.validSegment("index.html"), true);
  assert.equal(api.validSegment("component.tsx"), true);
  assert.equal(api.validSegment("CON"), false);
  assert.equal(api.validSegment("LPT1.txt"), false);
  assert.equal(api.validSegment("bad" + String.fromCharCode(1) + "name"), false);
  assert.equal(api.validSegment("../escape"), false);
  assert.equal(api.validSegment("folder/file.js"), false);
  assert.equal(api.validSegment("bad\\name.js"), false);
  assert.equal(api.validRelativePath("src\\App.js"), false);
  assert.equal(api.validRelativePath("assets/icons/logo.svg"), true);
  assert.equal(api.validRelativePath("CON"), true);
  assert.equal(api.validRelativePath("../outside.txt"), false);
  assert.equal(api.validRelativePath("/absolute/path.js"), false);
  assert.equal(api.validRelativePath("src\\\\App.js"), false);
});

test("project refresh keeps tabs and selection state available", () => {
  assert.match(html, /replaceProject\(files, projectName, activeName, openNames = \[\], preserveState = false\)/);
  assert.match(html, /codeSelections\.set\(activeCodeFile/);
  assert.match(projectManager, /editor\.replaceProject\(files, currentProjectName, active, open, true\)/);
  assert.match(projectManager, /previousOpen\.filter/);
});


test("offers device storage while keeping Korczak Vault unavailable", () => {
  assert.match(html, /id="projectStorageDialog"/);
  assert.match(html, /id="projectStorageDevice"/);
  assert.match(html, /id="projectStorageVault"[^>]*disabled/);
  assert.match(html, /Korczak Vault/);
  assert.match(html, /Dispositivo/);
  assert.match(projectManager, /function createProject\(\)/);
  assert.match(projectManager, /createProjectOnDevice\(\)/);
  assert.match(css, /\.project-storage-dialog/);
});

test("file tree includes all folders from the selected directory", () => {
  assert.doesNotMatch(projectManager, /ignoredDirectories/);
  assert.match(projectManager, /for await \(const \[name, child\] of handle\.entries\(\)\)/);
  assert.match(projectManager, /appendChildren\(entry\.path, depth \+ 1, childContainer\)/);
});
