/**
 * Emulator proof: a regular signed-in user cannot set legacyPremium, superuser,
 * or paid premium entitlement fields on their user doc.
 *
 * Requires Auth :9099 and Firestore :8080 emulators + rules loaded.
 */
import fs from 'fs';
import { spawnSync } from 'child_process';

const ART = '/opt/cursor/artifacts';
fs.mkdirSync(ART, { recursive: true });
const PROJECT = 'mholt-uculi';
const AUTH = 'http://127.0.0.1:9099';
const FIRESTORE = 'http://127.0.0.1:8080';

const results = [];
const log = (name, ok, detail = '') => {
  results.push({ name, ok, detail: String(detail).slice(0, 280) });
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ' — ' + String(detail).slice(0, 180) : ''}`);
};

async function signUp(email, password) {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-${PROJECT}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const data = await res.json();
  if (!data.idToken || !data.localId) throw new Error(`signUp failed: ${JSON.stringify(data)}`);
  return data;
}

function encodeValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') return { integerValue: String(Math.trunc(value)) };
  if (typeof value === 'object' && !Array.isArray(value)) {
    const fields = {};
    for (const [key, nested] of Object.entries(value)) fields[key] = encodeValue(nested);
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

async function patchUser(uid, idToken, fields) {
  const body = {
    fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, encodeValue(v)]))
  };
  const names = Object.keys(fields).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  const url = `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/users/${uid}?${names}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`
    },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_e) { json = { raw: text }; }
  return { status: res.status, json };
}

async function createUserDoc(uid, idToken, fields) {
  const body = {
    fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, encodeValue(v)]))
  };
  const url = `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/users?documentId=${uid}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`
    },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_e) { json = { raw: text }; }
  return { status: res.status, json };
}

function denied(result) {
  return result.status === 403 || /PERMISSION_DENIED|permission/i.test(JSON.stringify(result.json || {}));
}

// Ensure latest rules are loaded into the emulator.
const load = spawnSync('npx', ['--yes', 'firebase-tools@latest', 'emulators:exec', '--only', 'firestore', '--project', PROJECT, 'true'], {
  cwd: '/workspace',
  encoding: 'utf8',
  timeout: 5000
});
// Prefer rules reload via REST if emulator already running: write rules file is enough when emulator started with project.
void load;

const stamp = Date.now();
const email = `entitlement.user.${stamp}@uculi.test`;
const password = 'testpass123';

try {
  const user = await signUp(email, password);
  const { localId: uid, idToken } = user;

  // Seed a harmless free profile first (allowed).
  const seed = await createUserDoc(uid, idToken, {
    email,
    displayName: 'Entitlement Tester',
    premium: false,
    legacyPremium: false,
    billing: { status: 'free', planId: 'premium' }
  });
  log('user can create free profile', seed.status === 200 || seed.status === 201, JSON.stringify({ status: seed.status, err: seed.json?.error?.status || seed.json?.error || '' }));

  // If create collided because doc exists, continue with patches.
  const attempts = [
    ['legacyPremium true blocked', { legacyPremium: true }],
    ['superuser field true blocked', { superuser: true }],
    ['premium true blocked', { premium: true }],
    ['paid billing.status blocked', { billing: { status: 'active', planId: 'premium' } }]
  ];

  for (const [name, fields] of attempts) {
    const result = await patchUser(uid, idToken, fields);
    log(name, denied(result), JSON.stringify({ status: result.status, message: result.json?.error?.message || result.json?.error?.status || '' }));
  }

  // Harmless profile update still allowed.
  const okUpdate = await patchUser(uid, idToken, { displayName: 'Still Free' });
  log('user can update non-entitlement fields', okUpdate.status === 200, JSON.stringify({ status: okUpdate.status }));
} catch (error) {
  log('fatal', false, error?.stack || error);
}

fs.writeFileSync(`${ART}/entitlement-rules-verify.json`, JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
