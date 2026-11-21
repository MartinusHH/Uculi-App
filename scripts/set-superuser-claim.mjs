/**
 * Admin SDK only: set or clear the Auth custom claim `superuser`.
 * Never call this from the client. For emulator testing, set:
 *   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
 *
 * Usage:
 *   node scripts/set-superuser-claim.mjs --uid <uid> [--clear]
 *   node scripts/set-superuser-claim.mjs --email <email> [--clear]
 *
 * Production requires GOOGLE_APPLICATION_CREDENTIALS (service account).
 * Do not commit credential files.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');

const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : '';
};
const clear = args.includes('--clear');
const uidArg = getArg('--uid');
const emailArg = getArg('--email');
const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'mholt-uculi';

if (!uidArg && !emailArg) {
  console.error('Provide --uid <uid> or --email <email>');
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({ projectId });
}

const auth = admin.auth();
const user = uidArg
  ? await auth.getUser(uidArg)
  : await auth.getUserByEmail(emailArg);
const nextClaims = { ...(user.customClaims || {}) };
if (clear) delete nextClaims.superuser;
else nextClaims.superuser = true;
await auth.setCustomUserClaims(user.uid, nextClaims);
console.log(JSON.stringify({
  ok: true,
  uid: user.uid,
  email: user.email || '',
  superuser: nextClaims.superuser === true
}, null, 2));
