import Phaser from 'phaser';
import { FARM_CONFIG } from '../config/farmConfig';

const TILE = {
  grassA: 0,
  grassB: 1,
  soilA: 2,
  soilB: 3,
  path: 4,
  cropA: 5,
  cropB: 6,
  water: 7,
  fence: 8,
  hedge: 9
} as const;

function putTile(scene: Phaser.Scene, x: number, y: number, frame: number): void {
  scene.add
    .image(x * FARM_CONFIG.tileSize + FARM_CONFIG.tileSize / 2, y * FARM_CONFIG.tileSize + FARM_CONFIG.tileSize / 2, 'farm_tiles', frame)
    .setOrigin(0.5)
    .setDepth(0);
}

function isPathTile(x: number, y: number, cols: number): boolean {
  const center = Math.floor(cols / 2);
  const inGateLane = x >= center - 2 && x <= center + 2;
  if (inGateLane && y <= 30) {
    return true;
  }

  return y >= 28 && y <= 31 && x >= center - 20 && x <= center + 20;
}

function isWestField(x: number, y: number): boolean {
  return x >= 12 && x <= 36 && y >= 31 && y <= 48;
}

function isEastField(x: number, y: number): boolean {
  return x >= 43 && x <= 67 && y >= 31 && y <= 48;
}

function isPondTile(x: number, y: number): boolean {
  return x >= 70 && x <= 77 && y >= 13 && y <= 22;
}

function isFenceTile(x: number, y: number): boolean {
  const westFrame = (x === 11 || x === 37) && y >= 30 && y <= 49;
  const westTopBottom = (y === 30 || y === 49) && x >= 11 && x <= 37;

  const eastFrame = (x === 42 || x === 68) && y >= 30 && y <= 49;
  const eastTopBottom = (y === 30 || y === 49) && x >= 42 && x <= 68;

  return westFrame || westTopBottom || eastFrame || eastTopBottom;
}

export function buildFarmMap(scene: Phaser.Scene): void {
  const cols = Math.floor(FARM_CONFIG.mapWidth / FARM_CONFIG.tileSize);
  const rows = Math.floor(FARM_CONFIG.mapHeight / FARM_CONFIG.tileSize);

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const isEdge = x === 0 || y === 0 || x === cols - 1 || y === rows - 1;
      let frame: number = (x + y) % 3 === 0 ? TILE.grassB : TILE.grassA;

      if (isEdge) {
        frame = TILE.hedge;
      } else if (isPathTile(x, y, cols)) {
        frame = TILE.path;
      } else if (isWestField(x, y) || isEastField(x, y)) {
        const inColumnStripe = x % 3 === 0;
        frame = inColumnStripe ? TILE.soilA : TILE.soilB;

        if (y % 4 === 0) {
          frame = inColumnStripe ? TILE.cropA : TILE.cropB;
        }
      } else if (isPondTile(x, y)) {
        frame = TILE.water;
      }

      if (isFenceTile(x, y)) {
        frame = TILE.fence;
      }

      putTile(scene, x, y, frame);
    }
  }

  scene.add.rectangle(394, 748, 328, 174, 0x2b2218, 0.22).setDepth(2);
  scene.add.rectangle(874, 748, 328, 174, 0x2b2218, 0.22).setDepth(2);
  const grassClumps = [
    [248, 570],
    [290, 556],
    [532, 556],
    [574, 570],
    [248, 744],
    [290, 758],
    [532, 758],
    [574, 744],
    [728, 570],
    [770, 556],
    [1012, 556],
    [1054, 570],
    [728, 744],
    [770, 758],
    [1012, 758],
    [1054, 744]
  ] as const;

  grassClumps.forEach(([x, y], i) => {
    scene.add
      .image(x, y, 'farm_grass_clump')
      .setDepth(y + 6)
      .setScale(i % 2 === 0 ? 1 : 1.08)
      .setAlpha(0.9);
  });

  const treePositions = [
    [132, 180],
    [244, 164],
    [1060, 174],
    [1148, 202],
    [116, 610],
    [1148, 620],
    [142, 730],
    [1124, 728]
  ] as const;

  treePositions.forEach(([x, y]) => {
    scene.add.image(x, y, 'tree').setDepth(y + 18).setScale(0.95);
  });

  const rabbit = scene.add.image(618, 708, 'rabbit').setDepth(724).setScale(1.28);
  const cat = scene.add.image(668, 692, 'cat').setDepth(700).setScale(1.26);

  scene.tweens.add({
    targets: rabbit,
    x: rabbit.x + 18,
    yoyo: true,
    repeat: -1,
    duration: 1200,
    ease: 'Sine.InOut'
  });

  scene.tweens.add({
    targets: [rabbit, cat],
    y: '-=4',
    yoyo: true,
    repeat: -1,
    duration: 540,
    ease: 'Sine.InOut'
  });

  scene.tweens.add({
    targets: cat,
    x: cat.x - 14,
    yoyo: true,
    repeat: -1,
    duration: 1650,
    ease: 'Sine.InOut'
  });
}
