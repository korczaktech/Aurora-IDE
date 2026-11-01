(() => {
  "use strict";

  const EXTENSIONS = Object.freeze({
    html: "xml", htm: "xml", xhtml: "xml", xml: "xml", svg: "xml",
    css: "css", scss: "scss", less: "less",
    js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "javascript",
    ts: "typescript", mts: "typescript", cts: "typescript", tsx: "typescript",
    rs: "rust", c: "c", h: "c", cc: "cpp", cpp: "cpp", cxx: "cpp",
    hpp: "cpp", hh: "cpp", hxx: "cpp", cs: "csharp", java: "java",
    kt: "kotlin", kts: "kotlin", swift: "swift", py: "python", pyw: "python",
    json: "json", jsonc: "json", sh: "bash", bash: "bash", zsh: "bash",
    sql: "sql", md: "markdown", markdown: "markdown", yml: "yaml", yaml: "yaml",
    toml: "ini", ini: "ini", go: "go", php: "php", rb: "ruby", lua: "lua",
    dart: "dart", diff: "diff"
  });

  const LABELS = Object.freeze({
    xml: "HTML / XML", css: "CSS", scss: "SCSS", less: "LESS",
    javascript: "JAVASCRIPT", typescript: "TYPESCRIPT", rust: "RUST",
    c: "C", cpp: "C++", csharp: "C#", java: "JAVA", kotlin: "KOTLIN",
    swift: "SWIFT", python: "PYTHON", json: "JSON", bash: "SHELL",
    sql: "SQL", markdown: "MARKDOWN", yaml: "YAML", ini: "TOML / INI",
    go: "GO", php: "PHP", ruby: "RUBY", lua: "LUA", dart: "DART",
    diff: "DIFF", plaintext: "TEXTO"
  });

  function extensionOf(filename) {
    const name = String(filename || "").split(/[\\/]/).pop().toLowerCase();
    if (name === "makefile" || name === "gnumakefile") return "makefile";
    if (name === "dockerfile") return "dockerfile";
    const dot = name.lastIndexOf(".");
    return dot < 0 ? "" : name.slice(dot + 1);
  }

  function languageFor(filename) {
    const extension = extensionOf(filename);
    if (extension === "makefile") return "makefile";
    return EXTENSIONS[extension] || "plaintext";
  }

  function labelFor(filename) {
    return LABELS[languageFor(filename)] || "TEXTO";
  }

  function escapeHTML(value) {
    return value.replace(/[&<>"]/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"
    })[character]);
  }

  function highlight(source, filename) {
    const code = String(source ?? "");
    const language = languageFor(filename);
    const highlighter = window.hljs;
    let rendered = escapeHTML(code);

    if (highlighter && language !== "plaintext" && highlighter.getLanguage(language)) {
      try {
        rendered = highlighter.highlight(code, {
          language,
          ignoreIllegals: true
        }).value;
      } catch (error) {
        console.warn("[Aurora] Syntax highlighting indisponível para este arquivo.", error);
      }
    }

    return rendered + (code.endsWith("\n") ? " " : "");
  }

  window.AuroraSyntaxHighlight = Object.freeze({
    languageFor,
    labelFor,
    highlight
  });
})();
