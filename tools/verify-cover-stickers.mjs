import puppeteer from 'puppeteer-core';
import fs from 'fs';

const ART = '/opt/cursor/artifacts';
fs.mkdirSync(ART, { recursive: true });
const CHROME = '/usr/bin/google-chrome-stable';
const APP = 'http://127.0.0.1:8765/app.html?dev-bypass=1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const log = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ' — ' + detail : ''}`);
};

const TINY_JPEG =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyISoZMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z';

async function prepareCover(page) {
  await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(1200);

  const entered = await page.evaluate(() => {
    if (typeof startLocalTestModeFromGate === 'function') {
      return startLocalTestModeFromGate();
    }
    return false;
  });
  if (!entered) {
    // Already in app via activate on load
    await page.evaluate(() => {
      localStorage.setItem('uculiDeveloperBypass', '1');
      if (typeof activateDeveloperBypassSession === 'function') activateDeveloperBypassSession();
      if (typeof enterAppFromLanding === 'function') enterAppFromLanding('local-test-mode');
    });
  }
  await sleep(1500);

  await page.evaluate((tinyJpeg) => {
    notebookCoverOpen = false;
    if (typeof setIndexViewMode === 'function') setIndexViewMode('book');
    userSettings.notebookCover = normalizeNotebookCover({
      palette: 'oat',
      title: 'Keukenboek',
      subtitle: 'Stickers test',
      spineLabel: 'Uculi',
      stickers: [
        { kind: 'text', face: 'front', text: 'SOEP', color: 'blue', size: 'md', rotation: -6, x: 78, y: 22 },
        { kind: 'emoji', face: 'front', emoji: '🍋', background: 'none', size: 'md', rotation: 8, x: 24, y: 74 },
        { kind: 'photo', face: 'front', photo: tinyJpeg, size: 'md', rotation: -4, x: 72, y: 70 },
        { kind: 'text', face: 'back', text: 'BACK', color: 'sage', size: 'sm', rotation: 5, x: 70, y: 30 },
        { kind: 'emoji', face: 'back', emoji: '✨', background: 'none', size: 'lg', rotation: -8, x: 30, y: 68 }
      ]
    });
    if (typeof saveData === 'function') saveData();
    if (typeof renderList === 'function') renderList();
  }, TINY_JPEG);
  await sleep(800);
}

async function openEditor(page) {
  await page.evaluate(() => {
    if (typeof openCoverEditor === 'function') openCoverEditor();
  });
  await sleep(700);
  const visible = await page.evaluate(() => {
    const modal = document.getElementById('cover-editor-modal');
    return Boolean(modal && !modal.classList.contains('hidden'));
  });
  return visible;
}

async function runViewport(name, width, height) {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=' + width + ',' + height]
  });
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });

  try {
    await prepareCover(page);

    const landingKinds = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('#notebook-cover-surface [data-cover-sticker-kind]')];
      return nodes.map(node => ({
        kind: node.dataset.coverStickerKind,
        face: node.dataset.coverStickerFace
      }));
    });
    const frontKinds = landingKinds.filter(s => s.face === 'front').map(s => s.kind).sort().join(',');
    const backKinds = landingKinds.filter(s => s.face === 'back').map(s => s.kind).sort().join(',');
    log(`${name}: landing front stickers`, frontKinds === 'emoji,photo,text', frontKinds);
    log(`${name}: landing back stickers present in DOM`, backKinds === 'emoji,text', backKinds);
    log(`${name}: dual faces`, await page.evaluate(() =>
      Boolean(document.querySelector('#notebook-cover-surface [data-cover-face="front"]')) &&
      Boolean(document.querySelector('#notebook-cover-surface [data-cover-face="back"]'))
    ));

    await page.screenshot({ path: `${ART}/cover-stickers-${name}-landing.png`, fullPage: false });

    const editorOpen = await openEditor(page);
    log(`${name}: cover editor opens`, editorOpen);

    const editorFront = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('#cover-editor-preview-surface [data-cover-sticker-kind]')];
      return {
        faceToggle: Boolean(document.querySelector('#cover-editor-body button[onclick*="setDraftCoverPreviewFace"]')),
        addButtons: [...document.querySelectorAll('#cover-editor-body button[onclick*="addDraftCoverSticker"]')].map(b => b.textContent.trim()),
        kinds: nodes.map(n => n.dataset.coverStickerKind).sort().join(','),
        faces: [...new Set(nodes.map(n => n.dataset.coverStickerFace))]
      };
    });
    log(`${name}: editor face toggle`, editorFront.faceToggle);
    log(`${name}: add by kind buttons`, editorFront.addButtons.join('|').includes('Tekst') && editorFront.addButtons.join('|').includes('Emoji') && editorFront.addButtons.join('|').includes('Foto'), editorFront.addButtons.join('|'));
    log(`${name}: editor shows front stickers only`, editorFront.kinds === 'emoji,photo,text' && editorFront.faces.join(',') === 'front', `${editorFront.kinds} / ${editorFront.faces}`);

    await page.screenshot({ path: `${ART}/cover-stickers-${name}-editor-front.png`, fullPage: false });

    await page.evaluate(() => setDraftCoverPreviewFace('back'));
    await sleep(500);
    const editorBack = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('#cover-editor-preview-surface [data-cover-sticker-kind]')];
      return {
        kinds: nodes.map(n => n.dataset.coverStickerKind).sort().join(','),
        faces: [...new Set(nodes.map(n => n.dataset.coverStickerFace))],
        label: document.body.innerText.includes('Achterkant')
      };
    });
    log(`${name}: editor back preview`, editorBack.kinds === 'emoji,text' && editorBack.faces.join(',') === 'back', `${editorBack.kinds} / ${editorBack.faces}`);

    await page.screenshot({ path: `${ART}/cover-stickers-${name}-editor-back.png`, fullPage: false });

    await page.evaluate(() => {
      addDraftCoverSticker('photo');
    });
    await sleep(400);
    const added = await page.evaluate(() => {
      const stickers = draftNotebookCover?.stickers || [];
      const last = stickers[stickers.length - 1];
      return { count: stickers.length, kind: last?.kind, face: last?.face };
    });
    log(`${name}: add photo on back`, added.kind === 'photo' && added.face === 'back' && added.count === 6, JSON.stringify(added));

    await page.evaluate(() => {
      if (typeof saveCoverEditor === 'function') saveCoverEditor();
    });
    await sleep(500);
    const persisted = await page.evaluate(() => {
      const cover = normalizeNotebookCover(userSettings.notebookCover);
      return {
        kinds: cover.stickers.map(s => s.kind).sort().join(','),
        faces: cover.stickers.map(s => s.face).sort().join(','),
        hybridGone: cover.stickers.every(s => !(s.kind === 'text' && s.emoji) && !(s.kind === 'emoji' && s.text))
      };
    });
    log(`${name}: persist kinds+faces`, persisted.kinds.includes('photo') && persisted.faces.includes('back') && persisted.hybridGone, JSON.stringify(persisted));
  } catch (error) {
    log(`${name}: unexpected error`, false, String(error?.stack || error));
  } finally {
    await browser.close();
  }
}

await runViewport('desktop', 1280, 900);
await runViewport('phone', 390, 844);

fs.writeFileSync(`${ART}/cover-stickers-verify.json`, JSON.stringify(results, null, 2));
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
