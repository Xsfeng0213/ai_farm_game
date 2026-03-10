export const FARM_PLOT_IDS = [
  'w1',
  'w2',
  'w3',
  'w4',
  'w5',
  'w6',
  'e1',
  'e2',
  'e3',
  'e4',
  'e5',
  'e6'
] as const;

export type FarmPlotId = (typeof FARM_PLOT_IDS)[number];

export const FARM_GROWTH_MS = 6500;
export const FARM_HARVEST_COINS = 2;
