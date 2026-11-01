const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.goto(process.env.AURORA_SMOKE_URL || "http://127.0.0.1:4173/linux-runtime-smoke.html", { waitUntil: "load" });
    await page.waitForFunction(() => {
      const output = document.querySelector("#terminal .xterm-rows")?.innerText || "";
      return Boolean(document.body.dataset.runtimeError) || output.includes("~% ");
    }, null, { timeout: 120000 });

    const startupError = await page.locator("body").getAttribute("data-runtime-error");
    if (startupError) throw new Error("Falha no boot Linux: " + startupError);

    await page.locator("#terminal .xterm").click();
    await page.keyboard.type("echo AURORA_LINUX_READY");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => {
      const output = document.querySelector("#terminal .xterm-rows")?.innerText || "";
      return output.includes("AURORA_LINUX_READY") && (output.match(/~% /g) || []).length >= 2;
    }, null, { timeout: 30000 });

    if (pageErrors.length) throw new Error("Erros JavaScript no navegador: " + pageErrors.join(" | "));
    await page.evaluate(async () => window.smokeRuntime?.stop());
    process.stdout.write("Linux browser smoke test passed: boot serial, shell prompt, command input/output, and shutdown.\n");
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
