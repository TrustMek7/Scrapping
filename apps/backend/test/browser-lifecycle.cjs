const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { withFacebookContext } = require('../dist/facebook/lib/browser');
const originalLaunch = chromium.launchPersistentContext;
after(() => { chromium.launchPersistentContext = originalLaunch; });

test('timeout closes the extraction context before reporting completion', async () => {
  let closed = false;
  chromium.launchPersistentContext = async () => ({
    setDefaultTimeout() {}, setDefaultNavigationTimeout() {},
    close: async () => { closed = true; },
  });
  await assert.rejects(withFacebookContext(true, () => new Promise(() => {}), 5), error => error.code === 'TIMEOUT');
  assert.equal(closed, true);
});

test('network failure returns a connection-specific message', async () => {
  chromium.launchPersistentContext = async () => ({
    setDefaultTimeout() {}, setDefaultNavigationTimeout() {}, close: async () => {},
  });
  await assert.rejects(withFacebookContext(true, async () => { throw new Error('net::ERR_INTERNET_DISCONNECTED'); }), error => error.code === 'CONNECTION_ERROR');
});
