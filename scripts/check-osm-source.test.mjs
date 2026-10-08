import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAdapter, main, parseArgs, runSourceCheck, sample } from './check-osm-source.mjs';

const endpoint = 'https://overpass.example/api/interpreter';
const monument = (id, tags = {}, coordinates = {}) => ({
  type: 'node',
  id,
  lat: 48.86,
  lon: 2.335,
  tags: { name: `Sample monument ${id}`, historic: 'monument', ...tags },
  ...coordinates,
});

test('the default command only prints its plan; no adapter or report write runs', async () => {
  const output = [];
  const exitCode = await main([`--endpoint=${endpoint}`], {
    emit: (text) => output.push(JSON.parse(text)),
    check: () => assert.fail('must not send a query without --run'),
    save: () => assert.fail('must not write without --output'),
  });
  assert.equal(exitCode, 0);
  assert.equal(output[0].status, 'planned');
  assert.deepEqual(output[0].sample, sample);
  assert.equal(output[0].requests, 1);
});

test('requires an explicit secret-free HTTPS endpoint and rejects unknown or duplicate options', () => {
  for (const args of [
    [],
    ['--run'],
    ['--endpoint=http://overpass.example/api/interpreter'],
    ['--endpoint=https://user:private-token@overpass.example/api/interpreter'],
    ['--endpoint=https://overpass.example/private-token/api/interpreter'],
    ['--endpoint=https://overpass.example/api/interpreter?key=private-token'],
    ['--endpoint=https://overpass.example/api/interpreter#private-token'],
    [`--endpoint=${endpoint}`, '--api-key=private-token'],
    [`--endpoint=${endpoint}`, '--run', '--run'],
  ])
    assert.throws(
      () => parseArgs(args),
      (error) => !error.message.includes('private-token'),
    );
});

test('one real adapter request produces named accessible app candidates and excludes private/outside objects', async (t) => {
  const adapter = await loadAdapter();
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    return Response.json({
      elements: [
        monument(1),
        monument(2, { name: 'Private stop', access: 'private' }),
        monument(3, { name: 'Outside sample' }, { lat: 49 }),
      ],
    });
  });
  const report = await runSourceCheck({ endpoint, adapter });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, endpoint);
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.ok(calls[0].options.signal instanceof AbortSignal);
  const query = new URLSearchParams(calls[0].options.body).get('data');
  assert.match(query, /\[timeout:60\]/);
  assert.ok(query.includes('(48.859,2.333,48.862,2.338)'));
  assert.match(query, /out center tags 1500/);
  assert.equal(report.status, 'passed');
  assert.equal(report.rawPoiCount, 3);
  assert.equal(report.inBoundsPoiCount, 2);
  assert.equal(report.namedAccessiblePoiCount, 1);
  assert.equal(report.examples[0].name, 'Sample monument 1');
});

test('HTTP 200 empty, private-only and partial responses never pass the source check', async (t) => {
  const adapter = await loadAdapter();
  for (const [payload, code] of [
    [{ elements: [] }, 'no_named_source_pois'],
    [{ elements: [monument(1, { access: 'private' })] }, 'no_eligible_app_pois'],
    [
      { elements: [monument(1)], remark: 'runtime error: private-provider-message' },
      'incomplete_or_invalid_response',
    ],
  ]) {
    t.mock.method(globalThis, 'fetch', async () => Response.json(payload));
    const report = await runSourceCheck({ endpoint, adapter });
    assert.equal(report.status, 'failed');
    assert.equal(report.failure.code, code);
    assert.ok(!JSON.stringify(report).includes('private-provider-message'));
    t.mock.restoreAll();
  }
});

test('provider failure makes only one attempt and report never copies the response body', async (t) => {
  const adapter = await loadAdapter();
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return new Response('private-provider-message', { status: 503 });
  });
  const report = await runSourceCheck({ endpoint, adapter });
  assert.equal(calls, 1);
  assert.deepEqual(report.failure, { code: 'http_error', httpStatus: 503 });
  assert.ok(!JSON.stringify(report).includes('private-provider-message'));
});

test('explicit run saves only the requested non-secret report and failure has a nonzero exit code', async () => {
  const report = { status: 'failed', failure: { code: 'timeout' } };
  const writes = [];
  const exitCode = await main([`--endpoint=${endpoint}`, '--run', '--output=report.json'], {
    emit: () => {},
    check: async (options) => {
      assert.equal(options.endpoint, endpoint);
      return report;
    },
    save: async (...args) => writes.push(args),
  });
  assert.equal(exitCode, 1);
  assert.deepEqual(writes, [['report.json', report]]);
});
