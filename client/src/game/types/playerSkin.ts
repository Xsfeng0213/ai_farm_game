export const PLAYER_SKINS = ['skin1', 'skin2', 'skin3'] as const;

export type PlayerSkin = (typeof PLAYER_SKINS)[number];
