export const FARM_CONFIG = {
  mapWidth: 1280,
  mapHeight: 832,
  tileSize: 16,
  playerSpeed: 126,
  moveIntervalMs: 50,
  spawn: {
    x: 640,
    y: 112
  },
  worldBounds: {
    minX: 56,
    maxX: 1224,
    minY: 72,
    maxY: 772
  },
  gateToLobby: {
    minX: 604,
    maxX: 676,
    triggerY: 88
  }
} as const;
