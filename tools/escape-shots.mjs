/**
 * Before/after screenshots of recipe detail at 390/820/1280/1920.
 * Usage: node tools/escape-shots.mjs before|after [baseUrl]
 */
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const ART = process.env.ESCAPE_ART || '/opt/cursor/artifacts/escape';
const PREFIX = process.env.ESCAPE_PREFIX || 'escape';
const PHASE = process.argv[2] === 'before' ? 'before' : 'after';
const APP_BASE = process.argv[3] || 'http://127.0.0.1:5173';
const APP = `${APP_BASE}/app.html?dev-bypass=1&lang=nl`;
const CHROME = fs.existsSync('/usr/bin/google-chrome-stable')
  ? '/usr/bin/google-chrome-stable'
  : '/usr/local/bin/google-chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WIDTHS = [390, 820, 1280, 1920];

fs.mkdirSync(ART, { recursive: true });

async function dismissOverlays(page) {
  await page.evaluate(() => {
    document.getElementById('uculi-tour')?.remove();
    document.getElementById('terms-accept-modal')?.remove();
    document.querySelectorAll('.app-overlay').forEach((node) => {
      if (node.id === 'cover-editor-modal' || node.id === 'notes-modal' || node.id === 'timer-modal') {
        node.classList.add('hidden', 'opacity-0');
      } else if (node.id?.startsWith('dynamic-modal-')) {
        node.remove();
      }
    });
    const toastRoot = document.getElementById('toast') || document.getElementById('app-toast');
    if (toastRoot) {
      toastRoot.classList.add('opacity-0', 'translate-y-4', 'pointer-events-none');
      toastRoot.style.display = 'none';
    }
    document.body.classList.remove('toast-open');
  });
}

async function enterApp(page) {
  await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(800);
  await dismissOverlays(page);
  await page.evaluate(() => {
    if (typeof showToast === 'function') window.showToast = function mutedToast() {};
    localStorage.setItem('uculiDeveloperBypass', '1');
    if (typeof activateDeveloperBypassSession === 'function') activateDeveloperBypassSession();
    if (typeof startLocalTestModeFromGate === 'function') startLocalTestModeFromGate();
    if (typeof enterAppFromLanding === 'function' && document.getElementById('auth-gate')) {
      enterAppFromLanding('local-test-mode');
    }
    userSettings.language = 'nl';
    userSettings.termsAccepted = true;
  });
  await sleep(1000);
  await dismissOverlays(page);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1280,900']
});

try {
  for (const width of WIDTHS) {
    console.log(`=== ${PREFIX} ${PHASE} detail @ ${width} ===`);
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);
    await page.setViewport({ width, height: width <= 420 ? 844 : 900, deviceScaleFactor: 1 });
    await enterApp(page);

    await page.evaluate(() => {
      const recipeId = 808080;
      recipes = [
        {
          id: recipeId,
          source: 'local',
          title: 'Tomatensoep & basilicum',
          author: 'Miems H.',
          category: 'Cooking',
          country: 'Nederland',
          ingredients: [
            '400 g tomaten',
            '1 ui & 2 tenen knoflook',
            '½ tl chili · crème fraîche',
            'zout < 1 tl'
          ],
          instructions: [
            { text: 'Fruit de ui & knoflook 5 min.', minutes: 5, image: '' },
            { text: 'Voeg tomaten toe; laat ½ uur sudderen.', minutes: 30, image: '' },
            { text: 'Pureer & breng op smaak met zout < peper.', minutes: 2, image: '' }
          ],
          tips: 'Serveer met crème & vers basilicum.',
          personalNotes: 'Extra peper voor Martijn.',
          prepTime: 10,
          cookTime: 35,
          servings: 4,
          difficulty: 'Easy',
          cuisine: 'Dutch',
          diet: [],
          mealType: ['Dinner'],
          profile: null,
          checkedIngredients: [],
          checkedSteps: []
        },
        ...(recipes || []).filter((r) => r.id !== recipeId)
      ];
      renderDetail(recipeId);
    });
    await sleep(800);
    await dismissOverlays(page);
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      document.getElementById('app-content')?.scrollTo?.(0, 0);
      document.querySelector('.detail-hero-shell, .detail-shell')?.scrollIntoView({ block: 'nearest' });
    });
    await sleep(250);
    const info = await page.evaluate(() => ({
      title: document.querySelector('.detail-hero-title')?.textContent?.trim() || '',
      ingCount: document.querySelectorAll('#ingredients-list li, .detail-ingredients-panel li').length,
      stepCount: document.querySelectorAll('.detail-step').length
    }));
    console.log(`detail@${width}`, JSON.stringify(info));
    const file = path.join(ART, `${PREFIX}-${PHASE}-detail-${width}.png`);
    await page.screenshot({ path: file, fullPage: false });
    console.log('wrote', file);
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(`done ${PREFIX} ${PHASE}`);
