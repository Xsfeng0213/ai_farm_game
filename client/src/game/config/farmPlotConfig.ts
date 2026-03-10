import type { FarmPlotSnapshot } from '../../types/protocol';

export interface FarmPlotDef {
  id: FarmPlotSnapshot['id'];
  x: number;
  y: number;
  label: string;
}

export const FARM_PLOT_DEFS: FarmPlotDef[] = [
  { id: 'w1', x: 328, y: 648, label: 'West Plot 1' },
  { id: 'w2', x: 408, y: 648, label: 'West Plot 2' },
  { id: 'w3', x: 488, y: 648, label: 'West Plot 3' },
  { id: 'e1', x: 808, y: 648, label: 'East Plot 1' },
  { id: 'e2', x: 888, y: 648, label: 'East Plot 2' },
  { id: 'e3', x: 968, y: 648, label: 'East Plot 3' }
];

export const FARM_PLOT_INTERACT_RADIUS = 28;
