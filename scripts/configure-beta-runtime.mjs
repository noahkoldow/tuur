// Local plan: node scripts/configure-beta-runtime.mjs
// Apply only to the isolated beta: node scripts/configure-beta-runtime.mjs --apply
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  assertBetaProject,
  cloud,
  firestoreBase,
  firestoreFields,
  projectId,
  projectNumber,
} from './lib/firebase-beta.mjs';

const expectedProject = 'tuur-beta-noehxpo';
const expectedNumber = '1075077973046';
const bucket = `${expectedProject}.firebasestorage.app`;
const coreEmail = `tuur-beta-core@${expectedProject}.iam.gserviceaccount.com`;
const aiEmail = `tuur-beta-ai@${expectedProject}.iam.gserviceaccount.com`;
const member = (email) => `serviceAccount:${email}`;
const iamBase = `https://iam.googleapis.com/v1/projects/${expectedProject}`;
const projectPolicyBase = `https://cloudresourcemanager.googleapis.com/v1/projects/${expectedProject}`;
const bucketPolicyUrl = `https://storage.googleapis.com/storage/v1/b/${bucket}/iam`;
const aiAccountUrl = `${iamBase}/serviceAccounts/${aiEmail}`;
const policyOptions = { requestedPolicyVersion: 3 };
const roles = [
  {
    roleId: 'tuurBetaAccountLifecycle',
    title: 'TUUR beta account read and deletion',
    description: 'Read and delete Authentication users for beta account export and deletion.',
    includedPermissions: ['firebaseauth.users.get', 'firebaseauth.users.delete'],
  },
  {
    roleId: 'tuurBetaAudioSigner',
    title: 'TUUR beta audio URL signer',
    description: 'Sign short-lived audio URLs using only the beta AI service account.',
    includedPermissions: ['iam.serviceAccounts.signBlob'],
  },
];
const roleName = (role) => `projects/${expectedProject}/roles/${role.roleId}`;
const projectGrants = [
  { role: 'roles/datastore.user', members: [member(coreEmail), member(aiEmail)] },
  { role: roleName(roles[0]), members: [member(coreEmail)] },
];
const bucketGrants = [{ role: 'roles/storage.objectUser', members: [member(coreEmail), member(aiEmail)] }];
const signerGrants = [{ role: roleName(roles[1]), members: [member(aiEmail)] }];

/** Add only unconditional grants; retain conditions, audit configs, policy version and etag verbatim. */
export function mergeGrants(policy, grants) {
  const next = structuredClone(policy);
  next.bindings ??= [];
  let changed = false;
  for (const grant of grants) {
    let binding = next.bindings.find((entry) => entry.role === grant.role && !entry.condition);
    if (!binding) {
      binding = { role: grant.role, members: [] };
      next.bindings.push(binding);
    }
    for (const value of grant.members) {
      if (!binding.members.includes(value)) {
        binding.members.push(value);
        changed = true;
      }
    }
  }
  return { policy: next, changed };
}

async function loadAiConfig() {
  // Bundle shared TypeScript in memory: no generated file or stale copy of the real model defaults.
  const requireFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
  const { build } = requireFunctions('esbuild');
  const result = await build({
    entryPoints: [fileURLToPath(new URL('../packages/shared/src/config.ts', import.meta.url))],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    logLevel: 'silent',
  });
  const { AiConfigSchema, DEFAULT_AI_CONFIG } = await import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`
  );
  return AiConfigSchema.parse({
    ...DEFAULT_AI_CONFIG,
    dailyBudgetUsd: 1,
    areaDailyBudgetUsd: 0.5,
  });
}

async function getOptional(request, url) {
  try {
    return await request('GET', url);
  } catch (error) {
    if (error.status === 404) return undefined;
    throw error;
  }
}

async function ensureAccount(request, accountId, displayName) {
  const email = `${accountId}@${expectedProject}.iam.gserviceaccount.com`;
  const url = `${iamBase}/serviceAccounts/${email}`;
  let account = await getOptional(request, url);
  let created = false;
  if (!account) {
    try {
      account = await request('POST', `${iamBase}/serviceAccounts`, {
        accountId,
        serviceAccount: { displayName },
      });
      created = true;
    } catch (error) {
      if (error.status !== 409) throw error;
      account = await request('GET', url);
    }
  }
  if (account.email !== email || account.projectId !== expectedProject || account.disabled)
    throw new Error(`Unexpected or disabled runtime service account: ${email}`);
  return { email, action: created ? 'created' : 'preserved' };
}

async function ensureRole(request, desired) {
  const url = `https://iam.googleapis.com/v1/${roleName(desired)}`;
  let role = await getOptional(request, url);
  let created = false;
  if (!role) {
    const { roleId, ...definition } = desired;
    try {
      role = await request('POST', `${iamBase}/roles`, {
        roleId,
        role: { ...definition, stage: 'GA' },
      });
      created = true;
    } catch (error) {
      if (error.status !== 409) throw error;
      role = await request('GET', url);
    }
  }
  if (
    role.name !== roleName(desired) ||
    role.deleted ||
    role.stage === 'DISABLED' ||
    JSON.stringify([...(role.includedPermissions ?? [])].sort()) !==
      JSON.stringify([...desired.includedPermissions].sort())
  )
    throw new Error(`Existing custom role differs from the exact beta permissions: ${roleName(desired)}`);
  return { name: role.name, action: created ? 'created' : 'preserved' };
}

