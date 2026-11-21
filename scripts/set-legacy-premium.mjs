/**
 * One-time Admin SDK script: mark every account that already exists on switch day
 * with `legacyPremium: true`. Firestore security rules make this field immutable
 * for clients (and for client-side admin writes). Only Admin SDK may set it.
 *
 * Emulator:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *   node scripts/set-legacy-premium.mjs --dry-run
 *
 * Production requires GOOGLE_APPLICATION_CREDENTIALS. Do not commit credentials.
 *
 * Usage:
 *   node scripts/set-legacy-premium.mjs [--dry-run] [--switch-day YYYY-MM-DD]
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const dayIdx = args.indexOf('--switch-day');
const switchDay = dayIdx >= 0 ? args[dayIdx + 1] : new Date().toISOString().slice(0, 10);
const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'mholt-uculi';

if (!admin.apps.length) {
  admin.initializeApp({ projectId });
}

const db = admin.firestore();
const auth = admin.auth();

const cutoff = new Date(`${switchDay}T23:59:59.999Z`);
let nextPageToken;
let scanned = 0;
let marked = 0;
const sample = [];

do {
  const page = await auth.listUsers(1000, nextPageToken);
  for (const user of page.users) {
    scanned += 1;
    const created = user.metadata?.creationTime ? new Date(user.metadata.creationTime) : null;
    if (created && created > cutoff) continue;
    const ref = db.collection('users').doc(user.uid);
    if (dryRun) {
      marked += 1;
      if (sample.length < 5) sample.push(user.uid);
      continue;
    }
    await ref.set({
      legacyPremium: true,
      legacyPremiumMarkedAt: admin.firestore.FieldValue.serverTimestamp(),
      legacyPremiumSwitchDay: switchDay
    }, { merge: true });
    marked += 1;
    if (sample.length < 5) sample.push(user.uid);
  }
  nextPageToken = page.pageToken;
} while (nextPageToken);

console.log(JSON.stringify({
  ok: true,
  dryRun,
  switchDay,
  scanned,
  marked,
  sample
}, null, 2));
