const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
  try {
    const page = await browser.newPage();
    page.on("pageerror", error => console.error("Browser page error:", error.message));
    await page.goto("http://127.0.0.1:4173/JavaScript/tests/python-runtime-smoke.html", { waitUntil: "load" });
    await page.waitForFunction(() => Boolean(document.body.dataset.pythonSmoke), null, { timeout: 180000 });
    const status = await page.locator("body").getAttribute("data-python-smoke");
    const details = await page.locator("#result").innerText();
    if (status !== "passed") throw new Error("Python runtime browser smoke failed: " + details);
    process.stdout.write("Python browser smoke passed: execution, terminal-backed input(), stdout, escaped newlines, and project file synchronization.\n");
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
