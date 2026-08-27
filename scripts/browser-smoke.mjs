import assert from "node:assert/strict";

import { chromium } from "playwright";

const browser = await chromium.launch();

try {
  const page = await browser.newPage();
  await page.goto("data:text/html,<title>Playwright smoke</title>");
  assert.equal(await page.title(), "Playwright smoke");
} finally {
  await browser.close();
}

assert.equal(browser.isConnected(), false);
