import puppeteer from 'puppeteer-core';
import fs from 'fs';

const ART = '/opt/cursor/artifacts';
const CHROME = '/usr/bin/google-chrome-stable';
const APP = 'http://127.0.0.1:5173/app.html?dev-bypass=1&lang=nl';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});
const page = await browser.newPage();
const issues = [];
page.on('pageerror', (e) => issues.push({ type: 'pageerror', text: String(e.message || e) }));
page.on('console', (msg) => {
  if (msg.type() === 'error') issues.push({ type: 'console', text: msg.text() });
});
await page.setViewport({ width: 1280, height: 900 });
await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(1200);
await page.evaluate(() => {
  document.getElementById('uculi-tour')?.remove();
  localStorage.setItem('uculiDeveloperBypass', '1');
  if (typeof activateDeveloperBypassSession === 'function') activateDeveloperBypassSession();
  if (typeof startLocalTestModeFromGate === 'function') startLocalTestModeFromGate();
  userSettings.termsAccepted = true;
  userSettings.language = 'nl';
  userSettings.name = 'Testmodus';
  recipes = [{
    id: Date.now(),
    title: 'Probe Soep',
    source: 'local',
    category: 'Soup',
    difficulty: 'Easy',
    diet: [],
    ingredients: ['1 ui'],
    instructions: ['Kook'],
    notes: '',
    image: '',
    checkedIngredients: [],
    checkedSteps: [],
    notebookStickyNotes: [],
    author: '',
    country: ''
  }];
  if (typeof saveData === 'function') saveData();
  if (typeof renderList === 'function') renderList();
});
await sleep(900);

const screens = [
  ['cards', () => page.evaluate(() => { setIndexViewMode('cards'); renderList(); })],
  ['list', () => page.evaluate(() => { setIndexViewMode('list'); renderList(); })],
  ['book', () => page.evaluate(() => { setIndexViewMode('book'); notebookCoverOpen = false; renderList(); })],
  ['detail', () => page.evaluate(() => renderDetail(recipes[0].id))],
  ['add', () => page.evaluate(() => renderAddForm())],
  ['shop', () => page.evaluate(() => renderShoppingList())],
  ['browse', () => page.evaluate(async () => { await renderBrowse(); })],
  ['profile', () => page.evaluate(() => renderProfile())],
  ['settings', () => page.evaluate(() => renderSettings())]
];

for (const [name, go] of screens) {
  try {
    await go();
    await sleep(600);
    await page.evaluate(() => {
      document.getElementById('uculi-tour')?.remove();
      document.querySelectorAll('.app-overlay').forEach((n) => {
        if (n.id?.startsWith('dynamic-modal')) n.remove();
      });
    });
    const broken = await page.evaluate(() => {
      const bad = [];
      for (const el of document.querySelectorAll('[onclick]')) {
        const code = el.getAttribute('onclick') || '';
        const m = code.match(/^([A-Za-z_$][\w$]*)\s*\(/);
        if (!m) continue;
        const fn = m[1];
        if (typeof window[fn] !== 'function' && !['event', 'if', 'typeof'].includes(fn)) {
          // Many app functions are file-scoped, not on window — only flag if call would throw via new Function
          try {
            // eslint-disable-next-line no-new-func
            new Function(`with (window) { (${fn}); }`);
          } catch {
            bad.push({ fn, code: code.slice(0, 100) });
          }
        }
      }
      return bad;
    });
    // Better: try invoking onclick in page context where closures exist
    const clickErrors = await page.evaluate(() => {
      const errors = [];
      const nodes = [...document.querySelectorAll('button[onclick], [role="button"][onclick]')].slice(0, 40);
      for (const el of nodes) {
        const code = el.getAttribute('onclick') || '';
        // Skip destructive/navigation that leaves the screen mid-loop
        if (/signOut|delete|logout|location\.|reload|requestRecipeDeletion|publishRecipe|exportRecipe|shareRecipe|openCoverEditor|startPremium|Google|window\.open/i.test(code)) continue;
        if (/renderAddForm|renderDetail|renderList|renderShopping|renderBrowse|renderProfile|renderSettings|setIndexViewMode|toggleCooking|changeScale|toggleItem|addCustomShopping|clearChecked/i.test(code) === false && nodes.length > 10) {
          // still try safe-looking ones
        }
        try {
          el.click();
        } catch (error) {
          errors.push({ code: code.slice(0, 80), error: String(error.message || error) });
        }
      }
      return errors;
    });
    for (const e of clickErrors) issues.push({ type: 'click-error', screen: name, ...e });

    const body = await page.evaluate(() => document.body.innerText);
    if (/\bUNDEFINED\b|\bundefined\b/.test(body)) {
      issues.push({ type: 'ui-undefined', screen: name, snippet: body.match(/.{0,40}undefined.{0,40}/i)?.[0] || 'found' });
    }
    await page.screenshot({ path: `${ART}/deep-${name}.png`, fullPage: false });
  } catch (error) {
    issues.push({ type: 'screen-error', screen: name, text: String(error.message || error) });
  }
}

await page.evaluate(() => renderDetail(recipes[0].id));
await sleep(400);
await page.screenshot({ path: `${ART}/probe-detail-undefined.png`, fullPage: false });

fs.writeFileSync(`${ART}/deep-probe.json`, JSON.stringify(issues, null, 2));
console.log(JSON.stringify(issues, null, 2));
console.log('count', issues.length);
await browser.close();
process.exit(0);
