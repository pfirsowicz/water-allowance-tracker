"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require("playwright-core");

(async () => {
  const executablePath = process.env.CHROME_EXECUTABLE ||
    (process.platform === "win32"
      ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
      : "/usr/bin/google-chrome");
  if (!fs.existsSync(executablePath)) {
    throw new Error("Chrome executable unavailable. Set CHROME_EXECUTABLE for the local browser test.");
  }

  const root = path.resolve(__dirname, "..");
  const pageUrl = "file:///" + path.join(root, "docs/demo/index.html").replace(/\\/g, "/");
  const browser = await chromium.launch({
    executablePath, headless: true,
    args: ["--no-first-run", "--disable-background-networking", "--disable-sync"]
  });
  try {
    for (const width of [1440, 768, 390, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const browserErrors = [];
      page.on("pageerror", error => browserErrors.push(error.message));
      page.on("request", request => {
        if (!request.url().startsWith("file:")) browserErrors.push("Network request: " + request.url());
      });

      await page.goto(pageUrl);
      await page.waitForFunction(() =>
        document.querySelector("#remainingOut")?.textContent.includes("1,600"));
      assert.equal(await page.locator("#readingsBody tr").count(), 4);
      await page.locator('#usageChart svg[role="img"]').waitFor();
      assert.equal(await page.locator("#usageChart rect[data-interval-end]").count(), 4);
      assert.equal(await page.locator("#usageChart .usage-bar-over").count(), 1);
      assert.equal(await page.locator("#usageChart .usage-allowance-line").count(), 1);
      assert.match(await page.locator("#usageChart .usage-allowance-label").textContent(), /800 L\/day/);
      assert.equal(await page.locator("#usageChart .visually-hidden li").count(), 4);

      const measurements = await page.evaluate(() => ({
        inner: window.innerWidth,
        scroll: document.documentElement.scrollWidth,
        sidebarCount: document.querySelectorAll(".app-sidebar").length
      }));
      assert.equal(measurements.inner, width);
      assert.ok(measurements.scroll <= width, "Page overflow at " + width + "px");
      assert.equal(measurements.sidebarCount, 0, "No sidebar must remain");
      await page.locator("#openReadingBtn").click();
      await page.locator("#readingDialog:not([hidden])").waitFor();
      await page.locator("#photoReadingBtn").click();
      assert.match(await page.locator("#photoNotice").textContent(), /Not available in this demo version/);
      await page.keyboard.press("Escape");
      assert.equal(await page.locator("#readingDialog").getAttribute("aria-hidden"), "true");
      await page.locator("#openReadingBtn").click();
      await page.locator("#manualReadingBtn").click();
      assert.equal(await page.locator("#readingDialog").getAttribute("aria-hidden"), "true");
      assert.equal(await page.locator("#currentReading").evaluate(el => document.activeElement === el), true);

      if (width === 1440 && process.env.UPDATE_SCREENSHOT === "1") {
        await page.screenshot({ path: path.join(root, "docs/screenshot.png") });
      }

      if (width === 390) {
        await page.locator("#currentDate").fill("16/01/2026");
        await page.locator("#currentReading").fill("110000");
        await page.locator("#saveBtn").click();
        await page.waitForFunction(() => document.querySelectorAll("#readingsBody tr").length === 5);
        assert.equal(await page.locator("#usageChart rect[data-interval-end]").count(), 5);
        assert.match(await page.locator("#successBox").textContent(), /saved/i);

        await page.locator("#readingsBody tr").first().locator("button").first().click();
        assert.equal(await page.locator("#saveBtn").textContent(), "Update reading");
        await page.locator("#currentReading").fill("109500");
        await page.locator("#saveBtn").click();
        await page.waitForFunction(() =>
          document.querySelector("#readingsBody tr")?.textContent.includes("109,500"));
        assert.equal(await page.locator("#readingsBody tr").count(), 5);

        page.once("dialog", dialog => dialog.accept());
        await page.locator("#readingsBody tr").first().locator("button.danger").click();
        await page.waitForFunction(() => document.querySelectorAll("#readingsBody tr").length === 4);
        assert.equal(await page.locator("#usageChart rect[data-interval-end]").count(), 4);

        await page.locator("#openSettingsBtn").click();
        await page.locator("#dailyLimit").fill("850");
        await page.locator("#saveSettingsBtn").click();
        await page.waitForFunction(() => document.querySelector("#settingsSummary")?.textContent.includes("850"));
        assert.match(await page.locator("#usageChart .usage-allowance-label").textContent(), /850 L\/day/);
        assert.equal(await page.locator("#usageChart .usage-bar-over").count(), 0);

        await page.locator("#exportBtn").click();
        assert.equal(await page.locator("#readingsBody tr").count(), 4);
      }

      assert.deepEqual(browserErrors, [], "Browser console or external network errors");
      console.log("PASS responsive UI, " + width + "px");
      await page.close();
    }
  } finally {
    await browser.close();
  }
})().catch(err => {console.error(err.stack || String(err));process.exitCode = 1;});
