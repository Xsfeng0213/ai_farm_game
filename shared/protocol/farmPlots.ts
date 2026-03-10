export const FARM_PLOT_IDS = ['w1', 'w2', 'w3', 'e1', 'e2', 'e3'] as const;

export type FarmPlotId = (typeof FARM_PLOT_IDS)[number];

export const FARM_GROWTH_MS = 6500;
export const FARM_HARVEST_COINS = 2;
