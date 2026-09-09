const assert = require('node:assert/strict');
const { test } = require('node:test');
const session = require('../dist/facebook/lib/session');
const browser = require('../dist/facebook/lib/browser');
const { FacebookService } = require('../dist/facebook/facebook.service');

test('reports each source and clears running state after a partial failure', async () => {
  const sources = [{ id: '1', name: 'Primera' }, { id: '2', name: 'Segunda' }];
  session.hasStoredSession = async () => true;
  browser.withFacebookContext = async (_headless, action) => action({});
  const service = new FacebookService({ source: { findMany: async () => sources } }, {});
  const observed = [];
  service.checkSource = async (source) => {
    observed.push(service.getCheckStatus());
    if (source.id === '1') throw new Error('fallo simulado');
    return [];
  };
  const results = await service.checkAllActiveSources();
  assert.deepEqual(observed.map(s => [s.sourceName, s.sourceIndex, s.totalSources, s.running]), [
    ['Primera', 1, 2, true], ['Segunda', 2, 2, true],
  ]);
  assert.equal(results[0].ok, false);
  assert.equal(results[1].ok, true);
  assert.equal(service.getCheckStatus().running, false);
  assert.equal(service.getCheckStatus().startedAt, observed[0].startedAt);
});

test('cancellation stops before the next source and clears state', async () => {
  session.hasStoredSession = async () => true;
  browser.withFacebookContext = async (_headless, action) => action({});
  const service = new FacebookService({ source: { findMany: async () => [{ id: '1', name: 'Una' }, { id: '2', name: 'Dos' }] } }, {});
  service.checkSource = async () => {
    assert.equal(service.cancelActiveCheck().cancellationRequested, true);
    return [];
  };
  assert.equal((await service.checkAllActiveSources()).length, 1);
  assert.equal(service.getCheckStatus().running, false);
  assert.equal(service.getCheckStatus().cancellationRequested, false);
});
