import { chromium } from 'playwright';
import fs from 'node:fs';

const baseUrl = 'http://localhost:5177';
const outDir = '.logs';
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

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

async function getText(page, selector) {
  return await page.locator(selector).innerText();
}

async function login(page, nickname) {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.fill('#nickname-input', nickname);
  await page.click('#join-btn');
  await page.waitForFunction(() => document.querySelector('#login-overlay')?.classList.contains('hidden') === true, { timeout: 10000 });
  await page.waitForTimeout(1200);
}

async function moveToFarm(page) {
  await hold(page, 's', 5000);
  await page.waitForTimeout(900);
  await page.waitForFunction(() => {
    const el = document.querySelector('#room-label');
    return !!el && el.textContent && el.textContent.includes(':farm');
  }, { timeout: 15000 });
}

async function moveToWestPlots(page) {
  await hold(page, 'ArrowDown', 4100);
  await hold(page, 'ArrowLeft', 2050);
  await page.waitForTimeout(500);
}

async function readHint(page) {
  return await getText(page, '#hint-label');
}

async function plantAtCurrent(page) {
  const before = await readHint(page);
  await page.keyboard.press('e');
  await page.waitForTimeout(520);
  const after = await readHint(page);
  return { before, after };
}

async function moveAndReadHint(page, key, ms) {
  await hold(page, key, ms);
  await page.waitForTimeout(380);
  return await readHint(page);
}

const browser = await chromium.launch({ headless: true });
try {
  const contextA = await browser.newContext({ viewport: { width: 1480, height: 900 } });
  const contextB = await browser.newContext({ viewport: { width: 1480, height: 900 } });

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  const attachErrorListeners = (page, tag) => {
    page.on('pageerror', (error) => {
      result.errors.push({ client: tag, type: 'pageerror', message: String(error) });
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        result.errors.push({ client: tag, type: 'console', message: msg.text() });
      }
    });
  };

  attachErrorListeners(pageA, 'A');
  attachErrorListeners(pageB, 'B');

  result.steps.push('login both clients');
  await login(pageA, 'Alpha');
  await login(pageB, 'Beta');

  result.clientA.roomAfterLogin = await getText(pageA, '#room-label');
  result.clientB.roomAfterLogin = await getText(pageB, '#room-label');

  result.steps.push('move both to farm');
  await moveToFarm(pageA);
  await moveToFarm(pageB);
  await pageA.waitForTimeout(1200);

  result.clientA.roomInFarm = await getText(pageA, '#room-label');
  result.clientB.roomInFarm = await getText(pageB, '#room-label');

  await pageA.screenshot({ path: `${outDir}/farm-rework-initial-a.png`, fullPage: true });
  await pageB.screenshot({ path: `${outDir}/farm-rework-initial-b.png`, fullPage: true });

  result.steps.push('client A plants 3 adjacent plots');
  await moveToWestPlots(pageA);
  result.clientA.prePlantHint = await readHint(pageA);

  const p1 = await plantAtCurrent(pageA); // w2 potato
  await hold(pageA, 'ArrowRight', 780);
  const p2 = await plantAtCurrent(pageA); // w3 carrot
  await hold(pageA, 'ArrowLeft', 1580);
  const p3 = await plantAtCurrent(pageA); // w1 wheat

  result.clientA.plantHints = [p1, p2, p3];

  await pageA.screenshot({ path: `${outDir}/farm-rework-planted-a.png`, fullPage: true });

  result.steps.push('client B verifies synced growing hints');
  await moveToWestPlots(pageB);
  const bHint1 = await readHint(pageB);
  const bHint2 = await moveAndReadHint(pageB, 'ArrowRight', 780);
  const bHint3 = await moveAndReadHint(pageB, 'ArrowLeft', 1580);
  result.clientB.syncedGrowingHints = [bHint1, bHint2, bHint3];

  await pageB.screenshot({ path: `${outDir}/farm-rework-planted-b.png`, fullPage: true });

  result.steps.push('wait for growth to harvestable');
  await sleep(7200);

  const h1 = await readHint(pageA);
  await hold(pageA, 'ArrowRight', 780);
  const h2 = await readHint(pageA);
  await hold(pageA, 'ArrowLeft', 780);
  const h3 = await readHint(pageA);
  result.clientA.harvestHints = [h1, h2, h3];

  await pageA.screenshot({ path: `${outDir}/farm-rework-harvestable-a.png`, fullPage: true });
  await pageB.screenshot({ path: `${outDir}/farm-rework-harvestable-b.png`, fullPage: true });

  result.steps.push('client A harvests 3 plots');
  await pageA.keyboard.press('e');
  await pageA.waitForTimeout(500);
  await hold(pageA, 'ArrowRight', 780);
  await pageA.keyboard.press('e');
  await pageA.waitForTimeout(500);
  await hold(pageA, 'ArrowRight', 780);
  await pageA.keyboard.press('e');
  await pageA.waitForTimeout(600);

  result.clientA.coinsAfterHarvest = await getText(pageA, '#coins-label');

  result.steps.push('client B verifies harvested sync');
  const bAfterHarvestHint = await readHint(pageB);
  result.clientB.hintAfterAHarvest = bAfterHarvestHint;

  await pageA.screenshot({ path: `${outDir}/farm-rework-after-harvest-a.png`, fullPage: true });
  await pageB.screenshot({ path: `${outDir}/farm-rework-after-harvest-b.png`, fullPage: true });

  await contextA.close();
  await contextB.close();
} finally {
  await browser.close();
  result.endedAt = new Date().toISOString();
  fs.writeFileSync(`${outDir}/farm-rework-e2e.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

