import type { FarmPlotSnapshot } from '../../types/protocol';

export interface FarmPlotDef {
  id: FarmPlotSnapshot['id'];
  x: number;
  y: number;
  label: string;
}

export const FARM_PLOT_DEFS: FarmPlotDef[] = [
  { id: 'w1', x: 298, y: 600, label: 'West A1' },
  { id: 'w2', x: 398, y: 600, label: 'West A2' },
  { id: 'w3', x: 498, y: 600, label: 'West A3' },
  { id: 'w4', x: 298, y: 700, label: 'West B1' },
  { id: 'w5', x: 398, y: 700, label: 'West B2' },
  { id: 'w6', x: 498, y: 700, label: 'West B3' },
  { id: 'e1', x: 778, y: 600, label: 'East A1' },
  { id: 'e2', x: 878, y: 600, label: 'East A2' },
  { id: 'e3', x: 978, y: 600, label: 'East A3' },
  { id: 'e4', x: 778, y: 700, label: 'East B1' },
  { id: 'e5', x: 878, y: 700, label: 'East B2' },
  { id: 'e6', x: 978, y: 700, label: 'East B3' }
];

export const FARM_PLOT_INTERACT_RADIUS = 78;
