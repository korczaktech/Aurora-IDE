const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const page = await browser.newPage();
    const pageErrors = [];
    const browserDiagnostics = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    page.on("console", message => {
      if (message.type() === "error" || message.type() === "warning") browserDiagnostics.push("console." + message.type() + ": " + message.text());
    });
    page.on("requestfailed", request => browserDiagnostics.push("request failed: " + request.url() + " — " + request.failure()?.errorText));
    page.on("response", response => {
      if (response.status() >= 400) browserDiagnostics.push("HTTP " + response.status() + ": " + response.url());
    });
    await page.goto(process.env.AURORA_SMOKE_URL || "http://127.0.0.1:4173/linux-runtime-smoke.html", { waitUntil: "load" });
    try {
      await page.waitForFunction(() => {
        const output = document.querySelector("#terminal .xterm-rows")?.innerText || "";
        return Boolean(document.body.dataset.runtimeError) || (window.smokeRuntime?.state === "running" && output.includes("__AURORA_WORKSPACE_READY__"));
      }, null, { timeout: 45000 });
    } catch (error) {
      const diagnostic = await page.evaluate(() => ({
        runtimeError: document.body.dataset.runtimeError || null,
        bodyText: document.body.innerText,
        terminalText: document.querySelector("#terminal .xterm-rows")?.innerText || null,
        xtermPresent: Boolean(document.querySelector("#terminal .xterm")),
        runtimeState: window.smokeRuntime?.state || null
      }));
      throw new Error("Linux boot did not produce a shell prompt. " + JSON.stringify(diagnostic) + " Browser diagnostics: " + browserDiagnostics.join(" | "));
    }

    const startupError = await page.locator("body").getAttribute("data-runtime-error");
    if (startupError) throw new Error("Falha no boot Linux/Git: " + startupError);

    await page.waitForFunction(() => Boolean(document.body.dataset.gitSmoke), null, { timeout: 45000 });
    const gitSmoke = await page.locator("body").getAttribute("data-git-smoke");
    if (gitSmoke !== "passed") {
      const runtimeDiagnostic = await page.locator("body").getAttribute("data-runtime-error");
      throw new Error("Git browser smoke test failed: " + gitSmoke + (runtimeDiagnostic ? " | " + runtimeDiagnostic : "") + " | Browser diagnostics: " + browserDiagnostics.join(" | "));
    }

    await page.waitForFunction(() => Boolean(document.body.dataset.nodeSmoke), null, { timeout: 90000 });
    const nodeSmoke = await page.locator("body").getAttribute("data-node-smoke");
    if (nodeSmoke !== "passed") throw new Error("Node WebAssembly browser smoke test failed: " + nodeSmoke + " | Browser diagnostics: " + browserDiagnostics.join(" | "));

    try {
      await page.waitForFunction(() => Boolean(document.body.dataset.npmSmoke), null, { timeout: 180000 });
    } catch (error) {
      const npmStatus = await page.locator("body").getAttribute("data-npm-status");
      const npmTrace = await page.locator("body").getAttribute("data-npm-trace");
      throw new Error("npm/TypeScript browser smoke timed out; status=" + npmStatus + " trace=" + npmTrace + " | " + error.message);
    }
    const npmSmoke = await page.locator("body").getAttribute("data-npm-smoke");
    if (npmSmoke !== "passed") throw new Error("npm/TypeScript browser smoke test failed: " + npmSmoke + " | Browser diagnostics: " + browserDiagnostics.join(" | "));

    await page.waitForFunction(() => Boolean(document.body.dataset.pythonSmoke), null, { timeout: 180000 });
    const pythonSmoke = await page.locator("body").getAttribute("data-python-smoke");
    if (pythonSmoke !== "passed") throw new Error("Python project browser smoke test failed: " + pythonSmoke + " | Browser diagnostics: " + browserDiagnostics.join(" | "));

    await page.locator("#terminal .xterm").click();
    await page.keyboard.type("cat README.md && echo AURORA_LINUX_READY");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => {
      const output = document.querySelector("#terminal .xterm-rows")?.innerText || "";
      return output.includes("AURORA_LINUX_READY") && (output.match(/~% /g) || []).length >= 2;
    }, null, { timeout: 30000 });

    if (pageErrors.length) throw new Error("Erros JavaScript no navegador: " + pageErrors.join(" | ") + " Browser diagnostics: " + browserDiagnostics.join(" | "));
    await page.evaluate(async () => window.smokeRuntime?.stop());
    process.stdout.write("Linux browser smoke test passed: boot, 9p project mount, shell commands, project write-back, and shutdown.\n");
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
