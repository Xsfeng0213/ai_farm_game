import Phaser from 'phaser';
import type { FarmPlotSnapshot, FarmPlotState } from '../../types/protocol';
import { FARM_PLOT_DEFS, FARM_PLOT_INTERACT_RADIUS } from '../config/farmPlotConfig';

interface FarmPlotRuntime {
  id: FarmPlotSnapshot['id'];
  label: string;
  x: number;
  y: number;
  state: FarmPlotState;
  sprite: Phaser.GameObjects.Image;
  pulse: Phaser.Tweens.Tween | null;
}

export interface FarmPlotCandidate {
  plotId: FarmPlotSnapshot['id'];
  label: string;
  state: FarmPlotState;
  action: 'plant' | 'harvest' | null;
}

const TILE_FRAME_BY_STATE: Record<FarmPlotState, number> = {
  empty: 3,
  planted: 5,
  harvestable: 6
};

export class FarmPlotSystem {
  private readonly plots = new Map<FarmPlotSnapshot['id'], FarmPlotRuntime>();
  private highlightedId: FarmPlotSnapshot['id'] | null = null;

  constructor(private readonly scene: Phaser.Scene) {
    FARM_PLOT_DEFS.forEach((def) => {
      const sprite = scene.add
        .image(def.x, def.y, 'farm_tiles', TILE_FRAME_BY_STATE.empty)
        .setScale(1.45)
        .setDepth(def.y + 4);

      this.plots.set(def.id, {
        id: def.id,
        label: def.label,
        x: def.x,
        y: def.y,
        state: 'empty',
        sprite,
        pulse: null
      });
    });
  }

  applyFullState(plots: FarmPlotSnapshot[]): void {
    plots.forEach((plot) => {
      this.applyPlotState(plot.id, plot.state);
    });
  }

  applyPlotUpdate(plot: FarmPlotSnapshot): void {
    this.applyPlotState(plot.id, plot.state);
  }

  findCandidate(playerPosition: Phaser.Math.Vector2): FarmPlotCandidate | null {
    let nearestId: FarmPlotSnapshot['id'] | null = null;
    let nearestDistance = Number.MAX_VALUE;

    this.plots.forEach((plot, id) => {
      const distance = Phaser.Math.Distance.Between(playerPosition.x, playerPosition.y, plot.x, plot.y);
      if (distance > FARM_PLOT_INTERACT_RADIUS || distance >= nearestDistance) {
        return;
      }

      nearestId = id;
      nearestDistance = distance;
    });

    if (!nearestId) {
      this.setHighlight(null);
      return null;
    }

    const nearest = this.plots.get(nearestId);
    if (!nearest) {
      this.setHighlight(null);
      return null;
    }

    this.setHighlight(nearestId);

    let action: 'plant' | 'harvest' | null = null;
    if (nearest.state === 'empty') {
      action = 'plant';
    } else if (nearest.state === 'harvestable') {
      action = 'harvest';
    }

    return {
      plotId: nearest.id,
      label: nearest.label,
      state: nearest.state,
      action
    };
  }

  private applyPlotState(plotId: FarmPlotSnapshot['id'], state: FarmPlotState): void {
    const runtime = this.plots.get(plotId);
    if (!runtime) {
      return;
    }

    runtime.state = state;
    runtime.sprite.setFrame(TILE_FRAME_BY_STATE[state]);

    if (state === 'harvestable') {
      runtime.sprite.setTint(0xffe184);
      if (!runtime.pulse) {
        runtime.pulse = this.scene.tweens.add({
          targets: runtime.sprite,
          scaleX: runtime.sprite.scaleX + 0.15,
          scaleY: runtime.sprite.scaleY + 0.15,
          yoyo: true,
          repeat: -1,
          duration: 340,
          ease: 'Sine.InOut'
        });
      }
      return;
    }

    runtime.sprite.clearTint();
    runtime.pulse?.stop();
    runtime.pulse = null;
    runtime.sprite.setScale(1.45);
  }

  private setHighlight(plotId: FarmPlotSnapshot['id'] | null): void {
    if (this.highlightedId === plotId) {
      return;
    }

    if (this.highlightedId) {
      const prev = this.plots.get(this.highlightedId);
      prev?.sprite.setAlpha(1);
    }

    this.highlightedId = plotId;
    if (plotId) {
      const current = this.plots.get(plotId);
      current?.sprite.setAlpha(0.86);
    }
  }
}
