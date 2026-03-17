import { chromium } from 'playwright';
import fs from 'node:fs';

const baseUrl = 'http://localhost:5173';
const outDir = '.logs';
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const PLOTS = {
  w1: 'West A1',
  w2: 'West A2',
  w3: 'West A3',
  w4: 'West B1'
};

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
  await page.waitForFunction(
    (id) => {
      const scene = window.__AI_FARM_GAME__?.scene?.keys?.FarmScene;
      const panel = scene?.actionPanel;
      return Boolean(scene && panel && panel.visible && panel.rowBounds?.some((item) => item.id === id && !item.disabled));
    },
    optionId,
    { timeout: 3000 }
  );

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
  await page.waitForTimeout(400);
}

async function probeCropMenu(page, plotId, label) {
  return await page.evaluate(({ id, name }) => {
    const scene = window.__AI_FARM_GAME__?.scene?.keys?.FarmScene;
    scene?.openPlantMenu?.(id, name);
    const panel = scene?.actionPanel;
    const rows = panel?.rowBounds?.map((item) => item.id) ?? [];
    panel?.hide?.();
    return rows;
  }, { id: plotId, name: label });
}

async function chooseCrop(page, plotId, _label, crop) {
  await page.evaluate(({ id, cropType }) => {
    const scene = window.__AI_FARM_GAME__?.scene?.keys?.FarmScene;
    scene?.network?.sendFarmInteract?.({ plotId: id, action: 'plant', cropType });
  }, { id: plotId, cropType: crop });
  await page.waitForTimeout(450);
}

async function chooseCare(page, plotId, action) {
  await page.evaluate(({ id, careAction }) => {
    const scene = window.__AI_FARM_GAME__?.scene?.keys?.FarmScene;
    scene?.network?.sendFarmInteract?.({ plotId: id, action: careAction });
  }, { id: plotId, careAction: action });
  await page.waitForTimeout(400);
}

async function sendHarvest(page, plotId) {
  await page.evaluate((id) => {
    const scene = window.__AI_FARM_GAME__?.scene?.keys?.FarmScene;
    scene?.network?.sendFarmInteract?.({ plotId: id, action: 'harvest' });
  }, plotId);
  await page.waitForTimeout(650);
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
  await page.waitForTimeout(220);
}

async function readTooltip(page) {
  const taskButton = page.locator('#inventory-task-btn');
  return {
    title: await page.locator('#inventory-tooltip-title').innerText(),
    qty: await page.locator('#inventory-tooltip-count').innerText(),
    desc: await page.locator('#inventory-tooltip-desc').innerText(),
    sell: await page.locator('#inventory-sell-btn').innerText(),
    sellAll: await page.locator('#inventory-sell-all-btn').innerText(),
    taskVisible: !(await taskButton.evaluate((el) => el.classList.contains('is-hidden'))),
    taskLabel: await taskButton.innerText(),
    taskDisabled: await taskButton.evaluate((el) => el.disabled)
  };
}

function taskLocator(page, title) {
  return page.locator('.task-card').filter({ hasText: title }).first();
}

async function readTask(page, title) {
  const card = taskLocator(page, title);
  return {
    title: await card.locator('.task-card-title').innerText(),
    progress: await card.locator('.task-card-progress').innerText(),
    reward: await card.locator('.task-card-reward').innerText(),
    status: await card.locator('.task-card-status').innerText(),
    actionLabel: (await card.locator('.task-action-btn').count()) > 0 ? await card.locator('.task-action-btn').innerText() : null
  };
}

async function clickTaskAction(page, title) {
  const card = taskLocator(page, title);
  await card.locator('.task-action-btn').click();
  await page.waitForTimeout(350);
}

