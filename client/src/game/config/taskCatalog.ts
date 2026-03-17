import type { CropType } from '../../types/protocol';

export type FarmTaskType = 'harvest' | 'deliver';

export interface FarmTaskDefinition {
  id: string;
  type: FarmTaskType;
  cropType: CropType;
  target: number;
  rewardCoins: number;
  title: string;
  description: string;
}

export const EMPTY_HARVEST_TOTALS: Record<CropType, number> = {
  wheat: 0,
  carrot: 0,
  potato: 0
};

export const FARM_TASKS: FarmTaskDefinition[] = [
  {
    id: 'harvest-wheat-6',
    type: 'harvest',
    cropType: 'wheat',
    target: 6,
    rewardCoins: 8,
    title: 'Harvest 6 Wheat',
    description: 'Keep the mill stocked with quick field runs.'
  },
  {
    id: 'deliver-carrot-2',
    type: 'deliver',
    cropType: 'carrot',
    target: 2,
    rewardCoins: 7,
    title: 'Deliver 2 Carrot',
    description: 'Fresh carrots for the market lunch stand.'
  },
  {
    id: 'deliver-potato-2',
    type: 'deliver',
    cropType: 'potato',
    target: 2,
    rewardCoins: 9,
    title: 'Deliver 2 Potato',
    description: 'Send a crate of potatoes to the storage shed.'
  }
];
