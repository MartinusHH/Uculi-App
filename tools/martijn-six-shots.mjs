import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const ART = '/opt/cursor/artifacts/martijn-six';
const CHROME = fs.existsSync('/usr/bin/google-chrome-stable')
  ? '/usr/bin/google-chrome-stable'
  : '/usr/local/bin/google-chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WIDTHS = [390, 820, 1280, 1920];
const PHASE = process.argv[2] === 'before' ? 'before' : 'after';
const APP_BASE = process.argv[3] || (PHASE === 'before' ? 'http://127.0.0.1:5174' : 'http://127.0.0.1:5173');
const APP = `${APP_BASE}/app.html?dev-bypass=1&lang=nl`;

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
    document.querySelectorAll('[class*="toast"], .app-toast, #app-toast').forEach((n) => n.remove());
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
    localStorage.setItem('uculiDeveloperBypass', '1');
    if (typeof activateDeveloperBypassSession === 'function') activateDeveloperBypassSession();
    if (typeof startLocalTestModeFromGate === 'function') startLocalTestModeFromGate();
    if (typeof enterAppFromLanding === 'function' && document.getElementById('auth-gate')) {
      enterAppFromLanding('local-test-mode');
    }
  });
  await sleep(1000);
  await dismissOverlays(page);
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
        ingredients: ['200 g champignons', '1 ui', '2 el boter', '500 ml bouillon', '100 ml room', '1 tl tijm'],
        instructions: ['Snijd de champignons', 'Fruit de ui', 'Voeg bouillon toe', 'Laat sudderen'],
        notes: '',
        image: '',
        profile: '',
        checkedIngredients: [],
        checkedSteps: [],
        notebookStickyNotes: [],
        servings: 4,
        prepTime: 15,
        cookTime: 30,
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
        ingredients: ['2 avocado', '2 sneetjes brood'],
        instructions: ['Prak de avocado', 'Smeer op brood'],
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
    userSettings.measurementSystem = 'Metric';
    userSettings.name = 'Miems H.';
    userSettings.indexViewMode = 'cards';
    userSettings.shoppingList = {
      items: [
        { id: 's1', label: 'Melk bui 3l', kind: 'custom', checked: false, assignedTo: '', sourceRecipeTitles: [], sourceRecipeIds: [], note: '', updatedAt: new Date().toISOString() },
        { id: 's2', label: 'Avocado 2 stuks', kind: 'recipe', checked: false, assignedTo: '', sourceRecipeTitles: ['Avocado toast'], sourceRecipeIds: [now + 1], note: '', updatedAt: new Date().toISOString() },
        { id: 's3', label: 'Boter', kind: 'recipe', checked: false, assignedTo: 'You', sourceRecipeTitles: ['Forester Mushroom Stew'], sourceRecipeIds: [now], note: '', updatedAt: new Date().toISOString() },
        { id: 's4', label: 'Ui', kind: 'custom', checked: false, assignedTo: '', sourceRecipeTitles: [], sourceRecipeIds: [], note: '', updatedAt: new Date().toISOString() }
      ],
      collaborators: [],
      syncMode: 'local',
      sharedMembers: [],
      pendingInviteEmails: []
    };
    if (typeof normalizeShoppingListState === 'function') {
      userSettings.shoppingList = normalizeShoppingListState(userSettings.shoppingList);
    }
    if (typeof saveData === 'function') saveData();
  });
}

