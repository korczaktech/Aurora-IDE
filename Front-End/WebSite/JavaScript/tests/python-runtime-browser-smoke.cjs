const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
  try {
    const page = await browser.newPage();
    page.on("pageerror", error => console.error("Browser page error:", error.message));
    await page.goto("http://127.0.0.1:4173/JavaScript/tests/python-runtime-smoke.html", { waitUntil: "load" });
    await page.waitForFunction(() => document.body.dataset.pythonSmoke === "passed" && document.body.dataset.terminalInputSmoke === "passed", null, { timeout: 240000 });
    const status = await page.locator("body").getAttribute("data-python-smoke");
    const terminalStatus = await page.locator("body").getAttribute("data-terminal-input-smoke");
    const details = await page.locator("#result").innerText();
    if (status !== "passed" || terminalStatus !== "passed") throw new Error("Python terminal browser smoke failed: " + details);
    process.stdout.write("Python browser smoke passed: execution, xterm input(), stdout, escaped newlines, and project file synchronization.\n");
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
