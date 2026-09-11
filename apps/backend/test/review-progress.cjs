const assert = require('node:assert/strict');
const { test } = require('node:test');
const { after } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
process.env.REVIEW_STATE_FILE = path.join(require('node:os').tmpdir(), `review-test-${require('node:crypto').randomUUID()}.local`);
after(() => { if (fs.existsSync(process.env.REVIEW_STATE_FILE)) fs.unlinkSync(process.env.REVIEW_STATE_FILE); });
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
  assert.equal(service.getCheckStatus().phase, 'INTERRUPTED');
  assert.equal(service.getCheckStatus().completedSources, 1);
  assert.match(service.getCheckStatus().error, /fallo simulado/);
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
  assert.equal(service.getCheckStatus().phase, 'CANCELLED');
});

test('session failure remains visible after the request finishes', async () => {
  session.hasStoredSession = async () => false;
  const service = new FacebookService({ source: { findMany: async () => [{ id: '1', name: 'Una' }] } }, {});
  await service.checkAllActiveSources();
  assert.equal(service.getCheckStatus().phase, 'INTERRUPTED');
  assert.match(service.getCheckStatus().error, /sesión/);
});

test('process restart preserves interruption and shutdown rejects new reviews', async () => {
  const { newReviewState, ReviewStateStore } = require('../dist/facebook/review-state');
  new ReviewStateStore().write(newReviewState());
  const service = new FacebookService({}, {});
  assert.equal(service.getCheckStatus().phase, 'INTERRUPTED');
  assert.match(service.getCheckStatus().error, /reinició/);
  service.prepareShutdown();
  await assert.rejects(service.checkAllActiveSources(), /apagando/);
});

test('shutdown control rejects remote addresses and foreign browser origins', () => {
  const { assertLocalControl } = require('../dist/facebook/system.controller');
  assert.doesNotThrow(() => assertLocalControl({ ip: '127.0.0.1', headers: { 'x-scrapping-control': 'shutdown', origin: 'http://localhost:5173' } }));
  assert.throws(() => assertLocalControl({ ip: '192.168.1.10', headers: { 'x-scrapping-control': 'shutdown' } }));
  assert.throws(() => assertLocalControl({ ip: '127.0.0.1', headers: { 'x-scrapping-control': 'shutdown', origin: 'https://example.com' } }));
  assert.throws(() => assertLocalControl({ ip: '127.0.0.1', headers: {} }));
});
