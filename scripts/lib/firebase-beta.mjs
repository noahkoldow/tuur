import { createRequire } from 'node:module';

export const projectId = 'tuur-beta-noehxpo';
export const projectNumber = '1075077973046';
export const region = 'europe-west1';
const require = createRequire(import.meta.url);
process.env.DEBUG = '';

/** Uses the existing Firebase CLI login in memory. Never print credentials or response tokens. */
export async function accessToken() {
  const auth = require('firebase-tools/lib/auth');
  const account = auth.getProjectDefaultAccount(process.cwd());
  if (!account?.tokens?.refresh_token) throw new Error('Firebase CLI login is required');
  const token = await auth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
  if (!token.access_token) throw new Error('Firebase CLI access token unavailable');
  return token.access_token;
}

export async function cloud(method, url, body) {
  const target = new URL(url);
  if (!target.hostname.endsWith('.googleapis.com')) throw new Error('Only Google Cloud API calls are supported');
  const response = await fetch(target, {
    method,
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json', 'x-goog-user-project': projectId },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const error = new Error(`${method} ${target.origin}${target.pathname}: HTTP ${response.status} ${data.error?.status ?? ''}`);
    error.status = response.status;
    error.details = data.error;
    throw error;
  }
  return data;
}

export async function assertBetaProject() {
  const project = await cloud('GET', `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}`);
  if (project.projectId !== projectId || project.projectNumber !== projectNumber || project.lifecycleState !== 'ACTIVE')
    throw new Error('Expected isolated active beta project');
}

export function firestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  return { mapValue: { fields: firestoreFields(value) } };
}
export function firestoreFields(value) {
  return Object.fromEntries(Object.entries(value).filter(([,v]) => v !== undefined).map(([k,v]) => [k, firestoreValue(v)]));
}
export const firestoreBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
