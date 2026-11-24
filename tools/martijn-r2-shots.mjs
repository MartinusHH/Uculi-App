import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const ART = '/opt/cursor/artifacts';
const STORE = '/cursor/stores/self/artifacts';
const CHROME = fs.existsSync('/usr/bin/google-chrome-stable')
  ? '/usr/bin/google-chrome-stable'
  : '/usr/local/bin/google-chrome';
const APP = 'http://127.0.0.1:5173/app.html?dev-bypass=1&lang=nl';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WIDTHS = [390, 820, 1280, 1920];

fs.mkdirSync(ART, { recursive: true });
fs.mkdirSync(STORE, { recursive: true });

async function dismiss(page) {
  await page.evaluate(() => {
    document.getElementById('uculi-tour')?.remove();
    document.getElementById('terms-accept-modal')?.remove();
    if (typeof showToast === 'function' && !window.__martijnShotToastMuted) {
      window.__martijnShotToastMuted = true;
      window.showToast = function () {};
    }
    const toast = document.getElementById('toast');
    if (toast) {
      toast.style.display = 'none';
      toast.classList.add('opacity-0', 'pointer-events-none');
    }
    document.body.classList.remove('toast-open');
    document.querySelectorAll('.app-overlay').forEach((node) => {
      if (node.id?.startsWith('dynamic-modal-')) node.remove();
    });
    if (typeof userSettings !== 'undefined') {
      userSettings.termsAccepted = true;
      userSettings.language = 'nl';
      saveData?.();
    }
  });
}

async function enter(page) {
  await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(700);
  await dismiss(page);
  await page.evaluate(() => {
    if (typeof showToast === 'function') window.showToast = function () {};
    localStorage.setItem('uculiDeveloperBypass', '1');
    activateDeveloperBypassSession?.();
    startLocalTestModeFromGate?.();
    if (document.getElementById('auth-gate')) enterAppFromLanding?.('local-test-mode');
  });
  await sleep(900);
  await dismiss(page);
}

