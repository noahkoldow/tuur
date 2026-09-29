// Grants or revokes the `admin` custom claim: node scripts/set-admin.mjs <email> [--revoke]
// Uses Application Default Credentials (gcloud auth application-default login) and GCLOUD_PROJECT / FIREBASE_CONFIG.
// The user has to sign in again (or refresh the ID token) for the claim to take effect.
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const [email, flag] = process.argv.slice(2);
if (!email) {
  console.error('usage: node scripts/set-admin.mjs <email> [--revoke]');
  process.exit(1);
}
initializeApp({ credential: applicationDefault(), projectId: process.env.GCLOUD_PROJECT });
const auth = getAuth();
const user = await auth.getUserByEmail(email);
const claims = { ...(user.customClaims ?? {}) };
if (flag === '--revoke') delete claims.admin;
else claims.admin = true;
await auth.setCustomUserClaims(user.uid, claims);
console.log(`${flag === '--revoke' ? 'Revoked' : 'Granted'} admin for ${email} (${user.uid})`);
