import assert from 'node:assert/strict';
import { test } from 'node:test';
import { configureBetaIngestion } from './configure-beta-ingestion.mjs';

test('ingestion plan makes no cloud calls', async () => {
  const fail = () => {
    throw new Error('unexpected cloud request');
  };
  const plan = await configureBetaIngestion({ request: fail, assertProject: fail });
  assert.equal(plan.mode, 'plan_only_no_cloud_calls');
  assert.equal(plan.grants.length, 2);
  assert.ok(plan.grants[0].resource.endsWith('/queues/ingestArea'));
});

function fixture({ concurrency = 1, conflict = false } = {}) {
  const writes = [];
  let assertions = 0;
  let conflicted = false;
  const request = async (method, url, body) => {
    if (url.includes(':getIamPolicy'))
      return {
        version: 3,
        etag: conflicted ? 'new-etag' : 'original-etag',
        bindings: [
          {
            role: 'roles/viewer',
            members: ['user:existing@example.net'],
            condition: { expression: 'true', title: 'existing' },
          },
        ],
      };
    if (url.endsWith(':setIamPolicy')) {
      if (conflict && !conflicted) {
        conflicted = true;
        throw Object.assign(new Error('concurrent write'), { status: 409 });
      }
      writes.push({ url, body });
      return body.policy;
    }
    if (url.includes('cloudtasks.googleapis.com'))
      return {
        name: 'projects/tuur-beta-noehxpo/locations/europe-west1/queues/ingestArea',
        rateLimits: { maxConcurrentDispatches: concurrency },
      };
    return { email: 'tuur-beta-core@tuur-beta-noehxpo.iam.gserviceaccount.com' };
  };
  return {
    writes,
    request,
    assertProject: async () => {
      assertions++;
    },
    assertions: () => assertions,
  };
}

test('ingestion permissions preserve existing conditional bindings and target only queue and own identity', async () => {
  const f = fixture({ conflict: true });
  await configureBetaIngestion({ apply: true, ...f });
  assert.equal(f.assertions(), 1);
  assert.equal(f.writes.length, 2);
  for (const write of f.writes) {
    assert.equal(write.body.policy.etag, 'new-etag');
    assert.equal(write.body.policy.version, 3);
    assert.deepEqual(write.body.policy.bindings[0].members, ['user:existing@example.net']);
    assert.equal(write.body.policy.bindings[0].condition.expression, 'true');
    assert.equal(write.body.policy.bindings.length, 2);
  }
  assert.ok(f.writes[0].url.includes('/queues/ingestArea:'));
  assert.ok(f.writes[1].url.includes('/serviceAccounts/tuur-beta-core@'));
});

test('an absent serial worker cannot enable ingestion permissions', async () => {
  const f = fixture({ concurrency: 6 });
  await assert.rejects(configureBetaIngestion({ apply: true, ...f }), /serial beta ingestion worker/);
  assert.equal(f.writes.length, 0);
});
