import type { InteractableDef } from '../types/game';

export const LOBBY_CONFIG = {
  mapWidth: 1280,
  mapHeight: 832,
  tileSize: 16,
  playerSpeed: 130,
  moveIntervalMs: 50,
  spawn: {
    x: 640,
    y: 560
  },
  worldBounds: {
    minX: 52,
    maxX: 1228,
    minY: 86,
    maxY: 770
  },
  doorPortal: {
    minX: 608,
    maxX: 672,
    triggerY: 794,
    extendedMaxY: 810
  }
} as const;

export const LOBBY_INTERACTABLES: InteractableDef[] = [
  {
    target: 'desk',
    x: 440,
    y: 350,
    width: 82,
    height: 52,
    label: 'Desk',
    spriteKey: 'desk',
    state: 'working',
    depth: 370
  },
  {
    target: 'coffee',
    x: 760,
    y: 332,
    width: 44,
    height: 50,
    label: 'Coffee Machine',
    spriteKey: 'coffee_machine',
    state: 'drinking',
    depth: 350
  },
  {
    target: 'sofa',
    x: 640,
    y: 636,
    width: 98,
    height: 58,
    label: 'Sofa',
    spriteKey: 'sofa',
    state: 'resting',
    depth: 660
  }
];