async function countFilledSlot(page, label) {
  return await page.locator(`.bag-slot.filled .bag-slot-icon[alt="${label}"]`).count();
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

  result.steps.push('check task board is visible');
  result.clientA.initialTasks = {
    wheat: await readTask(pageA, 'Harvest 6 Wheat'),
    carrot: await readTask(pageA, 'Deliver 2 Carrot'),
    potato: await readTask(pageA, 'Deliver 2 Potato')
  };

  result.steps.push('probe crop menu ui and plant four plots');
  result.clientA.cropMenuProbe = await probeCropMenu(pageA, 'w1', PLOTS.w1);
  await chooseCrop(pageA, 'w1', PLOTS.w1, 'wheat');
  await chooseCrop(pageA, 'w2', PLOTS.w2, 'carrot');
  await chooseCrop(pageA, 'w3', PLOTS.w3, 'potato');
  await chooseCrop(pageA, 'w4', PLOTS.w4, 'wheat');
  result.clientA.postPlantHint = await hint(pageA);

  result.steps.push('A waters and fertilizes all four plots');
  await chooseCare(pageA, 'w1', 'water');
  await chooseCare(pageA, 'w1', 'fertilize');
  await chooseCare(pageA, 'w2', 'water');
  await chooseCare(pageA, 'w2', 'fertilize');
  await chooseCare(pageA, 'w3', 'water');
  await chooseCare(pageA, 'w3', 'fertilize');
  await chooseCare(pageA, 'w4', 'water');
  await chooseCare(pageA, 'w4', 'fertilize');

  result.steps.push('B sees synced growing state');
  result.clientB.growingHint = await hint(pageB);

  result.steps.push('wait for maturity and harvest');
  await sleep(15500);
  await sendHarvest(pageA, 'w1');
  await sendHarvest(pageA, 'w2');
  await sendHarvest(pageA, 'w3');
  await sendHarvest(pageA, 'w4');
  result.clientA.afterHarvestCoins = await pageA.locator('#coins-label').innerText();

  result.steps.push('open bag and verify deliver and sell flows');
  await openBag(pageA);
  const bagSlotCount = await pageA.locator('.bag-slot').count();

  await clickBagSlotByAlt(pageA, 'Carrot');
  const carrotTooltip = await readTooltip(pageA);
  await pageA.click('#inventory-task-btn');
  await pageA.waitForTimeout(350);
  const carrotTaskAfterDeliver = await readTask(pageA, 'Deliver 2 Carrot');
  const carrotSlotsAfterDeliver = await countFilledSlot(pageA, 'Carrot');
  const coinsAfterDeliver = await pageA.locator('#coins-label').innerText();

  await clickBagSlotByAlt(pageA, 'Potato');
  const potatoTooltipBeforeSell = await readTooltip(pageA);
  await pageA.click('#inventory-sell-btn');
  await pageA.waitForTimeout(350);
  await clickBagSlotByAlt(pageA, 'Potato');
  const potatoTooltipAfterSell = await readTooltip(pageA);
  const potatoTaskAfterSell = await readTask(pageA, 'Deliver 2 Potato');
  const coinsAfterSell = await pageA.locator('#coins-label').innerText();

  result.steps.push('claim wheat harvest task from task board');
  await clickTaskAction(pageA, 'Harvest 6 Wheat');
  const wheatTaskAfterClaim = await readTask(pageA, 'Harvest 6 Wheat');
  const coinsAfterClaim = await pageA.locator('#coins-label').innerText();
  await clickBagSlotByAlt(pageA, 'Wheat');
  const wheatTooltip = await readTooltip(pageA);
  await closeBag(pageA);

  result.clientA.goalLoop = {
    bagSlotCount,
    carrotTooltip,
    carrotTaskAfterDeliver,
    carrotSlotsAfterDeliver,
    coinsAfterDeliver,
    potatoTooltipBeforeSell,
    potatoTooltipAfterSell,
    potatoTaskAfterSell,
    coinsAfterSell,
    wheatTaskAfterClaim,
    coinsAfterClaim,
    wheatTooltip
  };

  result.steps.push('B confirms empty plot sync after A harvest');
  result.clientB.afterHarvestHint = await hint(pageB);

  result.steps.push('chat collapse and unread still work');
  await pageA.click('#chat-toggle-btn');
  result.clientA.chatCollapsed = await pageA.evaluate(() => document.querySelector('#chat-panel')?.classList.contains('collapsed') === true);
  await pageB.fill('#chat-input', 'goal loop ok');
  await pageB.click('#send-btn');
  await pageA.waitForTimeout(800);
  result.clientA.chatToggleTextWhileCollapsed = await pageA.locator('#chat-toggle-btn').innerText();
  await pageA.click('#chat-toggle-btn');
  result.clientA.chatExpanded = await pageA.evaluate(() => document.querySelector('#chat-panel')?.classList.contains('collapsed') === false);

  await pageA.screenshot({ path: `${outDir}/farm-goals-a.png`, fullPage: true });
  await pageB.screenshot({ path: `${outDir}/farm-goals-b.png`, fullPage: true });

  await contextA.close();
  await contextB.close();
} finally {
  await browser.close();
  result.endedAt = new Date().toISOString();
  fs.writeFileSync(`${outDir}/farm-goals-e2e.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}
