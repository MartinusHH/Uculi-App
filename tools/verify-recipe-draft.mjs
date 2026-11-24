/**
 * Recipe editor draft persistence: unit + browser reload flows.
 * Uses puppeteer-core (same stack as the shot harness).
 *
 * Usage: node tools/verify-recipe-draft.mjs
 */
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import os from 'os';
import path from 'path';

const ART = process.env.UCULI_TEST_ARTIFACTS
  || (fs.existsSync('/opt/cursor/artifacts') ? '/opt/cursor/artifacts' : path.join(os.tmpdir(), 'uculi-test-artifacts'));
fs.mkdirSync(ART, { recursive: true });
const CHROME = fs.existsSync('/usr/bin/google-chrome-stable')
  ? '/usr/bin/google-chrome-stable'
  : '/usr/local/bin/google-chrome';
const APP = 'http://127.0.0.1:5173/app.html?dev-bypass=1&lang=nl';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const log = (name, ok, detail = '') => {
  results.push({ name, ok, detail: String(detail).slice(0, 280) });
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ' — ' + String(detail).slice(0, 180) : ''}`);
};

async function enterApp(page) {
  await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(700);
  await page.evaluate(() => {
    document.getElementById('uculi-tour')?.remove();
    document.getElementById('terms-accept-modal')?.remove();
    if (typeof showToast === 'function' && !window.__draftTestToastMuted) {
      window.__draftTestToastMuted = true;
      window.showToast = function mutedToast() {};
    }
    localStorage.setItem('uculiDeveloperBypass', '1');
    if (typeof activateDeveloperBypassSession === 'function') activateDeveloperBypassSession();
    if (typeof startLocalTestModeFromGate === 'function') startLocalTestModeFromGate();
    if (typeof enterAppFromLanding === 'function' && document.getElementById('auth-gate')) {
      enterAppFromLanding('local-test-mode');
    }
    userSettings.language = 'nl';
    userSettings.termsAccepted = true;
    if (typeof saveData === 'function') saveData();
  });
  await sleep(900);
  await page.evaluate(() => {
    document.getElementById('uculi-tour')?.remove();
  });
}

async function fillEditorBasics(page, { title, ingredient, step }) {
  await page.evaluate(({ title, ingredient, step }) => {
    const titleEl = document.getElementById('r-title');
    if (titleEl) {
      titleEl.value = title;
      titleEl.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const ing = document.getElementById('new-ingredient');
    if (ing) {
      ing.value = ingredient;
      addDraftIngredient();
    }
    const st = document.getElementById('new-step');
    if (st) {
      st.value = step;
      addDraftStep();
    }
    if (typeof persistRecipeEditorDraftNow === 'function') persistRecipeEditorDraftNow();
  }, { title, ingredient, step });
  await sleep(200);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1280,900']
});

try {
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  await page.setViewport({ width: 390, height: 844 });
  page.on('dialog', async (dialog) => {
    try { await dialog.accept(); } catch (_error) { /* ignore */ }
  });
  await enterApp(page);

  // --- Unit: save / restore / clear ---
  const unit = await page.evaluate(() => {
    clearRecipeEditorDraft('new');
    renderAddForm();
    const titleEl = document.getElementById('r-title');
    titleEl.value = 'Draft Unit Soup';
    titleEl.dispatchEvent(new Event('input', { bubbles: true }));
    draftIngredients = ['1 ui'];
    draftSteps = [{ text: 'Fruit de ui', image: '', minutes: 2 }];
    renderDraftIngredients();
    renderDraftSteps();
    const saved = persistRecipeEditorDraftNow();
    const key = getRecipeDraftStorageKey('new');
    const raw = localStorage.getItem(key);
    const loaded = loadRecipeEditorDraft('new');
    clearRecipeEditorDraft('new');
    const afterClear = localStorage.getItem(key);
    return {
      saved,
      hasRaw: Boolean(raw),
      loadedTitle: loaded?.title || '',
      loadedIng: loaded?.ingredients || [],
      loadedSteps: (loaded?.steps || []).map((s) => s.text),
      afterClear,
      hasFns: typeof persistRecipeEditorDraftNow === 'function'
        && typeof loadRecipeEditorDraft === 'function'
        && typeof clearRecipeEditorDraft === 'function'
    };
  });
  log('draft: helpers exposed', unit.hasFns);
  log('draft: persist writes localStorage', unit.saved && unit.hasRaw, JSON.stringify({ saved: unit.saved, hasRaw: unit.hasRaw }));
  log(
    'draft: load restores title/ingredients/steps',
    unit.loadedTitle === 'Draft Unit Soup' && unit.loadedIng[0] === '1 ui' && unit.loadedSteps[0] === 'Fruit de ui',
    JSON.stringify({ title: unit.loadedTitle, ing: unit.loadedIng, steps: unit.loadedSteps })
  );
  log('draft: clear removes localStorage', unit.afterClear === null, `afterClear=${unit.afterClear}`);

  // --- Browser: type → reload → reopen restores ---
  await page.evaluate(() => {
    clearRecipeEditorDraft('new');
    renderAddForm();
  });
  await sleep(400);
  await fillEditorBasics(page, {
    title: 'Reload Stew',
    ingredient: '200 g champignons',
    step: 'Snijd de champignons'
  });
  const keyedBeforeReload = await page.evaluate(() => ({
    key: getRecipeDraftStorageKey('new'),
    raw: localStorage.getItem(getRecipeDraftStorageKey('new'))
  }));
  log('draft: browser filled draft before reload', Boolean(keyedBeforeReload.raw), `bytes=${keyedBeforeReload.raw?.length || 0}`);

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => typeof renderAddForm === 'function', { timeout: 90000 });
  await sleep(500);
  await page.evaluate(() => {
    document.getElementById('uculi-tour')?.remove();
    document.getElementById('terms-accept-modal')?.remove();
    if (typeof showToast === 'function') window.showToast = function mutedToast() {};
    localStorage.setItem('uculiDeveloperBypass', '1');
    if (typeof activateDeveloperBypassSession === 'function') activateDeveloperBypassSession();
    if (typeof startLocalTestModeFromGate === 'function') startLocalTestModeFromGate();
    if (typeof enterAppFromLanding === 'function' && document.getElementById('auth-gate')) {
      enterAppFromLanding('local-test-mode');
    }
    if (typeof userSettings !== 'undefined') {
      userSettings.language = 'nl';
      userSettings.termsAccepted = true;
    }
  });
  await sleep(900);
  await page.evaluate(() => {
    document.getElementById('uculi-tour')?.remove();
    renderAddForm();
  });
  await sleep(800);
  const afterReload = await page.evaluate(() => {
    const notice = document.getElementById('recipe-draft-restored-notice');
    return {
      title: document.getElementById('r-title')?.value || '',
      ingredients: [...(draftIngredients || [])],
      steps: (draftSteps || []).map((s) => (typeof getRecipeInstructionText === 'function' ? getRecipeInstructionText(s) : (s.text || s))),
      noticeText: notice?.querySelector('p')?.textContent?.trim() || '',
      discardLabel: notice?.querySelector('button')?.textContent?.trim() || ''
    };
  });
  log(
    'draft: reload restores fields + notice',
    afterReload.title === 'Reload Stew'
      && afterReload.ingredients.includes('200 g champignons')
      && afterReload.steps.some((s) => /Snijd de champignons/i.test(s))
      && afterReload.noticeText === 'Concept hersteld'
      && afterReload.discardLabel === 'Weggooien',
    JSON.stringify(afterReload)
  );
  await page.screenshot({ path: path.join(ART, 'draft-reload-restore-390.png'), fullPage: false });

  // --- Browser: save clears draft ---
  await page.evaluate(() => {
    clearRecipeEditorDraft('new');
    renderAddForm();
  });
  await sleep(400);
  await fillEditorBasics(page, {
    title: 'Saved Clears Draft',
    ingredient: '1 tomaat',
    step: 'Snijd de tomaat'
  });
  const savedOk = await page.evaluate(async () => {
    const form = document.getElementById('add-recipe-form');
    if (!form) return { ok: false, reason: 'no-form' };
    recipeSubmitAction = 'save';
    const event = new Event('submit', { bubbles: true, cancelable: true });
    // saveRecipe is async and uses preventDefault
    await saveRecipe(event);
    return {
      ok: localStorage.getItem(getRecipeDraftStorageKey('new')) === null,
      recipesHave: (recipes || []).some((r) => r.title === 'Saved Clears Draft'),
      remaining: localStorage.getItem(getRecipeDraftStorageKey('new'))
    };
  });
  log(
    'draft: successful save clears draft',
    savedOk.ok && savedOk.recipesHave,
    JSON.stringify(savedOk)
  );


  // --- Follow-up 1: logout flushes draft then detaches listeners/state ---
  await page.evaluate(() => {
    clearRecipeEditorDraft('new');
    renderAddForm();
  });
  await sleep(300);
  await fillEditorBasics(page, {
    title: 'Logout Flush Soup',
    ingredient: '1 prei',
    step: 'Was de prei'
  });
  const logoutFlush = await page.evaluate(async () => {
    const keyBefore = getRecipeDraftStorageKey('new');
    persistRecipeEditorDraftNow();
    const rawBefore = localStorage.getItem(keyBefore);
    let parsedTitle = '';
    try { parsedTitle = JSON.parse(rawBefore || '{}').title || ''; } catch (_e) { /* ignore */ }
    await signOut();
    const rawAfterSameKey = localStorage.getItem(keyBefore);
    let parsedAfter = '';
    try { parsedAfter = JSON.parse(rawAfterSameKey || '{}').title || ''; } catch (_e) { /* ignore */ }
    const memoryCleared = (draftIngredients || []).length === 0
      && (draftSteps || []).length === 0
      && editingRecipeId == null;
    const unbound = window.recipeDraftAutosaveBound === false;
    return {
      keyBefore,
      hadRawBefore: Boolean(rawBefore),
      rawAfterFlush: Boolean(rawAfterSameKey),
      titleFlushed: parsedTitle,
      titleStillOnDisk: parsedAfter,
      memoryCleared,
      unbound
    };
  });
  log(
    'draft: logout flushes then detaches memory',
    logoutFlush.hadRawBefore
      && logoutFlush.rawAfterFlush
      && logoutFlush.titleFlushed === 'Logout Flush Soup'
      && logoutFlush.titleStillOnDisk === 'Logout Flush Soup'
      && logoutFlush.memoryCleared
      && logoutFlush.unbound,
    JSON.stringify(logoutFlush)
  );

  // Re-enter app for remaining follow-up tests after signOut tore down the bypass session.
  await enterApp(page);

  // Security: step image must not enter innerHTML unsanitized.
  const xss = await page.evaluate(() => {
    const malicious = '" onerror=alert(1) x="';
    const sanitized = sanitizeRecipeStepImageUrl(malicious);
    clearRecipeEditorDraft('new');
    renderAddForm();
    draftSteps = [{ text: 'XSS step', image: malicious, minutes: 1 }];
    renderDraftSteps();
    const html = document.getElementById('draft-steps-list')?.innerHTML || '';
    const img = document.querySelector('#draft-steps-list img');
    return {
      sanitizedEmpty: sanitized === '',
      hasOnerror: /onerror/i.test(html),
      hasMaliciousRaw: html.includes(malicious),
      imgPresent: Boolean(img),
      allowsHttps: sanitizeRecipeStepImageUrl('https://example.com/a.png') === 'https://example.com/a.png',
      allowsData: sanitizeRecipeStepImageUrl('data:image/png;base64,abc').startsWith('data:image/png'),
      blocksJavascript: sanitizeRecipeStepImageUrl('javascript:alert(1)') === ''
    };
  });
  log(
    'draft: step image sanitizes XSS payload',
    xss.sanitizedEmpty
      && !xss.hasOnerror
      && !xss.hasMaliciousRaw
      && !xss.imgPresent
      && xss.allowsHttps
      && xss.allowsData
      && xss.blocksJavascript,
    JSON.stringify(xss)
  );


  // --- Follow-up 3: stale draft discarded when recipe updatedAt is newer ---
  const stale = await page.evaluate(() => {
    const recipeId = 424242;
    clearRecipeEditorDraft(recipeId);
    const staleDraft = sanitizeRecipeDraftForStorage({
      recipeId,
      savedAt: Date.now() - 60_000,
      updatedAt: Date.now() - 60_000,
      title: 'Stale Draft Title',
      author: 'Test',
      category: 'Cooking',
      ingredients: ['1 ui'],
      steps: [{ text: 'Oude stap', minutes: 1, image: '' }]
    });
    localStorage.setItem(getRecipeDraftStorageKey(recipeId), JSON.stringify(staleDraft));
    const recipe = {
      id: recipeId,
      source: 'local',
      title: 'Saved Recipe Title',
      author: 'Test',
      category: 'Cooking',
      country: '',
      ingredients: ['2 uien'],
      instructions: [{ text: 'Nieuwe stap', minutes: 2, image: '' }],
      tips: '',
      updatedAt: Date.now(),
      profile: null
    };
    recipes = [recipe, ...(recipes || []).filter((r) => r.id !== recipeId)];
    const isStale = isRecipeEditorDraftStale(staleDraft, recipe);
    renderAddForm(recipeId);
    const notice = document.getElementById('recipe-draft-restored-notice');
    const title = document.getElementById('r-title')?.value || '';
    const remaining = localStorage.getItem(getRecipeDraftStorageKey(recipeId));
    return {
      isStale,
      title,
      noticePresent: Boolean(notice),
      remainingCleared: remaining === null
    };
  });
  log(
    'draft: stale draft discarded when recipe newer',
    stale.isStale
      && stale.title === 'Saved Recipe Title'
      && !stale.noticePresent
      && stale.remainingCleared,
    JSON.stringify(stale)
  );

  await page.close();
} catch (error) {
  log('fatal', false, error?.stack || error);
} finally {
  await browser.close();
}

fs.writeFileSync(path.join(ART, 'recipe-draft-verify.json'), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
