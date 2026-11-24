import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const ART = process.env.DRAFT_ART || '/opt/cursor/artifacts/draft';
const PREFIX = process.env.DRAFT_PREFIX || 'draft';
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
    document.querySelectorAll('.app-toast, [data-toast], #toast-container').forEach((n) => {
      n.style.display = 'none';
    });
    document.querySelectorAll('.index-plan-note').forEach((n) => {
      n.style.display = 'none';
    });
    if (typeof userSettings !== 'undefined') {
      userSettings.termsAccepted = true;
      userSettings.language = 'nl';
      if (typeof saveData === 'function') saveData();
    }
  });
}

async function enterApp(page) {
  await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(800);
  await dismissOverlays(page);
  await page.evaluate(() => {
    if (typeof showToast === 'function' && !window.__draftShotToastMuted) {
      window.__draftShotToastMuted = true;
      window.showToast = function mutedToast() {};
    }
    localStorage.setItem('uculiDeveloperBypass', '1');
    if (typeof activateDeveloperBypassSession === 'function') activateDeveloperBypassSession();
    if (typeof startLocalTestModeFromGate === 'function') startLocalTestModeFromGate();
    if (typeof enterAppFromLanding === 'function' && document.getElementById('auth-gate')) {
      enterAppFromLanding('local-test-mode');
    }
    userSettings.language = 'nl';
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
    console.log(`=== ${PREFIX} ${PHASE} editor @ ${width} ===`);
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);
    await page.setViewport({ width, height: width <= 420 ? 844 : 900, deviceScaleFactor: 1 });
    await enterApp(page);

    if (PHASE === 'after') {
      await page.evaluate(() => {
        if (typeof clearRecipeEditorDraft === 'function') clearRecipeEditorDraft('new');
        // Seed a draft that differs from the empty baseline so restore notice appears.
        const snapshot = {
          version: 1,
          recipeId: 'new',
          updatedAt: Date.now(),
          title: 'Concept paddenstoelenstoof',
          author: 'Miems H.',
          category: 'Cooking',
          country: '',
          familyId: '',
          tips: '',
          prepTime: '15',
          cookTime: '30',
          servings: '4',
          difficulty: 'Easy',
          cuisine: '',
          mealType: [],
          diet: [],
          ingredients: ['200 g champignons', '1 ui'],
          steps: [
            { text: 'Snijd de champignons', image: '', minutes: 1 },
            { text: 'Fruit de ui', image: '', minutes: 1 }
          ],
          profile: null,
          detailsOpen: false
        };
        const key = typeof getRecipeDraftStorageKey === 'function'
          ? getRecipeDraftStorageKey('new')
          : 'uculiRecipeDraft:new';
        localStorage.setItem(key, JSON.stringify(snapshot));
        renderAddForm();
      });
    } else {
      await page.evaluate(() => {
        renderAddForm();
      });
    }
    await sleep(900);
    await dismissOverlays(page);
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      document.getElementById('app-content')?.scrollTo?.(0, 0);
      document.querySelector('.editor-hero, #recipe-draft-restored-notice')?.scrollIntoView({ block: 'start' });
    });
    await sleep(250);
    const info = await page.evaluate(() => {
      const notice = document.getElementById('recipe-draft-restored-notice');
      return {
        title: document.getElementById('r-title')?.value || '',
        notice: notice?.querySelector('p')?.textContent?.trim() || null,
        discard: notice?.querySelector('button')?.textContent?.trim() || null,
        hasDraftFns: typeof loadRecipeEditorDraft === 'function'
      };
    });
    console.log(`editor@${width}`, JSON.stringify(info));
    const file = path.join(ART, `${PREFIX}-${PHASE}-editor-${width}.png`);
    await page.screenshot({ path: file, fullPage: false });
    console.log('wrote', file);
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(`done ${PREFIX} ${PHASE}`);