async function shot(page, width, name) {
  const file = path.join(ART, `${PHASE}-${name}-${width}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log('wrote', file);
}

async function probe(page, label) {
  const info = await page.evaluate(() => ({
    view: typeof currentView !== 'undefined' ? currentView : null,
    indexViewMode: typeof indexViewMode !== 'undefined' ? indexViewMode : null,
    notebookCoverOpen: typeof notebookCoverOpen !== 'undefined' ? notebookCoverOpen : null,
    showListFilters: typeof showListFilters !== 'undefined' ? showListFilters : null,
    hasSwitch: Boolean(document.querySelector('.measurement-system-switch, button[onclick*="toggleMeasurementSystem"]')),
    hasBron: Boolean(document.querySelector('.index-filters-panel, .index-filter-controls')),
    hasShop: Boolean(document.querySelector('.shop-line, #app-content h2')),
    hasProfileActions: Boolean(document.querySelector('.profile-editor-actions')),
    hasCover: Boolean(document.querySelector('.notebook-landing-invite, .notebook-landing-action-row')),
    h2: document.querySelector('#app-content h2, .browse-hero-copy h2, .notebook-landing-invite h2')?.textContent?.trim()?.slice(0, 60) || '',
    bodySnippet: (document.getElementById('app-content')?.innerText || '').slice(0, 120).replace(/\s+/g, ' ')
  }));
  console.log(label, JSON.stringify(info));
  return info;
}

async function runWidth(browser, width) {
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  await page.setViewport({ width, height: width <= 420 ? 844 : 900, deviceScaleFactor: 1 });
  await enterApp(page);
  await seed(page);
  await dismissOverlays(page);

  // 1) Cover landing (notebook book mode, cover closed)
  await page.evaluate(() => {
    notebookCoverOpen = false;
    showListFilters = false;
    indexViewMode = 'book';
    userSettings.indexViewMode = 'book';
    if (typeof setIndexViewMode === 'function') setIndexViewMode('book');
    else if (typeof renderList === 'function') renderList();
  });
  await sleep(900);
  await dismissOverlays(page);
  await page.evaluate(() => {
    notebookCoverOpen = false;
    if (typeof renderList === 'function') renderList();
  });
  await sleep(700);
  await dismissOverlays(page);
  await probe(page, `cover@${width}`);
  await shot(page, width, 'cover');

  // 2) Measurement switch on classic detail
  await page.evaluate(() => {
    indexViewMode = 'cards';
    userSettings.indexViewMode = 'cards';
    if (typeof renderDetail === 'function') renderDetail(recipes[0].id);
  });
  await sleep(800);
  await dismissOverlays(page);
  await page.evaluate(() => {
    const el = document.querySelector('.measurement-system-switch, button[onclick*="toggleMeasurementSystem"], .detail-scale-control');
    el?.scrollIntoView({ block: 'center' });
  });
  await sleep(400);
  await probe(page, `metric@${width}`);
  await shot(page, width, 'metric');

  // 3) Bron filters
  await page.evaluate(() => {
    indexViewMode = 'cards';
    userSettings.indexViewMode = 'cards';
    showListFilters = true;
    if (typeof renderList === 'function') renderList();
  });
  await sleep(700);
  await dismissOverlays(page);
  await page.evaluate(() => {
    const el = document.querySelector('.index-filters-panel, .index-filter-controls');
    el?.scrollIntoView({ block: 'start' });
  });
  await sleep(350);
  await probe(page, `bron@${width}`);
  await shot(page, width, 'bron');

  // 4) Shopping list
  await page.evaluate(() => {
    if (typeof renderShoppingList === 'function') renderShoppingList();
  });
  await sleep(800);
  await dismissOverlays(page);
  await probe(page, `shop@${width}`);
  await shot(page, width, 'shop');

  // 5) Profile editor top
  await page.evaluate(() => {
    if (typeof renderProfileEditor === 'function') renderProfileEditor();
  });
  await sleep(700);
  await dismissOverlays(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(200);
  await probe(page, `profile-top@${width}`);
  await shot(page, width, 'profile-top');

  // 6) Profile editor footer
  await page.evaluate(() => {
    const actions = document.querySelector('.profile-editor-actions');
    if (actions) actions.scrollIntoView({ block: 'center' });
    else window.scrollTo(0, document.body.scrollHeight);
  });
  await sleep(300);
  await probe(page, `profile-footer@${width}`);
  await shot(page, width, 'profile-footer');

  await page.close();
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1280,900']
});

try {
  for (const width of WIDTHS) {
    console.log(`=== ${PHASE} @ ${width} ===`);
    await runWidth(browser, width);
  }
} finally {
  await browser.close();
}

console.log(`done ${PHASE}`);
