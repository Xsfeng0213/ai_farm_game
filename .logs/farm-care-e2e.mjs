import { chromium } from 'playwright';
import fs from 'node:fs';

const baseUrl = 'http://localhost:5177';
const outDir = '.logs';
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const result = {
  startedAt: new Date().toISOString(),
  steps: [],
  clientA: {},
  clientB: {},
  errors: []
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function hold(page, key, ms) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

async function login(page, nickname) {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.fill('#nickname-input', nickname);
  await page.click('#join-btn');
  await page.waitForFunction(() => document.querySelector('#login-overlay')?.classList.contains('hidden') === true, {
    timeout: 10000
  });
  await page.waitForTimeout(1200);
}

async function moveToFarm(page) {
  await hold(page, 's', 5000);
  await page.waitForTimeout(1000);
  await page.waitForFunction(() => document.querySelector('#room-label')?.textContent?.includes(':farm') === true, {
    timeout: 12000
  });
}

async function moveToWestPlots(page) {
  await hold(page, 'ArrowDown', 4100);
  await hold(page, 'ArrowLeft', 2050);
  await page.waitForTimeout(500);
}

async function hint(page) {
  return await page.locator('#hint-label').innerText();
}

async function clickPanelOptionById(page, optionId) {
  const point = await page.evaluate((id) => {
    const scene = window.__AI_FARM_GAME__?.scene?.keys?.FarmScene;
    const panel = scene?.actionPanel;
    if (!scene || !panel || !panel.visible) {
      return null;
    }

    const row = panel.rowBounds?.find((item) => item.id === id);
    if (!row || row.disabled) {
      return null;
    }

    const cam = scene.cameras.main;
    const rect = scene.game.canvas.getBoundingClientRect();
    const scaleX = rect.width / scene.scale.width;
    const scaleY = rect.height / scene.scale.height;
    const worldX = panel.container.x;
    const worldY = panel.container.y + (row.minY + row.maxY) / 2;

    return {
      x: rect.left + (worldX - cam.scrollX) * scaleX,
      y: rect.top + (worldY - cam.scrollY) * scaleY
    };
  }, optionId);

  if (!point) {
    throw new Error(`panel option ${optionId} not found`);
  }

  await page.mouse.click(point.x, point.y);
}

async function selectCrop(page, crop) {
  await page.keyboard.press('e');
  await page.waitForTimeout(180);
  await clickPanelOptionById(page, crop);
  await page.waitForTimeout(600);
  return await hint(page);
}

async function selectCare(page, action) {
  await page.keyboard.press('e');
  await page.waitForTimeout(180);
  await clickPanelOptionById(page, action);
  await page.waitForTimeout(650);
  return await hint(page);
}

const browser = await chromium.launch({ headless: true });
try {
  const contextA = await browser.newContext({ viewport: { width: 1480, height: 900 } });
  const contextB = await browser.newContext({ viewport: { width: 1480, height: 900 } });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  const bindErrors = (page, client) => {
    page.on('pageerror', (error) => {
      result.errors.push({ client, type: 'pageerror', message: String(error) });
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        result.errors.push({ client, type: 'console', message: msg.text() });
      }
    });
  };

  bindErrors(pageA, 'A');
  bindErrors(pageB, 'B');

  result.steps.push('login 2 clients and enter farm');
  await login(pageA, 'Alpha');
  await login(pageB, 'Beta');
  await moveToFarm(pageA);
  await moveToFarm(pageB);

  result.clientA.room = await pageA.locator('#room-label').innerText();
  result.clientB.room = await pageB.locator('#room-label').innerText();

  result.steps.push('move both clients to farm plots');
  await moveToWestPlots(pageA);
  await moveToWestPlots(pageB);

  result.clientA.prePlantHint = await hint(pageA);

  result.steps.push('A selects crop and plants 3 plots');
  const plant1 = await selectCrop(pageA, 'carrot');
  await hold(pageA, 'ArrowRight', 780);
  const plant2 = await selectCrop(pageA, 'potato');
  await hold(pageA, 'ArrowLeft', 1580);
  const plant3 = await selectCrop(pageA, 'wheat');
  result.clientA.plantHints = [plant1, plant2, plant3];

  result.steps.push('A waters and fertilizes wheat plot');
  const waterHint = await selectCare(pageA, 'water');
  const fertilizeHint = await selectCare(pageA, 'fertilize');
  result.clientA.careHints = { waterHint, fertilizeHint };

  result.steps.push('B verifies sync on same plots');
  const bHintCarrot = await hint(pageB);
  await hold(pageB, 'ArrowRight', 780);
  const bHintPotato = await hint(pageB);
  await hold(pageB, 'ArrowLeft', 1580);
  const bHintWheatAfterCare = await hint(pageB);
  result.clientB.syncHintsAfterPlant = [bHintCarrot, bHintPotato, bHintWheatAfterCare];

  result.steps.push('wait accelerated growth and harvest wheat');
  await sleep(8200);
  const wheatAfterBoost = await hint(pageA);
  await hold(pageA, 'ArrowRight', 780);
  const carrotAfterBoost = await hint(pageA);
  await hold(pageA, 'ArrowLeft', 780);
  await pageA.keyboard.press('e');
  await pageA.waitForTimeout(500);
  result.clientA.afterBoostHints = { wheatAfterBoost, carrotAfterBoost };
  result.clientA.coinsAfterHarvest = await pageA.locator('#coins-label').innerText();

  result.steps.push('B verifies harvest synced');
  result.clientB.afterHarvestHint = await hint(pageB);

  result.steps.push('chat collapse and unread count check');
  await pageA.click('#chat-toggle-btn');
  result.clientA.chatCollapsed = await pageA.evaluate(() => document.querySelector('#chat-panel')?.classList.contains('collapsed') === true);

  await pageB.fill('#chat-input', 'panel test msg');
  await pageB.click('#send-btn');
  await pageB.waitForTimeout(500);
  await pageA.waitForTimeout(700);

  result.clientA.chatToggleTextWhileCollapsed = await pageA.locator('#chat-toggle-btn').innerText();
  await pageA.click('#chat-toggle-btn');
  result.clientA.chatExpanded = await pageA.evaluate(() => document.querySelector('#chat-panel')?.classList.contains('collapsed') === false);
  result.clientA.chatHasMessage = await pageA.evaluate(() => {
    const items = Array.from(document.querySelectorAll('#chat-list .chat-item')).map((el) => el.textContent || '');
    return items.some((line) => line.includes('panel test msg'));
  });

  await pageA.screenshot({ path: `${outDir}/farm-care-a.png`, fullPage: true });
  await pageB.screenshot({ path: `${outDir}/farm-care-b.png`, fullPage: true });

  await contextA.close();
  await contextB.close();
} finally {
  await browser.close();
  result.endedAt = new Date().toISOString();
  fs.writeFileSync(`${outDir}/farm-care-e2e.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}
