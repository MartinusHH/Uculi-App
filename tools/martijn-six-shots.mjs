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
    document.querySelectorAll('.app-toast, #app-toast, [data-toast]').forEach((n) => n.remove());
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

async function measureRow(page, selector) {
  return page.evaluate((sel) => {
    const row = document.querySelector(sel);
    if (!row) return null;
    const buttons = [...row.querySelectorAll('button')];
    const rowBox = row.getBoundingClientRect();
    return {
      rowWidth: Math.round(rowBox.width),
      buttons: buttons.map((b) => {
        const box = b.getBoundingClientRect();
        return {
          text: (b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
          width: Math.round(box.width),
          pct: rowBox.width ? Math.round((box.width / rowBox.width) * 100) : 0
        };
      })
    };
  }, selector);
}

async function runWidth(browser, width) {
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  await page.setViewport({ width, height: width <= 420 ? 844 : 900, deviceScaleFactor: 1 });
  await enterApp(page);
  await seed(page);
  await dismissOverlays(page);

  // 1) Cover landing
  await page.evaluate(() => {
    indexViewMode = 'book';
    userSettings.indexViewMode = 'book';
    notebookCoverOpen = false;
    showListFilters = false;
    renderList();
  });
  await sleep(800);
  await dismissOverlays(page);
  const coverRow = await measureRow(page, '.notebook-landing-action-row');
  console.log(`cover-row@${width}`, JSON.stringify(coverRow));
  await shot(page, width, 'cover');

  // 2) Measurement switch
  await page.evaluate(() => {
    indexViewMode = 'cards';
    userSettings.indexViewMode = 'cards';
    renderDetail(recipes[0].id);
  });
  await sleep(700);
  await dismissOverlays(page);
  await page.evaluate(() => {
    document.querySelector('.measurement-system-switch, button[onclick*="toggleMeasurementSystem"], .detail-scale-control')
      ?.scrollIntoView({ block: 'center' });
  });
  await sleep(300);
  const hasSwitch = await page.evaluate(() => Boolean(document.querySelector('.measurement-system-switch')));
  console.log(`metric@${width} hasSwitch=${hasSwitch}`);
  await shot(page, width, 'metric');

  // 3) Bron filters
  await page.evaluate(() => {
    indexViewMode = 'cards';
    userSettings.indexViewMode = 'cards';
    showListFilters = true;
    renderList();
  });
  await sleep(700);
  await dismissOverlays(page);
  await page.evaluate(() => {
    document.querySelector('.source-filter-row, .index-filters-panel')?.scrollIntoView({ block: 'start' });
  });
  await sleep(300);
  const bronRow = await measureRow(page, '.source-filter-row');
  console.log(`bron-row@${width}`, JSON.stringify(bronRow));
  await shot(page, width, 'bron');

  // 4) Shopping
  await page.evaluate(() => renderShoppingList());
  await sleep(700);
  await dismissOverlays(page);
  const shopInfo = await page.evaluate(() => {
    const check = document.querySelector('.shop-line-check, button[onclick*="toggleShoppingListItemChecked"]');
    const box = check?.getBoundingClientRect();
    const text = (document.getElementById('app-content')?.innerText || '').slice(0, 400);
    return {
      checkW: box ? Math.round(box.width) : null,
      checkH: box ? Math.round(box.height) : null,
      hasEigen: /Eigen/i.test(text),
      hasRecept: /Recept/i.test(text),
      hasNiet: /Niet toegewezen/i.test(text),
      hasCustom: /\bCUSTOM\b/.test(text),
      hasJij: /\bJij\b/.test(text),
      hasY: /\bY\b/.test(text)
    };
  });
  console.log(`shop@${width}`, JSON.stringify(shopInfo));
  await shot(page, width, 'shop');

  // 5) Profile top
  await page.evaluate(() => renderProfileEditor());
  await sleep(600);
  await dismissOverlays(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(200);
  const profileTop = await page.evaluate(() => {
    const text = document.getElementById('app-content')?.innerText || '';
    return {
      hasBuilder: /Op desktop blijft|wide sheet language|families overzicht/i.test(text),
      hasTerugBtn: [...document.querySelectorAll('button')].some((b) => /^Terug$|^Back$/i.test((b.textContent || '').trim())),
      hasCenteredAvatar: Boolean(document.querySelector('.profile-editor-avatar-upload'))
    };
  });
  console.log(`profile-top@${width}`, JSON.stringify(profileTop));
  await shot(page, width, 'profile-top');

  // 6) Profile footer
  await page.evaluate(() => {
    document.querySelector('.profile-editor-actions')?.scrollIntoView({ block: 'center' });
  });
  await sleep(250);
  const footerRow = await measureRow(page, '.profile-editor-actions');
  console.log(`profile-footer@${width}`, JSON.stringify(footerRow));
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
