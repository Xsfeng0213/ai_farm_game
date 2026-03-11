import type { CropType } from '../../types/protocol';

export interface CropCatalogItem {
  label: string;
  description: string;
  icon: string;
}

export const CROP_CATALOG: Record<CropType, CropCatalogItem> = {
  wheat: {
    label: 'Wheat',
    description: 'Fast growth. Good for quick, steady harvest loops.',
    icon: '/assets/farm/crop_wheat_harvestable.svg'
  },
  carrot: {
    label: 'Carrot',
    description: 'Balanced growth and reward. A reliable mid-cycle crop.',
    icon: '/assets/farm/crop_carrot_harvestable.svg'
  },
  potato: {
    label: 'Potato',
    description: 'Slowest growth, but highest coin reward per harvest.',
    icon: '/assets/farm/crop_potato_harvestable.svg'
  }
};

export const EMPTY_CROP_INVENTORY: Record<CropType, number> = {
  wheat: 0,
  carrot: 0,
  potato: 0
};
