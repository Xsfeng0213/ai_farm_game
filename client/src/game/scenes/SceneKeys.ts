export const SCENE_KEYS = {
  boot: 'BootScene',
  lobby: 'LobbyScene',
  farm: 'FarmScene'
} as const;

export type SceneKey = (typeof SCENE_KEYS)[keyof typeof SCENE_KEYS];
