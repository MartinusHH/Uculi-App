/**
 * Core soft-launch flows: login, recipes, premium gate, shopping share.
 * Uses Firebase Auth/Firestore emulators + Puppeteer. No deploy.
 *
 * Usage: node tools/verify-core-flows.mjs
 */
import puppeteer from 'puppeteer-core';
import fs from 'fs';

const ART = '/opt/cursor/artifacts';
fs.mkdirSync(ART, { recursive: true });
const CHROME = fs.existsSync('/usr/bin/google-chrome-stable')
  ? '/usr/bin/google-chrome-stable'
  : '/usr/local/bin/google-chrome';
const PROJECT = 'mholt-uculi';
const AUTH = 'http://127.0.0.1:9099';
const FIRESTORE = 'http://127.0.0.1:8080';
const APP = 'http://127.0.0.1:5173/app.html?emulator=1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const log = (name, ok, detail = '') => {
  results.push({ name, ok, detail: String(detail).slice(0, 240) });
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ' — ' + String(detail).slice(0, 180) : ''}`);
};

async function signUp(email, password) {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-${PROJECT}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const data = await res.json();
  if (!data.idToken) throw new Error(`signUp failed: ${JSON.stringify(data)}`);
  return data;
}

async function signIn(email, password) {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-${PROJECT}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const data = await res.json();
  if (!data.idToken) throw new Error(`signIn failed: ${JSON.stringify(data)}`);
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
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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

async function dismissGates(page) {
  await page.evaluate(() => {
    document.getElementById('uculi-tour')?.remove();
    document.getElementById('terms-accept-modal')?.remove();
    document.querySelectorAll('.app-overlay').forEach((node) => {
      if (node.id?.startsWith('dynamic-modal')) node.remove();
    });
  });
}

async function browserSignIn(page, email, password) {
  await page.goto(`${APP}&auth=login&lang=nl`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(800);
  await dismissGates(page);
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
  if (!signed.ok) throw new Error(signed.error);
  await sleep(1200);
  await page.evaluate(() => {
    document.getElementById('uculi-tour')?.remove();
    document.getElementById('terms-accept-modal')?.remove();
    if (typeof userSettings !== 'undefined') {
      userSettings.termsAccepted = true;
      userSettings.privacyAccepted = true;
      userSettings.language = 'nl';
      userSettings.name = userSettings.name || 'Core Tester';
      if (typeof saveData === 'function') saveData();
    }
  });
  await sleep(700);
  await dismissGates(page);
  return signed.uid;
}

async function browserRegisterViaUi(page, { firstName, lastName, email, password }) {
  await page.goto(`${APP}&auth=register&lang=nl`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(900);
  await dismissGates(page);

  // Ensure register mode and agreements
  await page.evaluate(() => {
    if (typeof setAuthMode === 'function') setAuthMode('register');
    const privacy = document.getElementById('auth-privacy') || document.querySelector('input[id*="privacy"]');
    const terms = document.getElementById('auth-terms') || document.querySelector('input[id*="terms"]');
    if (privacy) privacy.checked = true;
    if (terms) terms.checked = true;
    // Some builds use paired checkboxes
    document.querySelectorAll('input[type="checkbox"]').forEach((box) => {
      if (/privacy|terms|voorwaarden|beleid/i.test(box.id + box.name + (box.getAttribute('aria-label') || ''))) {
        box.checked = true;
        box.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  });
  await sleep(200);

  const filled = await page.evaluate((data) => {
    const set = (id, value) => {
      const el = document.getElementById(id);
      if (!el) return false;
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    };
    return {
      first: set('auth-first-name', data.firstName),
      last: set('auth-last-name', data.lastName),
      email: set('auth-email', data.email),
      password: set('auth-password', data.password)
    };
  }, { firstName, lastName, email, password });

  log('login: register form fields present', filled.first && filled.last && filled.email && filled.password, JSON.stringify(filled));

  // Prefer direct Firebase create after agreements — UI submit varies with overlays
  const created = await page.evaluate(async (data) => {
    try {
      localStorage.setItem('uculiUseFirebaseEmulator', '1');
      if (!firebase?.apps?.length && typeof initializeFirebase === 'function') initializeFirebase();
      const result = await firebase.auth().createUserWithEmailAndPassword(data.email, data.password);
      await result.user.updateProfile({ displayName: `${data.firstName} ${data.lastName}` });
      if (typeof userSettings !== 'undefined') {
        userSettings.termsAccepted = true;
        userSettings.privacyAccepted = true;
        userSettings.name = `${data.firstName} ${data.lastName}`;
        userSettings.email = data.email;
        userSettings.language = 'nl';
        if (typeof saveData === 'function') saveData();
      }
      if (typeof enterAppFromLanding === 'function') enterAppFromLanding('register');
      return { ok: true, uid: result.user.uid };
    } catch (error) {
      // already exists → sign in
      try {
        const signed = await firebase.auth().signInWithEmailAndPassword(data.email, data.password);
        return { ok: true, uid: signed.user.uid, reused: true };
      } catch (signError) {
        return { ok: false, error: String(error?.message || error), signError: String(signError?.message || signError) };
      }
    }
  }, { firstName, lastName, email, password });

  await sleep(1000);
  await dismissGates(page);
  return created;
}

const stamp = Date.now();
const password = 'testpass123';
const registerEmail = `core.reg.${stamp}@uculi.test`;
const ownerEmail = `core.owner.${stamp}@uculi.test`;
const inviteEmail = `core.invite.${stamp}@uculi.test`;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});

try {
  // ---------- LOGIN ----------
  const loginPage = await browser.newPage();
  loginPage.__errors = [];
  loginPage.on('pageerror', (e) => loginPage.__errors.push(String(e.message || e)));
  await loginPage.setViewport({ width: 1280, height: 900 });

  const registered = await browserRegisterViaUi(loginPage, {
    firstName: 'Core',
    lastName: 'Tester',
    email: registerEmail,
    password
  });
  log('login: register/sign-in via emulator', Boolean(registered.ok && registered.uid), JSON.stringify(registered));

  const authed = await loginPage.evaluate(() => ({
    uid: firebase?.auth?.()?.currentUser?.uid || currentUser?.uid || '',
    email: firebase?.auth?.()?.currentUser?.email || currentUser?.email || '',
    hasContent: Boolean(document.getElementById('app-content')),
    view: typeof currentView !== 'undefined' ? currentView : ''
  }));
  log('login: session active in app', Boolean(authed.uid && authed.hasContent), JSON.stringify(authed));
  await loginPage.screenshot({ path: `${ART}/core-login-desktop.png`, fullPage: false });

  // Phone login smoke
  const phoneLogin = await browser.newPage();
  await phoneLogin.setViewport({ width: 390, height: 844 });
  const phoneUid = await browserSignIn(phoneLogin, registerEmail, password);
  log('login: phone session', Boolean(phoneUid), phoneUid);
  await phoneLogin.screenshot({ path: `${ART}/core-login-phone.png`, fullPage: false });
  await phoneLogin.close();

  // ---------- RECIPES ----------
  const recipeResult = await loginPage.evaluate(() => {
    try {
      const id = typeof generateId === 'function' ? generateId() : Date.now();
      const recipe = {
        id,
        title: 'Core Flow Soep',
        author: userSettings.name || 'Core Tester',
        source: 'local',
        category: 'Soup',
        country: 'Nederland',
        difficulty: 'Easy',
        diet: [],
        ingredients: ['1 ui', '2 wortels'],
        instructions: ['Snijd de ui', 'Kook 20 minuten'],
        tips: '',
        servings: 4,
        checkedIngredients: [],
        checkedSteps: [],
        notebookStickyNotes: [],
        createdAt: new Date().toISOString()
      };
      recipes = [recipe];
      if (typeof saveData === 'function') saveData();
      if (typeof setIndexViewMode === 'function') setIndexViewMode('cards');
      if (typeof renderList === 'function') renderList();
      const listed = document.body.innerText.includes('Core Flow Soep');
      if (typeof renderDetail === 'function') renderDetail(id);
      const detailText = document.body.innerText;
      const detailLower = detailText.toLowerCase();
      const hasUndefined = /\bundefined\b/i.test(detailText);
      const authorNeedle = String(userSettings.name || 'Core Tester').toLowerCase();
      const hasAuthor = detailLower.includes(authorNeedle) || detailLower.includes('core tester');
      const hasCountry = detailLower.includes('nederland');
      return { ok: listed && !hasUndefined && hasAuthor && hasCountry, listed, hasUndefined, hasAuthor, hasCountry, id };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  });
  log('recipes: create + list + detail without undefined', Boolean(recipeResult.ok), JSON.stringify(recipeResult));
  await loginPage.screenshot({ path: `${ART}/core-recipe-detail-desktop.png`, fullPage: false });

  const editOk = await loginPage.evaluate(() => {
    try {
      const id = recipes[0]?.id;
      if (!id) return { ok: false, error: 'no recipe' };
      renderAddForm(id);
      const title = document.getElementById('r-title');
      const author = document.getElementById('r-author');
      if (!title || !author) return { ok: false, error: 'form missing' };
      title.value = 'Core Flow Soep v2';
      author.value = 'Core Tester';
      draftIngredients = ['1 ui', '2 wortels', '1 prei'];
      draftSteps = ['Snijd alles', 'Kook 25 minuten'];
      editingRecipeId = id;
      // Call save path pieces without full submit event noise
      const fakeEvent = { preventDefault() {} };
      return saveRecipe(fakeEvent).then(() => {
        const updated = recipes.find((r) => r.id === id);
        renderDetail(id);
        return {
          ok: Boolean(updated && updated.title === 'Core Flow Soep v2' && updated.ingredients.length === 3),
          title: updated?.title,
          ingredients: updated?.ingredients?.length
        };
      }).catch((error) => ({ ok: false, error: String(error?.message || error) }));
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  });
  log('recipes: edit + save', Boolean(editOk?.ok), JSON.stringify(editOk));

  // Phone recipe detail
  const phoneRecipe = await browser.newPage();
  await phoneRecipe.setViewport({ width: 390, height: 844 });
  await browserSignIn(phoneRecipe, registerEmail, password);
  await phoneRecipe.evaluate(() => {
    recipes = [{
      id: 42,
      title: 'Phone Soep',
      author: '',
      source: 'local',
      category: 'Soup',
      country: '',
      ingredients: ['zout'],
      instructions: ['kook'],
      checkedIngredients: [],
      checkedSteps: [],
      notebookStickyNotes: []
    }];
    userSettings.name = 'Phone Chef';
    saveData();
    renderDetail(42);
  });
  await sleep(500);
  const phoneDetail = await phoneRecipe.evaluate(() => {
    const text = document.body.innerText;
    const lower = text.toLowerCase();
    const meta = document.querySelector('.detail-hero-meta')?.innerText || '';
    return {
      hasUndefined: /\bundefined\b/i.test(text),
      hasAuthorFallback: /phone chef|onbekende kok/i.test(meta || text),
      hidesEmptyCountryUnknown: !/\bunknown\b/i.test(meta),
      meta
    };
  });
  log('recipes: phone detail fallbacks', !phoneDetail.hasUndefined && phoneDetail.hasAuthorFallback && phoneDetail.hidesEmptyCountryUnknown, JSON.stringify(phoneDetail));
  await phoneRecipe.screenshot({ path: `${ART}/core-recipe-detail-phone.png`, fullPage: false });
  await phoneRecipe.close();

  // ---------- PREMIUM ----------
  // Soft launch default: PREMIUM_ENABLED=false unlocks everything (Stripe not live).
  const softLaunch = await loginPage.evaluate(() => {
    const flagOff = window.PREMIUM_ENABLED === false;
    const unlocked = accountHasPremiumPlan() === true
      && canAddLocalRecipe() === true
      && requirePremiumFeature('recipeSharing') === false
      && requirePremiumFeature('recipePdfExport') === false
      && requirePremiumFeature('notebookMode') === false
      && requirePremiumFeature('backupDownload') === false
      && requirePremiumFeature('backupRestore') === false
      && requireFreeRecipeSlot() === false;
    showPlansModal();
    showPremiumModal('recipeSharing');
    const text = document.body.innerText;
    const hidesPremiumCtas = !/View Premium|Bekijk Premium|Coming soon/i.test(text);
    closeModal?.();
    return { flagOff, unlocked, hidesPremiumCtas, hasFlag: typeof window.PREMIUM_ENABLED === 'boolean' };
  });
  log(
    'premium: soft launch unlocks all features (PREMIUM_ENABLED=false)',
    softLaunch.flagOff && softLaunch.unlocked && softLaunch.hidesPremiumCtas,
    JSON.stringify(softLaunch)
  );

  // When enforcement is on, free users are gated again.
  const premium = await loginPage.evaluate(() => {
    window.PREMIUM_ENABLED = true;
    const real = accountHasPremiumPlan;
    accountHasPremiumPlan = () => false;
    hasPremiumAccess = () => false;
    const shareBlocked = requirePremiumFeature('recipeSharing');
    const pdfBlocked = requirePremiumFeature('recipePdfExport');
    const notebookBlocked = requirePremiumFeature('notebookMode');
    const text = document.body.innerText;
    const modalVisible = /premium|upgrade|delen|share|schrift|notebook/i.test(text);
    closeModal?.();
    accountHasPremiumPlan = real;
    hasPremiumAccess = real;
    window.PREMIUM_ENABLED = false;
    const premiumAgain = accountHasPremiumPlan();
    return { shareBlocked, pdfBlocked, notebookBlocked, modalVisible, premiumAgain, hasFn: typeof accountHasPremiumPlan === 'function' };
  });
  log('premium: free user gated on share/pdf/notebook when PREMIUM_ENABLED', premium.shareBlocked && premium.pdfBlocked && premium.notebookBlocked && premium.modalVisible, JSON.stringify(premium));

  // Testmodus premium path
  const bypassPage = await browser.newPage();
  await bypassPage.setViewport({ width: 1280, height: 900 });
  await bypassPage.goto('http://127.0.0.1:5173/app.html?dev-bypass=1&lang=nl', { waitUntil: 'domcontentloaded' });
  await sleep(1000);
  await bypassPage.evaluate(() => {
    document.getElementById('uculi-tour')?.remove();
    localStorage.setItem('uculiDeveloperBypass', '1');
    activateDeveloperBypassSession?.();
    startLocalTestModeFromGate?.();
  });
  await sleep(800);
  const bypassPremium = await bypassPage.evaluate(() => ({
    premium: accountHasPremiumPlan(),
    localTest: typeof isLocalTestPremiumSession === 'function' ? isLocalTestPremiumSession() : null,
    shareBlocked: requirePremiumFeature('recipeSharing')
  }));
  log('premium: testmodus unlocks features', bypassPremium.premium === true && bypassPremium.shareBlocked === false, JSON.stringify(bypassPremium));
  await bypassPage.screenshot({ path: `${ART}/core-premium-testmodus.png`, fullPage: false });

  // Console noise: developer bypass should not hit reserved moderation doc
  const bypassErrors = [];
  bypassPage.on('console', (msg) => {
    if (msg.type() === 'error') bypassErrors.push(msg.text());
  });
  await bypassPage.reload({ waitUntil: 'domcontentloaded' });
  await sleep(1500);
  await bypassPage.evaluate(() => {
    localStorage.setItem('uculiDeveloperBypass', '1');
    activateDeveloperBypassSession?.();
    startLocalTestModeFromGate?.();
  });
  await sleep(1200);
  const reservedNoise = bypassErrors.some((t) => /__uculi_local_dev__|reserved/i.test(t));
  const adminNoise = bypassErrors.some((t) => /Admin config cloud load failed/i.test(t));
  log('premium/testmodus: no reserved-uid moderation errors', !reservedNoise, bypassErrors.filter((t) => /moderation|Admin config|reserved/i.test(t)).join(' | ') || 'clean');
  log('premium/testmodus: no admin-config permission spam', !adminNoise, bypassErrors.filter((t) => /Admin config/i.test(t)).join(' | ') || 'clean');
  await bypassPage.close();

  // ---------- SHARING (shopping list email invite) ----------
  const owner = await signUp(ownerEmail, password);
  const invitee = await signUp(inviteEmail, password);
  const ownerUid = owner.localId;
  const inviteeUid = invitee.localId;
  const listPath = `shopping-lists/${ownerUid}`;

  const createList = await fsWrite(listPath, {
    id: ownerUid,
    ownerId: ownerUid,
    ownerEmail: ownerEmail.toLowerCase(),
    memberIds: [ownerUid],
    memberEmails: [ownerEmail.toLowerCase()],
    members: [{ uid: ownerUid, email: ownerEmail.toLowerCase(), name: 'Owner' }],
    pendingInviteEmails: [],
    items: [{
      id: 'item-1',
      label: 'Melk',
      note: '',
      checked: false,
      kind: 'custom',
      sourceRecipeIds: [],
      sourceRecipeTitles: [],
      occurrences: 1,
      assignedTo: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }],
    collaborators: [],
    updatedAt: new Date().toISOString()
  }, owner.idToken, 'PATCH');
  log('share: owner creates shopping list', createList.status === 200, `status=${createList.status}`);

  const inviteDocId = `${ownerUid}__${inviteEmail.toLowerCase().replace(/[^a-z0-9._+-]+/g, '_')}`;
  const inviteMailbox = await fsWrite(`shopping-list-invites/${inviteDocId}`, {
    listId: ownerUid,
    ownerId: ownerUid,
    ownerEmail: ownerEmail.toLowerCase(),
    inviteeEmail: inviteEmail.toLowerCase(),
    createdAt: new Date().toISOString()
  }, owner.idToken, 'PATCH');
  const pendingOnList = await fsWrite(listPath, {
    pendingInviteEmails: [inviteEmail.toLowerCase()],
    updatedAt: new Date().toISOString()
  }, owner.idToken, 'PATCH');
  log('share: owner invites by email mailbox', inviteMailbox.status === 200 && pendingOnList.status === 200, `invite=${inviteMailbox.status} list=${pendingOnList.status}`);

  const inviteeRead = await fsGet(listPath, invitee.idToken);
  log('share: invitee can read pending list', inviteeRead.status === 200, `status=${inviteeRead.status}`);

  const stranger = await signUp(`core.stranger.${stamp}@uculi.test`, password);
  const strangerRead = await fsGet(listPath, stranger.idToken);
  log('share: stranger blocked', strangerRead.status === 403 || strangerRead.status === 404, `status=${strangerRead.status}`);

  const accept = await fsWrite(listPath, {
    memberIds: [ownerUid, inviteeUid],
    memberEmails: [ownerEmail.toLowerCase(), inviteEmail.toLowerCase()],
    members: [
      { uid: ownerUid, email: ownerEmail.toLowerCase(), name: 'Owner' },
      { uid: inviteeUid, email: inviteEmail.toLowerCase(), name: 'Invitee' }
    ],
    pendingInviteEmails: [],
    items: inviteeRead.data?.items || [],
    collaborators: inviteeRead.data?.collaborators || [],
    updatedAt: new Date().toISOString()
  }, invitee.idToken, 'PATCH');
  log('share: invitee accepts', accept.status === 200, `status=${accept.status}`);

  // Recipe share gate for free signed-in user (only when premium is enforced)
  await loginPage.evaluate(() => {
    window.PREMIUM_ENABLED = true;
    accountHasPremiumPlan = () => false;
    hasPremiumAccess = () => false;
    if (recipes[0]) shareRecipe(recipes[0].id);
  });
  await sleep(400);
  const shareGate = await loginPage.evaluate(() => {
    const text = document.body.innerText.toLowerCase();
    const gated = /premium|upgrade|delen|share/.test(text);
    closeModal?.();
    window.PREMIUM_ENABLED = false;
    return gated;
  });
  log('share: recipe share shows premium gate when PREMIUM_ENABLED', shareGate);
  await loginPage.screenshot({ path: `${ART}/core-recipe-share-gate.png`, fullPage: false });

  // UI shopping share controls when cloud owner
  const shopPage = await browser.newPage();
  await shopPage.setViewport({ width: 1280, height: 900 });
  await browserSignIn(shopPage, ownerEmail, password);
  await shopPage.evaluate(async () => {
    if (typeof bootstrapShoppingListCloud === 'function') await bootstrapShoppingListCloud();
    if (typeof renderShoppingList === 'function') renderShoppingList();
  });
  await sleep(1000);
  const shopUi = await shopPage.evaluate(() => {
    const text = document.body.innerText;
    return {
      hasInviteUi: /uitnodig|invite|e-mail|email/i.test(text),
      cloudHint: /cloud|realtime|delen/i.test(text),
      renderOk: typeof renderShoppingList === 'function'
    };
  });
  log('share: shopping UI exposes invite/cloud affordance', shopUi.hasInviteUi || shopUi.cloudHint, JSON.stringify(shopUi));
  await shopPage.screenshot({ path: `${ART}/core-shop-share-ui.png`, fullPage: false });
  await shopPage.close();

  log('login: no pageerrors on register page', loginPage.__errors.length === 0, loginPage.__errors.join(' | ') || 'clean');
} catch (error) {
  log('fatal', false, error?.stack || error);
} finally {
  await browser.close();
}

fs.writeFileSync(`${ART}/core-flows-verify.json`, JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
