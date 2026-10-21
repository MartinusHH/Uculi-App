import puppeteer from 'puppeteer-core';
import fs from 'fs';

const ART = '/opt/cursor/artifacts';
fs.mkdirSync(ART, { recursive: true });
const CHROME = '/usr/bin/google-chrome-stable';
const PROJECT = 'mholt-uculi';
const AUTH = 'http://127.0.0.1:9099';
const FIRESTORE = 'http://127.0.0.1:8080';
const APP = 'http://127.0.0.1:5173/app.html?emulator=1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const log = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ' — ' + detail : ''}`);
};

async function signUp(email, password) {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-${PROJECT}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const data = await res.json();
  if (!data.idToken) throw new Error(`signUp failed for ${email}: ${JSON.stringify(data)}`);
  return data;
}

async function signIn(email, password) {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-${PROJECT}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const data = await res.json();
  if (!data.idToken) throw new Error(`signIn failed for ${email}: ${JSON.stringify(data)}`);
  return data;
}

function fsDocUrl(path) {
  return `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`;
}

function encodeValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return { integerValue: String(Math.trunc(value)) };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === 'object') {
    const fields = {};
    for (const [key, nested] of Object.entries(value)) fields[key] = encodeValue(nested);
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

function decodeValue(node) {
  if (!node || typeof node !== 'object') return null;
  if ('stringValue' in node) return node.stringValue;
  if ('booleanValue' in node) return node.booleanValue;
  if ('integerValue' in node) return Number(node.integerValue);
  if ('doubleValue' in node) return Number(node.doubleValue);
  if ('nullValue' in node) return null;
  if ('arrayValue' in node) return (node.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in node) {
    const out = {};
    for (const [key, nested] of Object.entries(node.mapValue.fields || {})) out[key] = decodeValue(nested);
    return out;
  }
  return null;
}

function decodeDoc(doc) {
  const out = {};
  for (const [key, nested] of Object.entries(doc.fields || {})) out[key] = decodeValue(nested);
  return out;
}

async function fsWrite(path, data, token, method = 'PATCH') {
  const fields = {};
  for (const [key, value] of Object.entries(data)) fields[key] = encodeValue(value);
  const url = method === 'PATCH'
    ? `${fsDocUrl(path)}?${Object.keys(data).map((key) => `updateMask.fieldPaths=${encodeURIComponent(key)}`).join('&')}`
    : fsDocUrl(path);
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ fields })
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function fsGet(path, token) {
  const res = await fetch(fsDocUrl(path), {
    headers: { Authorization: `Bearer ${token}` }
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body, data: res.ok ? decodeDoc(body) : null };
}

async function enterAs(page, email, password) {
  await page.goto(`${APP}&auth=login`, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(700);
  await page.evaluate(() => {
    document.getElementById('uculi-tour')?.remove();
    document.getElementById('terms-accept-modal')?.remove();
  });
  // Prefer direct Firebase auth for reliability in emulator tests.
  const signed = await page.evaluate(async (emailValue, passwordValue) => {
    try {
      localStorage.setItem('uculiUseFirebaseEmulator', '1');
      if (!firebase?.apps?.length && typeof initializeFirebase === 'function') initializeFirebase();
      await firebase.auth().signInWithEmailAndPassword(emailValue, passwordValue);
      return { ok: true, uid: firebase.auth().currentUser?.uid || null };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }, email, password);
  if (!signed.ok) throw new Error(`browser sign-in failed: ${signed.error}`);
  await sleep(1200);
  await page.evaluate(() => {
    document.getElementById('uculi-tour')?.remove();
    document.getElementById('terms-accept-modal')?.remove();
    if (typeof userSettings !== 'undefined') {
      userSettings.termsAccepted = true;
      userSettings.language = 'en';
      if (typeof saveData === 'function') saveData();
    }
    if (typeof renderShoppingList === 'function') renderShoppingList();
  });
  await sleep(900);
  return signed.uid;
}

const stamp = Date.now();
const ownerEmail = `owner.shop.${stamp}@uculi.test`;
const inviteEmail = `invite.shop.${stamp}@uculi.test`;
const password = 'testpass123';

const owner = await signUp(ownerEmail, password);
const invitee = await signUp(inviteEmail, password);
const ownerUid = owner.localId;
const inviteeUid = invitee.localId;
const listPath = `shopping-lists/${ownerUid}`;

const createPayload = {
  id: ownerUid,
  ownerId: ownerUid,
  ownerEmail: ownerEmail.toLowerCase(),
  memberIds: [ownerUid],
  memberEmails: [ownerEmail.toLowerCase()],
  members: [{ uid: ownerUid, email: ownerEmail.toLowerCase(), name: 'Owner' }],
  pendingInviteEmails: [],
  items: [{ id: 'item-1', label: 'Milk', note: '', checked: false, kind: 'custom', sourceRecipeIds: [], sourceRecipeTitles: [], occurrences: 1, assignedTo: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
  collaborators: [],
  updatedAt: new Date().toISOString()
};

const created = await fsWrite(listPath, createPayload, owner.idToken, 'PATCH');
log('owner create list', created.status === 200, `status=${created.status}`);

const stranger = await signUp(`stranger.shop.${stamp}@uculi.test`, password);
const strangerRead = await fsGet(listPath, stranger.idToken);
log('stranger cannot read', strangerRead.status === 403 || strangerRead.status === 404, `status=${strangerRead.status}`);

const inviteWrite = await fsWrite(listPath, {
  pendingInviteEmails: [inviteEmail.toLowerCase()],
  updatedAt: new Date().toISOString()
}, owner.idToken, 'PATCH');
log('owner adds pending invite', inviteWrite.status === 200, `status=${inviteWrite.status}`);

const inviteDocId = `${ownerUid}__${inviteEmail.toLowerCase().replace(/[^a-z0-9._+-]+/g, '_')}`;
const inviteDocWrite = await fsWrite(`shopping-list-invites/${inviteDocId}`, {
  listId: ownerUid,
  ownerId: ownerUid,
  ownerEmail: ownerEmail.toLowerCase(),
  inviteeEmail: inviteEmail.toLowerCase(),
  createdAt: new Date().toISOString()
}, owner.idToken, 'PATCH');
log('owner creates invite mailbox doc', inviteDocWrite.status === 200, `status=${inviteDocWrite.status}`);

const pendingRead = await fsGet(listPath, invitee.idToken);
log('invitee can read while pending', pendingRead.status === 200, `status=${pendingRead.status}`);

const inviteMailboxRead = await fsGet(`shopping-list-invites/${inviteDocId}`, invitee.idToken);
log('invitee can read invite mailbox doc', inviteMailboxRead.status === 200, `status=${inviteMailboxRead.status}`);

const badAccept = await fsWrite(listPath, {
  memberIds: [ownerUid, inviteeUid],
  memberEmails: [ownerEmail.toLowerCase(), inviteEmail.toLowerCase()],
  members: [
    { uid: ownerUid, email: ownerEmail.toLowerCase(), name: 'Owner' },
    { uid: inviteeUid, email: inviteEmail.toLowerCase(), name: 'Invitee' }
  ],
  pendingInviteEmails: [],
  items: [{ id: 'hacked', label: 'Hacked', note: '', checked: false, kind: 'custom', sourceRecipeIds: [], sourceRecipeTitles: [], occurrences: 1, assignedTo: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
  collaborators: [],
  updatedAt: new Date().toISOString()
}, invitee.idToken, 'PATCH');
log('invitee cannot alter items while accepting', badAccept.status === 403, `status=${badAccept.status}`);

const current = await fsGet(listPath, owner.idToken);
const acceptWrite = await fsWrite(listPath, {
  memberIds: [ownerUid, inviteeUid],
  memberEmails: [ownerEmail.toLowerCase(), inviteEmail.toLowerCase()],
  members: [
    { uid: ownerUid, email: ownerEmail.toLowerCase(), name: 'Owner' },
    { uid: inviteeUid, email: inviteEmail.toLowerCase(), name: 'Invitee' }
  ],
  pendingInviteEmails: [],
  items: current.data.items,
  collaborators: current.data.collaborators || [],
  updatedAt: new Date().toISOString()
}, invitee.idToken, 'PATCH');
log('invitee can accept invite', acceptWrite.status === 200, `status=${acceptWrite.status} ${JSON.stringify(acceptWrite.body).slice(0, 180)}`);

const memberItemWrite = await fsWrite(listPath, {
  items: [
    ...(current.data.items || []),
    { id: 'item-2', label: 'Bread', note: '', checked: false, kind: 'custom', sourceRecipeIds: [], sourceRecipeTitles: [], occurrences: 1, assignedTo: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  ],
  collaborators: current.data.collaborators || [],
  updatedAt: new Date().toISOString()
}, invitee.idToken, 'PATCH');
log('member can update items', memberItemWrite.status === 200, `status=${memberItemWrite.status}`);

const memberInviteWrite = await fsWrite(listPath, {
  pendingInviteEmails: ['evil@uculi.test'],
  updatedAt: new Date().toISOString()
}, invitee.idToken, 'PATCH');
log('member cannot manage invites', memberInviteWrite.status === 403, `status=${memberInviteWrite.status}`);

const ownerSeesBread = await fsGet(listPath, owner.idToken);
log('owner sees member item', Boolean(ownerSeesBread.data?.items?.some((item) => item.label === 'Bread')), JSON.stringify(ownerSeesBread.data?.items?.map((i) => i.label) || []));

// Browser realtime smoke: owner + invitee pages
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});

try {
  const ownerContext = await browser.createBrowserContext();
  const inviteContext = await browser.createBrowserContext();

  const ownerPage = await ownerContext.newPage();
  await ownerPage.setViewport({ width: 1280, height: 860 });
  await enterAs(ownerPage, ownerEmail, password);
  await ownerPage.evaluate(async () => {
    if (typeof bootstrapShoppingListCloud === 'function') await bootstrapShoppingListCloud();
    if (typeof renderShoppingList === 'function') renderShoppingList();
  });
  await sleep(1000);
  await ownerPage.screenshot({ path: `${ART}/shopping-share-owner.png`, fullPage: false });

  const invitePage = await inviteContext.newPage();
  await invitePage.setViewport({ width: 1280, height: 860 });
  await enterAs(invitePage, inviteEmail, password);
  const acceptResult = await invitePage.evaluate(async (listId) => {
    try {
      if (typeof bootstrapShoppingListCloud === 'function') await bootstrapShoppingListCloud();
      const ok = typeof acceptShoppingListInvite === 'function'
        ? await acceptShoppingListInvite(listId)
        : false;
      if (typeof renderShoppingList === 'function') renderShoppingList();
      return {
        ok,
        cloudId: userSettings.shoppingList?.cloudListId || '',
        isOwner: userSettings.shoppingList?.isCloudOwner,
        error: null
      };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }, ownerUid);
  log('invitee browser accept/bootstrap', Boolean(acceptResult.ok || acceptResult.cloudId === ownerUid), JSON.stringify(acceptResult));
  await sleep(1200);
  await invitePage.screenshot({ path: `${ART}/shopping-share-invitee.png`, fullPage: false });

  const inviteState = await invitePage.evaluate(() => ({
    cloudId: userSettings.shoppingList?.cloudListId || '',
    isOwner: userSettings.shoppingList?.isCloudOwner,
    labels: (userSettings.shoppingList?.items || []).map((item) => item.label)
  }));
  log('invitee browser on shared list', inviteState.cloudId === ownerUid && inviteState.isOwner === false, JSON.stringify(inviteState));

  await ownerPage.evaluate(async () => {
    userSettings.shoppingList.items.push({
      id: `item-rt-${Date.now()}`,
      label: 'Realtime Eggs',
      note: '',
      checked: false,
      kind: 'custom',
      sourceRecipeIds: [],
      sourceRecipeTitles: [],
      occurrences: 1,
      assignedTo: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    if (typeof persistShoppingListState === 'function') persistShoppingListState({ rerender: true });
    else if (typeof pushShoppingListToCloud === 'function') await pushShoppingListToCloud();
  });

  await invitePage.waitForFunction(() => {
    return (userSettings.shoppingList?.items || []).some((item) => item.label === 'Realtime Eggs');
  }, { timeout: 8000 }).catch(() => null);

  const inviteRealtime = await invitePage.evaluate(() =>
    (userSettings.shoppingList?.items || []).some((item) => item.label === 'Realtime Eggs')
  );
  log('invitee receives realtime item', inviteRealtime === true);
  await invitePage.screenshot({ path: `${ART}/shopping-share-realtime.png`, fullPage: false });

  // Reload invitee and ensure preferred shared list restores
  await invitePage.reload({ waitUntil: 'networkidle2' });
  await sleep(1500);
  await invitePage.evaluate(async () => {
    document.getElementById('uculi-tour')?.remove();
    document.getElementById('terms-accept-modal')?.remove();
    if (typeof bootstrapShoppingListCloud === 'function') await bootstrapShoppingListCloud();
  });
  await sleep(1200);
  const restored = await invitePage.evaluate(() => ({
    cloudId: userSettings.shoppingList?.cloudListId || '',
    isOwner: userSettings.shoppingList?.isCloudOwner
  }));
  log('invitee restores shared list after reload', restored.cloudId === ownerUid && restored.isOwner === false, JSON.stringify(restored));
} catch (error) {
  console.error(error);
  results.push({ name: 'browser flow', ok: false, detail: String(error) });
} finally {
  await browser.close();
}

const summaryPath = `${ART}/shopping-share-verify.json`;
fs.writeFileSync(summaryPath, JSON.stringify({ results, ownerEmail, inviteEmail, ownerUid, at: new Date().toISOString() }, null, 2));
console.log('\nSummary', summaryPath);
process.exit(results.some((r) => !r.ok) ? 1 : 0);
