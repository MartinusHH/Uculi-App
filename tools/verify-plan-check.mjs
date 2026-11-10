import puppeteer from 'puppeteer-core';
import fs from 'fs';

const OUT = '/opt/cursor/artifacts';
const URL = 'http://127.0.0.1:5173/app.html?dev-bypass=1&lang=nl';

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome-stable',
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900']
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
page.setDefaultTimeout(20000);

await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => typeof window.accountHasPremiumPlan === 'function' && typeof window.showPremiumModal === 'function');

// Soft launch: PREMIUM_ENABLED=false keeps every feature open.
const softLaunch = await page.evaluate(() => {
  const flagOff = window.PREMIUM_ENABLED === false;
  const unlocked = accountHasPremiumPlan() === true
    && hasPremiumAccess() === true
    && canAddLocalRecipe() === true
    && requireFreeRecipeSlot() === false
    && requirePremiumFeature('recipeSharing') === false
    && requirePremiumFeature('backupDownload') === false
    && requirePremiumFeature('backupRestore') === false;
  showPlansModal();
  showPremiumModal('recipeLimit');
  const text = document.body.innerText;
  const hidesPremiumCtas = !/View Premium|Bekijk Premium|Coming soon/i.test(text);
  closeModal?.();
  return { flagOff, unlocked, hidesPremiumCtas };
});

// In bypass, plan check should report premium (testmodus) even when enforcement is on.
await page.evaluate(() => { window.PREMIUM_ENABLED = true; });
const bypassPremium = await page.evaluate(() => ({
  hasPlan: accountHasPremiumPlan(),
  hasAccess: hasPremiumAccess(),
  canAdd: canAddLocalRecipe(),
  plan: getAccountPlan()
}));

// Force free-plan UI path and show limit upgrade modal (enforcement on)
await page.evaluate(() => {
  window.PREMIUM_ENABLED = true;
  window.__origIsLocalTestPremiumSession = window.isLocalTestPremiumSession;
  window.__origAccountHasPremiumPlan = window.accountHasPremiumPlan;
  window.__origHasPremiumAccess = window.hasPremiumAccess;
  window.__origCanAddLocalRecipe = window.canAddLocalRecipe;
  window.isLocalTestPremiumSession = () => false;
  window.accountHasPremiumPlan = () => false;
  window.hasPremiumAccess = () => false;
  window.canAddLocalRecipe = () => false;
  userSettings.language = 'nl';
  userSettings.premium = false;
  userSettings.billing = {
    status: 'free',
    entitlementSource: 'none',
    provider: '',
    planId: 'premium',
    customerId: '',
    subscriptionId: '',
    priceId: '',
    currentPeriodEndsAt: '',
    cancelAtPeriodEnd: false,
    lastSyncedAt: new Date().toISOString(),
    previewActivatedAt: '',
    lastRestoreAttemptAt: ''
  };
  recipes = [
    { id: 1, title: 'R1', source: 'local', ingredients: [], instructions: [] },
    { id: 2, title: 'R2', source: 'local', ingredients: [], instructions: [] },
    { id: 3, title: 'R3', source: 'local', ingredients: [], instructions: [] }
  ];
  showPremiumModal('recipeLimit');
});

await page.waitForFunction(() => document.body.innerText.includes('Gratis limiet bereikt') || document.body.innerText.includes('Je hebt 3 recepten bereikt'));
await page.screenshot({ path: `${OUT}/plan-check-limit-upgrade-nl.png`, fullPage: false });

const limitText = await page.evaluate(() => document.body.innerText);

await page.evaluate(() => {
  closeModal();
  showPremiumModal('notebookMode');
});
await page.waitForFunction(() => document.body.innerText.includes('Schrift') || document.body.innerText.includes('Notebook'));
await page.screenshot({ path: `${OUT}/plan-check-notebook-upgrade-nl.png`, fullPage: false });

await page.evaluate(() => {
  closeModal();
  showPremiumModal('cloudSync');
});
await page.waitForFunction(() => document.body.innerText.includes('Synchroniseren') || document.body.innerText.includes('Cloud sync'));
await page.screenshot({ path: `${OUT}/plan-check-sync-upgrade-nl.png`, fullPage: false });

await page.evaluate(() => {
  closeModal();
  const blocked = requireFreeRecipeSlot();
  const shareBlocked = requirePremiumFeature('recipeSharing');
  const pdfBlocked = requirePremiumFeature('recipePdfExport');
  return { blocked, shareBlocked, pdfBlocked };
});
await page.waitForFunction(() => !!document.querySelector('.app-overlay'));
await page.screenshot({ path: `${OUT}/plan-check-require-slot-gate.png`, fullPage: false });

const gateResult = await page.evaluate(() => {
  closeModal();
  return {
    requireSlot: requireFreeRecipeSlot(),
    requireShare: requirePremiumFeature('recipeSharing'),
    requirePdf: requirePremiumFeature('recipePdfExport'),
    requireNotebook: requirePremiumFeature('notebookMode'),
    requireSync: requirePremiumFeature('cloudSync'),
    loadFn: typeof loadAccountPlanFromFirestore === 'function',
    persistFn: typeof persistAccountPlanToFirestore === 'function',
    singleCheck: typeof accountHasPremiumPlan === 'function'
  };
});

// Soft-launch flag restores unlock when flipped back off.
const softLaunchRestore = await page.evaluate(() => {
  if (window.__origIsLocalTestPremiumSession) window.isLocalTestPremiumSession = window.__origIsLocalTestPremiumSession;
  if (window.__origAccountHasPremiumPlan) window.accountHasPremiumPlan = window.__origAccountHasPremiumPlan;
  if (window.__origHasPremiumAccess) window.hasPremiumAccess = window.__origHasPremiumAccess;
  if (window.__origCanAddLocalRecipe) window.canAddLocalRecipe = window.__origCanAddLocalRecipe;
  window.PREMIUM_ENABLED = false;
  closeModal?.();
  return {
    unlockedAgain: accountHasPremiumPlan() === true
      && requirePremiumFeature('recipeSharing') === false
      && requireFreeRecipeSlot() === false
  };
});

fs.writeFileSync(`${OUT}/plan-check-verify.json`, JSON.stringify({ softLaunch, bypassPremium, limitSnippet: limitText.slice(0, 800), gateResult, softLaunchRestore }, null, 2));
console.log(JSON.stringify({
  softLaunch,
  bypassPremium,
  gateResult,
  softLaunchRestore,
  limitHasUpgrade: /Gratis limiet|3 recepten/.test(limitText),
  softLaunchOk: softLaunch.flagOff && softLaunch.unlocked && softLaunch.hidesPremiumCtas && softLaunchRestore.unlockedAgain
}, null, 2));

await browser.close();
