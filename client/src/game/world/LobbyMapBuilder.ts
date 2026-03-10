import Phaser from 'phaser';
import { LOBBY_CONFIG } from '../config/lobbyConfig';

const TILE = {
  floorA: 0,
  floorB: 1,
  wall: 2,
  shadowWall: 3,
  carpet: 4,
  carpetBorder: 5,
  window: 6,
  trim: 7,
  floorDark: 8,
  door: 9
} as const;

function putTile(scene: Phaser.Scene, x: number, y: number, frame: number): void {
  scene.add
    .image(x * LOBBY_CONFIG.tileSize + LOBBY_CONFIG.tileSize / 2, y * LOBBY_CONFIG.tileSize + LOBBY_CONFIG.tileSize / 2, 'lobby_tiles', frame)
    .setOrigin(0.5)
    .setDepth(0);
}

export function buildLobbyMap(scene: Phaser.Scene): void {
  const cols = Math.floor(LOBBY_CONFIG.mapWidth / LOBBY_CONFIG.tileSize);
  const rows = Math.floor(LOBBY_CONFIG.mapHeight / LOBBY_CONFIG.tileSize);

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      let frame: number = (x + y) % 3 === 0 ? TILE.floorB : TILE.floorA;

      const isBorder = x === 0 || y === 0 || x === cols - 1 || y === rows - 1;
      if (isBorder) {
        frame = TILE.shadowWall;
      } else if (x <= 2 || y <= 3 || x >= cols - 3 || y >= rows - 3) {
        frame = TILE.wall;
      } else if (y > rows - 8 && (x % 4 === 0 || x % 4 === 1)) {
        frame = TILE.floorDark;
      }

      const carpetLeft = 20;
      const carpetRight = cols - 21;
      const carpetTop = 14;
      const carpetBottom = rows - 15;
      const inCarpet = x >= carpetLeft && x <= carpetRight && y >= carpetTop && y <= carpetBottom;

      if (inCarpet) {
        const isCarpetEdge = x === carpetLeft || x === carpetRight || y === carpetTop || y === carpetBottom;
        frame = isCarpetEdge ? TILE.carpetBorder : TILE.carpet;
      }

      if (y === 6 && (x === 23 || x === 24 || x === cols - 25 || x === cols - 24)) {
        frame = TILE.window;
      }

      if (y === 10 && x >= 32 && x <= cols - 33) {
        frame = TILE.trim;
      }

      if (y >= rows - 3 && x >= Math.floor(cols / 2) - 2 && x <= Math.floor(cols / 2) + 2) {
        frame = TILE.door;
      }

      putTile(scene, x, y, frame);
    }
  }

  scene.add.image(170, 138, 'bookshelf').setDepth(146);
  scene.add.image(LOBBY_CONFIG.mapWidth - 170, 138, 'bookshelf').setDepth(146);

  scene.add.image(220, 680, 'plant').setDepth(710);
  scene.add.image(LOBBY_CONFIG.mapWidth - 220, 680, 'plant').setDepth(710);
  scene.add.image(360, 660, 'plant').setDepth(690);
  scene.add.image(LOBBY_CONFIG.mapWidth - 360, 660, 'plant').setDepth(690);
}
