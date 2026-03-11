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

async function moveToWestA2(page) {
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
  await page.waitForTimeout(650);
  return await hint(page);
}

async function selectCare(page, action) {
  await page.keyboard.press('e');
  await page.waitForTimeout(180);
  await clickPanelOptionById(page, action);
  await page.waitForTimeout(700);
  return await hint(page);
}

async function openBag(page) {
  await page.click('#inventory-toggle-btn');
  await page.waitForTimeout(250);
}

async function closeBag(page) {
  await page.click('#inventory-toggle-btn');
  await page.waitForTimeout(250);
}

async function clickBagSlotByAlt(page, alt) {
  const point = await page.evaluate((label) => {
    const icon = Array.from(document.querySelectorAll('.bag-slot.filled .bag-slot-icon')).find(
      (img) => img.getAttribute('alt') === label
    );
    if (!icon) {
      return null;
    }

    const rect = icon.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  }, alt);

  if (!point) {
    throw new Error(`bag slot ${alt} not found`);
  }

  await page.mouse.click(point.x, point.y);
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

  result.steps.push('login and enter farm');
  await login(pageA, 'Alpha');
  await login(pageB, 'Beta');
  await moveToFarm(pageA);
  await moveToFarm(pageB);

  result.clientA.room = await pageA.locator('#room-label').innerText();
  result.clientB.room = await pageB.locator('#room-label').innerText();

  result.steps.push('move both clients near west plots');
  await moveToWestA2(pageA);
  await moveToWestA2(pageB);

  result.steps.push('A selects crops and plants carrot/potato/wheat');
  const plantCarrot = await selectCrop(pageA, 'carrot');
  await hold(pageA, 'ArrowRight', 780);
  const plantPotato = await selectCrop(pageA, 'potato');
  await hold(pageA, 'ArrowLeft', 1580);
  const plantWheat = await selectCrop(pageA, 'wheat');
  result.clientA.plantHints = { plantCarrot, plantPotato, plantWheat };

  result.steps.push('A waters and fertilizes wheat and potato');
  const wheatWater = await selectCare(pageA, 'water');
  const wheatFertilize = await selectCare(pageA, 'fertilize');
  await hold(pageA, 'ArrowRight', 1580);
  const potatoWater = await selectCare(pageA, 'water');
  const potatoFertilize = await selectCare(pageA, 'fertilize');
  result.clientA.careHints = { wheatWater, wheatFertilize, potatoWater, potatoFertilize };

  result.steps.push('B checks synced crop status');
  const bCarrotHint = await hint(pageB);
  await hold(pageB, 'ArrowRight', 780);
  const bPotatoHint = await hint(pageB);
  await hold(pageB, 'ArrowLeft', 1580);
  const bWheatHint = await hint(pageB);
  result.clientB.syncedHints = { bCarrotHint, bPotatoHint, bWheatHint };

  result.steps.push('wait then harvest wheat first');
  await sleep(9200);
  const wheatReadyHint = await hint(pageA);
  await hold(pageA, 'ArrowLeft', 1580);
  await pageA.keyboard.press('e');
  await pageA.waitForTimeout(700);
  const coinsAfterWheat = await pageA.locator('#coins-label').innerText();
  result.steps.push('open bag and check 8x6 grid');
  await openBag(pageA);
  const bagSlotCount = await pageA.locator('.bag-slot').count();
  const wheatFilledSlots = await pageA.locator('.bag-slot.filled .bag-slot-icon[alt="Wheat"]').count();
  await clickBagSlotByAlt(pageA, 'Wheat');
  const wheatTooltip = {
    title: await pageA.locator('#inventory-tooltip-title').innerText(),
    qty: await pageA.locator('#inventory-tooltip-count').innerText()
  };

  result.steps.push('wait more then harvest potato');
  await sleep(3500);
  await hold(pageA, 'ArrowRight', 1580);
  const potatoReadyHint = await hint(pageA);
  await pageA.keyboard.press('e');
  await pageA.waitForTimeout(700);
  const coinsAfterPotato = await pageA.locator('#coins-label').innerText();
  await clickBagSlotByAlt(pageA, 'Potato');
  const potatoTooltip = {
    title: await pageA.locator('#inventory-tooltip-title').innerText(),
    qty: await pageA.locator('#inventory-tooltip-count').innerText(),
    desc: await pageA.locator('#inventory-tooltip-desc').innerText()
  };
  await clickBagSlotByAlt(pageA, 'Potato');
  await pageA.waitForTimeout(220);
  const tooltipClosedAfterSecondClick = await pageA
    .locator('#inventory-tooltip')
    .evaluate((el) => el.classList.contains('is-hidden'));

  await hold(pageA, 'ArrowLeft', 780);
  const carrotStillGrowingHint = await hint(pageA);

  result.clientA.harvestChecks = {
    wheatReadyHint,
    coinsAfterWheat,
    bagSlotCount,
    wheatFilledSlots,
    wheatTooltip,
    potatoReadyHint,
    coinsAfterPotato,
      potatoTooltip,
      tooltipClosedAfterSecondClick,
      carrotStillGrowingHint
  };

  await closeBag(pageA);
  result.clientA.bagClosed = await pageA.locator('#inventory-panel').evaluate((el) => el.classList.contains('is-hidden'));

  result.steps.push('B confirms harvested sync');
  await hold(pageB, 'ArrowRight', 780);
  result.clientB.afterHarvestHint = await hint(pageB);

  result.steps.push('chat collapse and unread');
  await pageA.click('#chat-toggle-btn');
  result.clientA.chatCollapsed = await pageA.evaluate(() => document.querySelector('#chat-panel')?.classList.contains('collapsed') === true);
  await pageB.fill('#chat-input', 'farm stage ok');
  await pageB.click('#send-btn');
  await pageA.waitForTimeout(800);
  result.clientA.chatToggleTextWhileCollapsed = await pageA.locator('#chat-toggle-btn').innerText();
  await pageA.click('#chat-toggle-btn');
  result.clientA.chatExpanded = await pageA.evaluate(() => document.querySelector('#chat-panel')?.classList.contains('collapsed') === false);

  await pageA.screenshot({ path: `${outDir}/farm-full-a.png`, fullPage: true });
  await pageB.screenshot({ path: `${outDir}/farm-full-b.png`, fullPage: true });

  await contextA.close();
  await contextB.close();
} finally {
  await browser.close();
  result.endedAt = new Date().toISOString();
  fs.writeFileSync(`${outDir}/farm-full-e2e.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}
