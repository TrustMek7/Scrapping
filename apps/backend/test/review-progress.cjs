const assert = require('node:assert/strict');
const { test } = require('node:test');
const session = require('../dist/facebook/lib/session');
const browser = require('../dist/facebook/lib/browser');
const { FacebookService } = require('../dist/facebook/facebook.service');
const { describeMissingText } = require('../dist/facebook/facebook.service');
const { AnalysisService } = require('../dist/analysis/analysis.service');

test('reports each source and clears running state after a partial failure', async () => {
  const sources = [{ id: '1', name: 'Primera' }, { id: '2', name: 'Segunda' }];
  session.hasStoredSession = async () => true;
  browser.withFacebookContext = async (_headless, action) => action({});
  const service = new FacebookService({ reviewRun: { create: async () => ({ id: 12 }) }, source: { findMany: async () => sources } }, {});
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
  assert.equal(observed[0].reviewRunId, 12);
  assert.equal(results[1].ok, true);
  assert.equal(service.getCheckStatus().running, false);
  assert.equal(service.getCheckStatus().startedAt, observed[0].startedAt);
});

test('media warnings distinguish live, video, reel, image and unknown content', () => {
  for (const [kind, label] of [['LIVE', 'Transmisión'], ['VIDEO', 'Video'], ['REEL', 'Reel']]) {
    assert.ok(describeMissingText({ kind, images: [] }).startsWith(label));
  }
  assert.ok(describeMissingText({ kind: 'POST', images: [{}] }).startsWith('Imagen'));
  assert.match(describeMissingText({ kind: 'POST', images: [] }), /podría/);
});

test('history queries only relevant analyses without deleting stored publications', async () => {
  let query;
  const service = new AnalysisService({}, { publication: { findMany: async (q) => { query = q; return []; } } }, {}, {});
  assert.deepEqual(await service.listRecent(), []);
  assert.deepEqual(query.where, { analysis: { is: { relevant: true } } });
});

test('duplicate publication keeps its original review number', async () => {
  const existing = { id: 'old', reviewRunId: 8 };
  const service = new AnalysisService({}, {
    publication: { findUnique: async () => existing },
    analysis: { findUnique: async () => null },
  }, {}, {});
  const result = await service.persistWithoutText({ sourceId: '1', title: '', content: '', url: 'https://example.com/post', reviewRunId: 12 });
  assert.equal(result.publication.reviewRunId, 8);
  assert.equal(result.deduplicated, true);
});

test('cancellation stops before the next source and clears state', async () => {
  session.hasStoredSession = async () => true;
  browser.withFacebookContext = async (_headless, action) => action({});
  const service = new FacebookService({ reviewRun: { create: async () => ({ id: 12 }) }, source: { findMany: async () => [{ id: '1', name: 'Una' }, { id: '2', name: 'Dos' }] } }, {});
  service.checkSource = async () => {
    assert.equal(service.cancelActiveCheck().cancellationRequested, true);
    return [];
  };
  assert.equal((await service.checkAllActiveSources()).length, 1);
  assert.equal(service.getCheckStatus().running, false);
  assert.equal(service.getCheckStatus().cancellationRequested, false);
});
