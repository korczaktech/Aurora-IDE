(() => {
  "use strict";

  // Ícones vetoriais autorais do Aurora EDS. Cada tecnologia possui desenho próprio.
  const icons = {
    html: '<path d="M5 2.8h10l4 4v14.4H5z" fill="#e76f43" fill-opacity=".13" stroke="#e76f43" stroke-width="1.5"/><path d="M15 2.8v4h4M8 10l-2 2.5 2 2.5m8-5 2 2.5-2 2.5m-3-6-2 7" fill="none" stroke="#f08a60" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"/>',
    css: '<path d="M5 3h14l-1.4 16-5.6 2-5.6-2z" fill="#438bd8" fill-opacity=".16" stroke="#579ee8" stroke-width="1.5"/><path d="M8 8h8l-.3 3H9m-.2 2.5 6 .1-.3 2-2.5.9-2.5-.9" fill="none" stroke="#79b8f2" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"/>',
    javascript: '<path d="M4 4h16v16H4z" rx="2" fill="#e6c84f" fill-opacity=".16" stroke="#d9bd45" stroke-width="1.5"/><path d="M13 9v6.2c0 2-2.8 2.2-3.5.7m7-1.2c.3 1.4 2.8 1.5 3 .1.1-.8-.7-1.1-1.7-1.5-1.2-.5-1.8-1-1.6-2 .2-1.4 2.4-1.7 3.2-.5" fill="none" stroke="#e8d36b" stroke-width="1.5" stroke-linecap="round"/>',
    typescript: '<path d="M3.5 4.5h17v15h-17z" fill="#3178c6" fill-opacity=".16" stroke="#4b91d8" stroke-width="1.5"/><path d="M6.5 9h7m-3.5 0v8m6-5c.5-1.2 3.2-1.1 3.3.2.1.8-.6 1.1-1.7 1.5-1.2.4-1.7.9-1.5 1.8.2 1.2 2.7 1.4 3.4.2" fill="none" stroke="#73afe9" stroke-width="1.5" stroke-linecap="round"/>',
    react: '<circle cx="12" cy="12" r="2" fill="#70d8ed"/><g fill="none" stroke="#61cbe3" stroke-width="1.35"><ellipse cx="12" cy="12" rx="9.5" ry="3.8"/><ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(120 12 12)"/></g>',
    reactNative: '<path d="M12 2.5 20 7v10l-8 4.5L4 17V7z" fill="#61cbe3" fill-opacity=".1" stroke="#61cbe3" stroke-width="1.4"/><circle cx="12" cy="12" r="2" fill="#61cbe3"/><path d="M12 5.5v3m0 7v3m-5.6-9.8 2.6 1.5m6 3.6 2.6 1.5m0-6.6-2.6 1.5m-6 3.6L6.4 15" stroke="#61cbe3" stroke-width="1.35" stroke-linecap="round"/>',
    json: '<path d="M8 4C5 4 6 8 6 9s-1 2-2 3c1 1 2 2 2 3s-1 5 2 5m8-16c3 0 2 4 2 5s1 2 2 3c-1 1-2 2-2 3s1 5-2 5" fill="none" stroke="#d8b86a" stroke-width="1.7" stroke-linecap="round"/><path d="m10 9-2 3 2 3m4-6 2 3-2 3" fill="none" stroke="#e9cc82" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    markdown: '<path d="M3.5 5h17v14h-17z" fill="#aab8c4" fill-opacity=".1" stroke="#aab8c4" stroke-width="1.4"/><path d="M6 15V9l3 3 3-3v6m3-3 2-2 2 2m-2-2v6" fill="none" stroke="#c6d2dc" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    python: '<path d="M12 3.2c-4.7 0-4.8 2-4.8 4.2v2.1h6.2v1.2H5.8C3.5 10.7 3 12.5 3 15s1.2 4.1 3.5 4.1h2v-2.5c0-2.2 1.8-3.9 4-3.9h4.4c2 0 3.1-1.4 3.1-3.4V7.4c0-2.4-2-4.2-8-4.2Z" fill="#4b91c5" fill-opacity=".2" stroke="#65a9d9" stroke-width="1.25"/><path d="M12 20.8c4.7 0 4.8-2 4.8-4.2v-2.1h-6.2v-1.2h7.6c2.3 0 2.8-1.8 2.8-4.3" fill="none" stroke="#e0c15e" stroke-width="1.5" stroke-linecap="round"/><circle cx="9.5" cy="6.3" r=".8" fill="#9bc9e8"/><circle cx="14.5" cy="17.7" r=".8" fill="#f0d77b"/>',
    java: '<path d="M8 14c-2 1.4 1 2.2 5.3 1.7 2.7-.3 3.7-1 3.7-1.5M7 17c-2.1 1.6 1.2 2.7 6.2 2.2 3.3-.3 4.7-1.2 4.7-1.9" fill="none" stroke="#e58a56" stroke-width="1.4" stroke-linecap="round"/><path d="M10 11c-1.5-1.5 2.4-2.2 1-4.5m3 4.5c-1.5-1.5 2.4-2.2 1-4.5" fill="none" stroke="#e58a56" stroke-width="1.4" stroke-linecap="round"/><path d="M5 13h14" stroke="#77b9dd" stroke-width="1.4" stroke-linecap="round"/>',
    kotlin: '<path d="M4 3.5h16v17H4z" fill="#8b70d5" fill-opacity=".13" stroke="#9a7ce8" stroke-width="1.4"/><path d="M6.5 17V7l5.5 5-5.5 5m5.5 0 5.5-5-5.5-5h5.5" fill="none" stroke="#c09cff" stroke-width="1.7" stroke-linejoin="round"/>',
    swift: '<path d="M19.5 16.5c-1.3 3.2-5.5 4.5-9.6 2.9-2.6-1-4.3-2.8-5-5 2.8 2 5.8 2.2 8 1.6-3.3-1.8-6.3-5-7.6-8.4 3 3.2 5.7 4.6 7.8 5.1-1.7-1.8-3.2-4.1-3.8-6.1 2.4 3.1 5.7 5.8 9.6 7.1.6.2 1.1.7 1.2 1.4.1.5-.1 1-.6 1.4Z" fill="#ef875b" stroke="#f39a72" stroke-width=".7"/>',
    go: '<path d="M3 12c1-4.7 5.3-8 10-8 3.1 0 5.9 1.3 7.5 3.5" fill="none" stroke="#72c9e3" stroke-width="2" stroke-linecap="round"/><path d="M5 15c1.6 3.1 4.8 5 8.4 5 3.1 0 5.8-1.4 7.1-3.8" fill="none" stroke="#72c9e3" stroke-width="2" stroke-linecap="round"/><circle cx="9" cy="10" r="1" fill="#72c9e3"/><circle cx="15.5" cy="10" r="1" fill="#72c9e3"/>',
    rust: '<path d="M12 3.2 14 4l2.2-.4 1.1 1.8 2 .9-.1 2.3 1.2 1.9-1.2 1.9.1 2.3-2 .9-1.1 1.8-2.2-.4-2 1-2-1-2.2.4-1.1-1.8-2-.9.1-2.3L3.6 12l1.2-1.9-.1-2.3 2-.9 1.1-1.8L10 4z" fill="#c87950" fill-opacity=".18" stroke="#d78a60" stroke-width="1.2"/><circle cx="12" cy="12" r="4" fill="none" stroke="#e5a27c" stroke-width="1.4"/><path d="M10 10.5h4m-2-2v7" stroke="#e5a27c" stroke-width="1.2" stroke-linecap="round"/>',
    c: '<path d="M19.5 7.2 12 3 4.5 7.2v9.6L12 21l7.5-4.2z" fill="#5796cb" fill-opacity=".15" stroke="#6aa8dc" stroke-width="1.4"/><path d="M15.8 9.3c-.9-.9-2.1-1.3-3.6-1.3-2.6 0-4.3 1.7-4.3 4s1.7 4 4.3 4c1.5 0 2.7-.5 3.6-1.4" fill="none" stroke="#8bc2ee" stroke-width="1.7" stroke-linecap="round"/>',
    cpp: '<path d="M19.5 7.2 12 3 4.5 7.2v9.6L12 21l7.5-4.2z" fill="#6596d0" fill-opacity=".15" stroke="#78a9e0" stroke-width="1.4"/><path d="M12.8 9.3c-.8-.9-1.8-1.3-3-1.3-2.4 0-4 1.7-4 4s1.6 4 4 4c1.2 0 2.2-.5 3-1.4m2-3.1h4m-2-2v4m-2 0h4" fill="none" stroke="#a4c5ef" stroke-width="1.35" stroke-linecap="round"/>',
    csharp: '<path d="M12 2.8 20 7v10l-8 4.2L4 17V7z" fill="#8b6ac5" fill-opacity=".17" stroke="#a084dc" stroke-width="1.4"/><path d="M13 8.5c-.8-.7-1.6-1-2.6-1-2.2 0-3.7 1.7-3.7 4.1s1.5 4 3.7 4c1 0 1.8-.3 2.6-1m2-4h4m-2-2v4m-2 1h4m-2-2v4" fill="none" stroke="#bba2ec" stroke-width="1.3" stroke-linecap="round"/>',
    php: '<path d="M2.5 12c2.2-4.8 6-7.2 9.5-7.2s7.3 2.4 9.5 7.2c-2.2 4.8-6 7.2-9.5 7.2S4.7 16.8 2.5 12Z" fill="#777bb3" fill-opacity=".17" stroke="#9296cf" stroke-width="1.4"/><path d="m7 15 1.5-6h3l-1.5 6m2-3h4l-1 3m1-3 1-2h2" fill="none" stroke="#b2b5e5" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/>',
    ruby: '<path d="m4 8 4-4h8l4 4-8 12z" fill="#d65b5b" fill-opacity=".18" stroke="#e27676" stroke-width="1.4"/><path d="m4 8 8 12 8-12M8 4l4 16 4-16M4 8h16" fill="none" stroke="#ed9999" stroke-width="1.1"/>',
    vue: '<path d="m3 5 4.5 0L12 13l4.5-8H21L12 21z" fill="#42a982" fill-opacity=".2" stroke="#55c49a" stroke-width="1.4"/><path d="m7.5 5 4.5 8 4.5-8" fill="none" stroke="#83dfb8" stroke-width="2"/>',
    svelte: '<path d="M18.8 5.3c-2-2.8-6.4-3.5-9.8-1.5L6.4 5.4c-1.5.9-2.3 2.6-2.1 4.3.1 1 .6 1.9 1.3 2.6-1.1 1.8-.9 4.1.4 5.8 2 2.8 6.4 3.5 9.8 1.5l2.6-1.6c1.5-.9 2.3-2.6 2.1-4.3-.1-1-.6-1.9-1.3-2.6 1.1-1.8.9-4.1-.4-5.8Z" fill="#ef754f" fill-opacity=".16" stroke="#ef875f" stroke-width="1.4"/><path d="m8 9 5-3m-2 12 5-3" stroke="#f5a181" stroke-width="2" stroke-linecap="round"/>',
    angular: '<path d="m12 2.5 9 3.2-1.4 12.1L12 21.5l-7.6-3.7L3 5.7z" fill="#dd5264" fill-opacity=".15" stroke="#e36c7b" stroke-width="1.4"/><path d="m12 6.5-5 11h2.5l1-2.5h3l1 2.5H17z" fill="none" stroke="#f08a98" stroke-width="1.5" stroke-linejoin="round"/>',
    node: '<path d="m12 2.8 8.2 4.6v9.2L12 21.2l-8.2-4.6V7.4z" fill="#75a96d" fill-opacity=".16" stroke="#86bc7c" stroke-width="1.4"/><path d="M8 8.2v7.6m0-3.8 4 3.8m-4-3.8 4-3.8m2 0v7.6m0-7.6 3.5 3.8-3.5 3.8" fill="none" stroke="#a8d69e" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/>',
    sql: '<path d="M12 3c4.4 0 7.5 1.2 7.5 2.8v12.4c0 1.6-3.1 2.8-7.5 2.8s-7.5-1.2-7.5-2.8V5.8C4.5 4.2 7.6 3 12 3Z" fill="#5b9fbd" fill-opacity=".15" stroke="#70b5d3" stroke-width="1.4"/><path d="M4.5 6c0 1.6 3.1 2.8 7.5 2.8S19.5 7.6 19.5 6M4.5 12c0 1.6 3.1 2.8 7.5 2.8s7.5-1.2 7.5-2.8" fill="none" stroke="#8bcce5" stroke-width="1.2"/>',
    yaml: '<path d="M5 3.5h14v17H5z" fill="#c58e59" fill-opacity=".12" stroke="#d7a36f" stroke-width="1.4"/><path d="M8 8h8M8 12h5m-5 4h8" stroke="#e6bc8e" stroke-width="1.5" stroke-linecap="round"/>',
    shell: '<path d="M3 4.5h18v15H3z" fill="#83a79a" fill-opacity=".1" stroke="#83b5a2" stroke-width="1.4"/><path d="m6.5 9 3 2.5-3 2.5m5 0h5" fill="none" stroke="#a6d6c1" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    docker: '<path d="M3 12h17c-.5 4.3-3.4 7-8.2 7C7 19 4.1 16.8 3 12Z" fill="#4e9bc9" fill-opacity=".17" stroke="#65b5e5" stroke-width="1.3"/><path d="M5 9h3v2H5zm4 0h3v2H9zm4 0h3v2h-3zm-4-3h3v2H9zm4 0h3v2h-3zm4 3h3v2h-3z" fill="#78c7ef"/><path d="M2 14c-1-2 0-3 1-3" fill="none" stroke="#78c7ef" stroke-width="1.2"/>',
    graphql: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" fill="#df72a7" fill-opacity=".12" stroke="#e68bb8" stroke-width="1.3"/><path d="m12 3 8 13.5M12 3 4 16.5m0-9h16M4 16.5h16M12 21l8-13.5M12 21 4 7.5" fill="none" stroke="#ed9bc2" stroke-width="1.1"/><circle cx="12" cy="3" r="1.4" fill="#f2b1d0"/><circle cx="20" cy="7.5" r="1.4" fill="#f2b1d0"/><circle cx="20" cy="16.5" r="1.4" fill="#f2b1d0"/><circle cx="12" cy="21" r="1.4" fill="#f2b1d0"/><circle cx="4" cy="16.5" r="1.4" fill="#f2b1d0"/><circle cx="4" cy="7.5" r="1.4" fill="#f2b1d0"/>',
    wasm: '<path d="M4 4h16v16H4z" fill="#7567c7" fill-opacity=".15" stroke="#9184e4" stroke-width="1.4"/><path d="m6.5 8 2 8 2-5 2 5 2-8m1 0 2 8" fill="none" stroke="#b0a6f5" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/>',
    xml: '<path d="M5 3h10l4 4v14H5z" fill="#b78c58" fill-opacity=".12" stroke="#d0a66d" stroke-width="1.4"/><path d="M15 3v4h4M8 10l-2 2 2 2m8-4 2 2-2 2m-3-5-2 6" fill="none" stroke="#e3bd8b" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
    toml: '<path d="M5 3h14v18H5z" fill="#a58cbd" fill-opacity=".12" stroke="#b9a1d0" stroke-width="1.4"/><path d="M8 8h8M8 12h8M8 16h5" stroke="#d2bde5" stroke-width="1.4" stroke-linecap="round"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2" fill="#78aa91" fill-opacity=".12" stroke="#8ac5a5" stroke-width="1.4"/><circle cx="9" cy="9" r="2" fill="#9bd8b5"/><path d="m5 17 5-5 3 3 2-2 4 4" fill="none" stroke="#9bd8b5" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    pdf: '<path d="M5 2.8h10l4 4v14.4H5z" fill="#d85b5b" fill-opacity=".12" stroke="#e27575" stroke-width="1.4"/><path d="M15 2.8v4h4M7.5 15h2c2.5 0 2.5-4 0-4h-2v6m5-6v6h1c3 0 3-6 0-6zm5 6v-6h3" fill="none" stroke="#ed9696" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>',
    generic: '<path d="M5 3h9l5 5v13H5z" fill="#879b98" fill-opacity=".1" stroke="#91aaa4" stroke-width="1.4"/><path d="M14 3v5h5M8 12h8m-8 3h6" fill="none" stroke="#afc4bd" stroke-width="1.35" stroke-linecap="round"/>'
  };

  const extensionMap = {
    html: "html", htm: "html", xhtml: "html",
    css: "css", scss: "css", sass: "css", less: "css",
    js: "javascript", mjs: "javascript", cjs: "javascript",
    ts: "typescript", mts: "typescript", cts: "typescript",
    jsx: "react", tsx: "react", vue: "vue", svelte: "svelte",
    json: "json", jsonc: "json", json5: "json", ipynb: "json",
    md: "markdown", markdown: "markdown", mdx: "markdown",
    py: "python", pyw: "python", pyi: "python",
    java: "java", kt: "kotlin", kts: "kotlin",
    swift: "swift", go: "go", rs: "rust",
    c: "c", h: "c", cc: "cpp", cpp: "cpp", cxx: "cpp", hpp: "cpp", hh: "cpp",
    cs: "csharp", php: "php", rb: "ruby", gemspec: "ruby",
    sql: "sql", mysql: "sql", pgsql: "sql",
    yml: "yaml", yaml: "yaml", sh: "shell", bash: "shell", zsh: "shell",
    dockerfile: "docker", graphql: "graphql", gql: "graphql",
    wasm: "wasm", wat: "wasm", xml: "xml", svg: "xml",
    toml: "toml", ini: "toml", conf: "toml",
    png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", avif: "image",
    pdf: "pdf"
  };

  function kindForFile(filename) {
    const name = String(filename || "").split(/[\\/]/).pop().toLowerCase();
    if (name === "dockerfile" || name.startsWith("dockerfile.")) return "docker";
    if (name === "makefile" || name === "justfile") return "shell";
    if (name === "readme" || name.startsWith("readme.")) return "markdown";
    if (name === ".gitignore" || name === ".gitattributes" || name === ".editorconfig") return "toml";
    const extension = name.includes(".") ? name.split(".").pop() : "";
    return extensionMap[extension] || "generic";
  }

  function svgForFile(filename) {
    const kind = kindForFile(filename);
    return '<svg class="aurora-file-svg aurora-file-svg--' + kind + '" viewBox="0 0 24 24" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">' + icons[kind] + '</svg>';
  }

  function mount(root) {
    (root || document).querySelectorAll("[data-file-icon]").forEach(node => {
      node.innerHTML = svgForFile(node.getAttribute("data-file-icon"));
    });
  }

  window.AuroraFileIcons = Object.freeze({ kindForFile, svgForFile, mount });
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => mount(document), { once: true });
  } else {
    mount(document);
  }
})();