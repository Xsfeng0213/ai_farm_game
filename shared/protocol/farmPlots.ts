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

export const FARM_CROP_GROWTH_MS = {
  wheat: 16000,
  carrot: 22000,
  potato: 28000
} as const;

export const FARM_WATER_REDUCE_RATIO = 0.28;
export const FARM_FERTILIZE_REDUCE_RATIO = 0.46;
export const FARM_HARVEST_COINS = 2;