async function ensureGrants(label, read, write, grants) {
  // Retry optimistic-concurrency conflicts against a fresh policy; never replace a stale policy.
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await read();
    const merged = mergeGrants(current, grants);
    if (!merged.changed) return { resource: label, action: 'preserved' };
    if (!current.etag) throw new Error(`Refusing IAM update without an etag: ${label}`);
    try {
      await write(merged.policy);
      return { resource: label, action: 'grants_added' };
    } catch (error) {
      if (![409, 412].includes(error.status) || attempt === 2) throw error;
    }
  }
}

async function createAiConfig(request, config) {
  if (await getOptional(request, `${firestoreBase}/config/ai`))
    return { document: 'config/ai', action: 'preserved' };
  try {
    // createDocument rejects an existing ID, including a document created after our preceding read.
    await request('POST', `${firestoreBase}/config?documentId=ai`, {
      fields: firestoreFields(config),
    });
    return { document: 'config/ai', action: 'created' };
  } catch (error) {
    if (error.status !== 409) throw error;
    return { document: 'config/ai', action: 'preserved_concurrent_creation' };
  }
}

/** Dependency injection permits offline verification without touching cloud resources. */
export async function configureBetaRuntime({
  apply = false,
  request = cloud,
  assertProject = assertBetaProject,
} = {}) {
  if (projectId !== expectedProject || projectNumber !== expectedNumber)
    throw new Error('The beta helper targets an unexpected project');
  const aiConfig = await loadAiConfig();
  const plan = {
    project: expectedProject,
    projectNumber: expectedNumber,
    mode: apply ? 'apply' : 'plan_only_no_cloud_calls',
    serviceAccounts: [coreEmail, aiEmail],
    customRoles: roles.map((role) => ({ name: roleName(role), permissions: role.includedPermissions })),
    grants: { project: projectGrants, bucket: { name: bucket, grants: bucketGrants }, aiSelf: signerGrants },
    createOnlyAiConfig: {
      document: 'config/ai',
      models: aiConfig.models,
      dailyBudgetUsd: aiConfig.dailyBudgetUsd,
      areaDailyBudgetUsd: aiConfig.areaDailyBudgetUsd,
      groundingEnabled: aiConfig.groundingEnabled,
      killSwitch: aiConfig.killSwitch,
      remainingFields: 'Current shared defaults, validated by AiConfigSchema',
    },
    notes: [
      'Existing IAM bindings and etags are preserved; conflicting custom roles stop the run.',
      'An existing config/ai is never changed. AI admission estimates are not an invoice hard cap.',
      'Does not deploy functions, enable APIs, bind secrets, change SMS, or alter billing.',
    ],
  };
  if (!apply) return plan;
  await assertProject();
  const actions = [];
  for (const role of roles) actions.push(await ensureRole(request, role));
  actions.push(await ensureAccount(request, 'tuur-beta-core', 'TUUR beta core runtime'));
  actions.push(await ensureAccount(request, 'tuur-beta-ai', 'TUUR beta AI runtime'));
  actions.push(
    await ensureGrants(
      expectedProject,
      () => request('POST', `${projectPolicyBase}:getIamPolicy`, { options: policyOptions }),
      (policy) => request('POST', `${projectPolicyBase}:setIamPolicy`, { policy }),
      projectGrants,
    ),
  );
  actions.push(
    await ensureGrants(
      bucket,
      () => request('GET', `${bucketPolicyUrl}?optionsRequestedPolicyVersion=3`),
      (policy) => request('PUT', bucketPolicyUrl, policy),
      bucketGrants,
    ),
  );
  actions.push(
    await ensureGrants(
      aiEmail,
      () => request('POST', `${aiAccountUrl}:getIamPolicy?options.requestedPolicyVersion=3`),
      (policy) => request('POST', `${aiAccountUrl}:setIamPolicy`, { policy }),
      signerGrants,
    ),
  );
  actions.push(await createAiConfig(request, aiConfig));
  return { ...plan, actions };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--apply') || args.length > 1)
    throw new Error('Usage: node scripts/configure-beta-runtime.mjs [--apply]');
  try {
    console.log(JSON.stringify(await configureBetaRuntime({ apply: args.includes('--apply') }), null, 2));
  } catch (error) {
    // The cloud helper's concise message contains no request body, token or secret value.
    console.error(error.message);
    process.exitCode = 1;
  }
}
