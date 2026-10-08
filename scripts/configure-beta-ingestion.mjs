// Prepare the worker first, then grant the existing core identity access to that queue only.
import { pathToFileURL } from 'node:url';
import { assertBetaProject, cloud, projectId, region } from './lib/firebase-beta.mjs';
import { mergeGrants } from './configure-beta-runtime.mjs';

const coreEmail = `tuur-beta-core@${projectId}.iam.gserviceaccount.com`;
const member = `serviceAccount:${coreEmail}`;
const queueName = `projects/${projectId}/locations/${region}/queues/ingestArea`;
const queueUrl = `https://cloudtasks.googleapis.com/v2/${queueName}`;
const accountUrl = `https://iam.googleapis.com/v1/projects/${projectId}/serviceAccounts/${coreEmail}`;

/** IAM changes are narrow, additive and protected by the current policy etag. */
async function grant(request, url, role, serviceAccount = false) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const policy = await request(
      'POST',
      `${url}:getIamPolicy${serviceAccount ? '?options.requestedPolicyVersion=3' : ''}`,
      serviceAccount ? undefined : { options: { requestedPolicyVersion: 3 } },
    );
    const merged = mergeGrants(policy, [{ role, members: [member] }]);
    if (!merged.changed) return 'preserved';
    if (!policy.etag) throw new Error('Refusing ingestion IAM update without a policy etag');
    try {
      await request('POST', `${url}:setIamPolicy`, { policy: merged.policy });
      return 'granted';
    } catch (error) {
      if (![409, 412].includes(error.status) || attempt === 2) throw error;
    }
  }
}

export async function configureBetaIngestion({
  apply = false,
  request = cloud,
  assertProject = assertBetaProject,
} = {}) {
  const plan = {
    project: projectId,
    mode: apply ? 'apply' : 'plan_only_no_cloud_calls',
    queue: queueName,
    member,
    grants: [
      { resource: queueName, role: 'roles/cloudtasks.enqueuer' },
      { resource: coreEmail, role: 'roles/iam.serviceAccountUser' },
    ],
    workerInvocation: 'The ingestArea function deployment grants only the core identity invocation.',
  };
  if (!apply) return plan;
  await assertProject();
  const queue = await request('GET', queueUrl);
  if (queue.name !== queueName || queue.rateLimits?.maxConcurrentDispatches !== 1)
    throw new Error('Deploy the serial beta ingestion worker before configuring its queue access');
  const account = await request('GET', accountUrl);
  if (account.email !== coreEmail || account.disabled) throw new Error('Expected active beta core identity');
  return {
    ...plan,
    results: {
      enqueue: await grant(request, queueUrl, 'roles/cloudtasks.enqueuer'),
      useOwnIdentity: await grant(request, accountUrl, 'roles/iam.serviceAccountUser', true),
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(
    JSON.stringify(await configureBetaIngestion({ apply: process.argv.includes('--apply') }), null, 2),
  );
}