async function seed(page) {
  await page.evaluate(() => {
    const now = Date.now();
    recipes = [
      {
        id: now,
        title: 'Forester Mushroom Stew',
        source: 'local',
        category: 'Cooking',
        difficulty: 'Easy',
        diet: [],
        ingredients: ['200 g champignons', '1 ui', '2 el boter'],
        instructions: ['Snijd', 'Kook'],
        notes: '',
        image: '',
        profile: '',
        checkedIngredients: [],
        checkedSteps: [],
        notebookStickyNotes: [],
        servings: 4,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: now + 1,
        title: 'Avocado toast',
        source: 'published',
        category: 'Cooking',
        difficulty: 'Easy',
        diet: [],
        ingredients: ['2 avocado'],
        instructions: ['Prak'],
        notes: '',
        image: '',
        profile: '',
        checkedIngredients: [],
        checkedSteps: [],
        notebookStickyNotes: [],
        servings: 2,
        publishedId: 'pub-avoc',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];
    userSettings.language = 'nl';
    userSettings.name = 'Miems H.';
    userSettings.shoppingList = {
      items: [
        { id: 's1', label: 'Melk bui 3l', kind: 'custom', checked: false, assignedTo: '', sourceRecipeTitles: [], sourceRecipeIds: [], note: '', updatedAt: new Date().toISOString() },
        { id: 's2', label: 'Boter', kind: 'recipe', checked: false, assignedTo: 'You', sourceRecipeTitles: ['Forester Mushroom Stew'], sourceRecipeIds: [now], note: '', updatedAt: new Date().toISOString() },
        { id: 's3', label: 'Avocado 2 stuks', kind: 'recipe', checked: false, assignedTo: '', sourceRecipeTitles: ['Avocado toast'], sourceRecipeIds: [now + 1], note: '', updatedAt: new Date().toISOString() }
      ],
      collaborators: [],
      syncMode: 'local',
      sharedMembers: [],
      pendingInviteEmails: []
    };
    userSettings.shoppingList = normalizeShoppingListState(userSettings.shoppingList);
    saveData?.();
  });
}

async function saveShot(page, screen, width) {
  const name = `martijn-r2-after-${screen}-${width}.png`;
  const dest = path.join(ART, name);
  await page.screenshot({ path: dest, fullPage: false });
  fs.copyFileSync(dest, path.join(STORE, name));
  console.log('wrote', name);
}

async function runWidth(browser, width) {
  const page = await browser.newPage();
  await page.setViewport({ width, height: width <= 420 ? 844 : 900, deviceScaleFactor: 1 });
  await enter(page);
  await seed(page);
  await dismiss(page);

  // Shop — assignee chip color
  await page.evaluate(() => renderShoppingList());
  await sleep(600);
  await dismiss(page);
  const shopInfo = await page.evaluate(() => {
    const chip = document.querySelector('.shop-line-assignees button');
    if (!chip) return null;
    const s = getComputedStyle(chip);
    return { bg: s.backgroundColor, color: s.color, text: chip.textContent.trim() };
  });
  console.log(`shop-chip@${width}`, JSON.stringify(shopInfo));
  await saveShot(page, 'shop', width);

  // Bron — Opgeslagen heart
  await page.evaluate(() => {
    indexViewMode = 'cards';
    showListFilters = true;
    renderList();
  });
  await sleep(600);
  await dismiss(page);
  await page.evaluate(() => document.querySelector('.source-filter-row')?.scrollIntoView({ block: 'center' }));
  await sleep(250);
  const bronInfo = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.source-filter-row button')];
    return btns.map((b) => {
      const icon = b.querySelector('i[data-lucide]');
      const ir = icon?.getBoundingClientRect();
      return {
        text: (b.textContent || '').replace(/\s+/g, ' ').trim(),
        iconW: ir ? Math.round(ir.width) : null,
        iconH: ir ? Math.round(ir.height) : null
      };
    });
  });
  console.log(`bron@${width}`, JSON.stringify(bronInfo));
  await saveShot(page, 'bron', width);

  // Diet — Alles wissen text-only
  await page.evaluate(() => document.querySelector('.filter-diet-actions')?.scrollIntoView({ block: 'center' }));
  await sleep(250);
  const dietInfo = await page.evaluate(() => {
    const row = document.querySelector('.filter-diet-actions');
    if (!row) return null;
    const clear = [...row.querySelectorAll('button')].find((b) => /Alles wissen|Clear all/i.test(b.textContent || ''));
    return {
      clearText: (clear?.textContent || '').replace(/\s+/g, ' ').trim(),
      hasRotate: Boolean(clear?.querySelector('[data-lucide="rotate-ccw"]')),
      widths: [...row.querySelectorAll('button')].map((b) => Math.round(b.getBoundingClientRect().width))
    };
  });
  console.log(`diet@${width}`, JSON.stringify(dietInfo));
  await saveShot(page, 'diet', width);

  // Profile top — heading margin
  await page.evaluate(() => renderProfileEditor());
  await sleep(500);
  await dismiss(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(200);
  const profileInfo = await page.evaluate(() => {
    const hero = document.querySelector('.profile-sheet > .browse-hero');
    const h2 = hero?.querySelector('h2');
    if (!hero || !h2) return null;
    const hs = getComputedStyle(hero);
    const hr = hero.getBoundingClientRect();
    const h2r = h2.getBoundingClientRect();
    return {
      marginInline: `${hs.marginLeft} / ${hs.marginRight}`,
      h2Left: Math.round(h2r.left),
      heroLeft: Math.round(hr.left)
    };
  });
  console.log(`profile-top@${width}`, JSON.stringify(profileInfo));
  await saveShot(page, 'profile-top', width);

  await page.evaluate(() => document.querySelector('.profile-editor-actions')?.scrollIntoView({ block: 'center' }));
  await sleep(200);
  await saveShot(page, 'profile-footer', width);

  await page.close();
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});

try {
  for (const width of WIDTHS) {
    console.log(`=== r2 @ ${width} ===`);
    await runWidth(browser, width);
  }
} finally {
  await browser.close();
}
console.log('done r2');
