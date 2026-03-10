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

  return y >= 28 && y <= 31 && x >= center - 18 && x <= center + 18;
}

function isFarmlandTile(x: number, y: number): boolean {
  const westField = x >= 16 && x <= 34 && y >= 34 && y <= 47;
  const eastField = x >= 46 && x <= 64 && y >= 34 && y <= 47;
  return westField || eastField;
}

function isPondTile(x: number, y: number): boolean {
  return x >= 71 && x <= 77 && y >= 14 && y <= 22;
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
      } else if (isFarmlandTile(x, y)) {
        if (y % 2 === 0) {
          frame = (x + y) % 4 === 0 ? TILE.cropA : TILE.cropB;
        } else {
          frame = (x + y) % 2 === 0 ? TILE.soilA : TILE.soilB;
        }
      } else if (isPondTile(x, y)) {
        frame = TILE.water;
      }

      if ((x === 15 || x === 35 || x === 45 || x === 65) && y >= 33 && y <= 48) {
        frame = TILE.fence;
      }

      if ((y === 33 || y === 48) && ((x >= 15 && x <= 35) || (x >= 45 && x <= 65))) {
        frame = TILE.fence;
      }

      putTile(scene, x, y, frame);
    }
  }

  const treePositions = [
    [132, 188],
    [246, 160],
    [1046, 174],
    [1142, 202],
    [186, 618],
    [314, 688],
    [964, 676],
    [1128, 632]
  ] as const;

  treePositions.forEach(([x, y]) => {
    scene.add.image(x, y, 'tree').setDepth(y + 18).setScale(0.95);
  });

  const rabbit = scene.add.image(512, 618, 'rabbit').setDepth(624).setScale(1.28);
  const cat = scene.add.image(780, 596, 'cat').setDepth(604).setScale(1.26);

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
