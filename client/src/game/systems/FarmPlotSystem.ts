import Phaser from 'phaser';
import type { CropType, FarmPlotSnapshot, FarmPlotState } from '../../types/protocol';
import { FARM_PLOT_DEFS, FARM_PLOT_INTERACT_RADIUS } from '../config/farmPlotConfig';

interface FarmPlotRuntime {
  id: FarmPlotSnapshot['id'];
  label: string;
  x: number;
  y: number;
  state: FarmPlotState;
  cropType?: CropType;
  bed: Phaser.GameObjects.Image;
  crop: Phaser.GameObjects.Image;
  outline: Phaser.GameObjects.Rectangle;
  bedPulse: Phaser.Tweens.Tween | null;
  cropSway: Phaser.Tweens.Tween | null;
}

export interface FarmPlotCandidate {
  plotId: FarmPlotSnapshot['id'];
  label: string;
  state: FarmPlotState;
  action: 'plant' | 'harvest' | null;
  cropType?: CropType;
}

const BED_TEXTURE_BY_STATE: Record<FarmPlotState, string> = {
  empty: 'farm_plot_empty',
  planted: 'farm_plot_planted',
  harvestable: 'farm_plot_harvestable'
};

const CROP_TEXTURE: Record<CropType, { planted: string; harvestable: string }> = {
  wheat: {
    planted: 'crop_wheat_planted',
    harvestable: 'crop_wheat_harvestable'
  },
  potato: {
    planted: 'crop_potato_planted',
    harvestable: 'crop_potato_harvestable'
  },
  carrot: {
    planted: 'crop_carrot_planted',
    harvestable: 'crop_carrot_harvestable'
  }
};

const PLOT_SCALE = 1.08;
const CROP_SCALE = 1.12;

export class FarmPlotSystem {
  private readonly plots = new Map<FarmPlotSnapshot['id'], FarmPlotRuntime>();
  private highlightedId: FarmPlotSnapshot['id'] | null = null;
  private readonly interactionArrow: Phaser.GameObjects.Image;

  constructor(private readonly scene: Phaser.Scene) {
    FARM_PLOT_DEFS.forEach((def) => {
      const bed = scene.add
        .image(def.x, def.y, BED_TEXTURE_BY_STATE.empty)
        .setScale(PLOT_SCALE)
        .setDepth(def.y + 3);

      const crop = scene.add
        .image(def.x, def.y - 6, 'crop_wheat_planted')
        .setScale(CROP_SCALE)
        .setDepth(def.y + 4)
        .setVisible(false);

      const outline = scene.add
        .rectangle(def.x, def.y, 72, 72, 0xffe39f, 0)
        .setStrokeStyle(3, 0xffd074, 0.95)
        .setDepth(def.y + 5)
        .setVisible(false);

      this.plots.set(def.id, {
        id: def.id,
        label: def.label,
        x: def.x,
        y: def.y,
        state: 'empty',
        bed,
        crop,
        outline,
        bedPulse: null,
        cropSway: null
      });
    });

    this.interactionArrow = scene.add
      .image(0, 0, 'farm_interact_arrow')
      .setDepth(2000)
      .setVisible(false)
      .setScale(1.5);
  }

  applyFullState(plots: FarmPlotSnapshot[]): void {
    plots.forEach((plot) => {
      this.applyPlotSnapshot(plot);
    });
  }

  applyPlotUpdate(plot: FarmPlotSnapshot): void {
    this.applyPlotSnapshot(plot);
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
      action,
      cropType: nearest.cropType
    };
  }

  getPlotPosition(plotId: FarmPlotSnapshot['id']): Phaser.Math.Vector2 | null {
    const runtime = this.plots.get(plotId);
    if (!runtime) {
      return null;
    }

    return new Phaser.Math.Vector2(runtime.x, runtime.y);
  }

  showFloatingText(plotId: FarmPlotSnapshot['id'], text: string, tint = '#ffe3aa'): void {
    const runtime = this.plots.get(plotId);
    if (!runtime) {
      return;
    }

    const popup = this.scene.add
      .text(runtime.x, runtime.y - 48, text, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: tint,
        stroke: '#20150f',
        strokeThickness: 3
      })
      .setOrigin(0.5)
      .setDepth(2100)
      .setScale(0.92);

    this.scene.tweens.add({
      targets: popup,
      y: popup.y - 24,
      alpha: 0,
      scale: 1,
      duration: 680,
      ease: 'Cubic.Out',
      onComplete: () => {
        popup.destroy();
      }
    });
  }

  private applyPlotSnapshot(snapshot: FarmPlotSnapshot): void {
    const runtime = this.plots.get(snapshot.id);
    if (!runtime) {
      return;
    }

    runtime.state = snapshot.state;
    runtime.cropType = snapshot.cropType;

    runtime.bed.setTexture(BED_TEXTURE_BY_STATE[snapshot.state]);

    this.stopPlotTweens(runtime);

    if (snapshot.state === 'empty' || !snapshot.cropType) {
      runtime.crop.setVisible(false);
      runtime.bed.clearTint();
      return;
    }

    const cropTexture =
      snapshot.state === 'harvestable'
        ? CROP_TEXTURE[snapshot.cropType].harvestable
        : CROP_TEXTURE[snapshot.cropType].planted;

    runtime.crop.setTexture(cropTexture).setVisible(true).setScale(CROP_SCALE);

    runtime.cropSway = this.scene.tweens.add({
      targets: runtime.crop,
      y: runtime.crop.y - 3,
      yoyo: true,
      repeat: -1,
      duration: snapshot.state === 'harvestable' ? 360 : 620,
      ease: 'Sine.InOut'
    });

    if (snapshot.state === 'harvestable') {
      runtime.bed.setTint(0xffd57a);
      runtime.bedPulse = this.scene.tweens.add({
        targets: runtime.bed,
        alpha: 0.68,
        yoyo: true,
        repeat: -1,
        duration: 300,
        ease: 'Sine.InOut'
      });
    } else {
      runtime.bed.clearTint();
      runtime.bed.setAlpha(1);
    }
  }

  private setHighlight(plotId: FarmPlotSnapshot['id'] | null): void {
    if (this.highlightedId === plotId) {
      return;
    }

    if (this.highlightedId) {
      const previous = this.plots.get(this.highlightedId);
      if (previous) {
        previous.outline.setVisible(false);
        previous.bed.setScale(PLOT_SCALE);
      }
    }

    this.highlightedId = plotId;
    if (!plotId) {
      this.interactionArrow.setVisible(false);
      return;
    }

    const current = this.plots.get(plotId);
    if (!current) {
      this.interactionArrow.setVisible(false);
      return;
    }

    current.outline.setVisible(true);
    current.bed.setScale(PLOT_SCALE + 0.04);

    this.interactionArrow
      .setVisible(true)
      .setPosition(current.x, current.y - 52)
      .setTint(0xffd983);

    this.scene.tweens.add({
      targets: this.interactionArrow,
      y: this.interactionArrow.y - 6,
      yoyo: true,
      repeat: 1,
      duration: 150,
      ease: 'Sine.Out'
    });
  }

  private stopPlotTweens(plot: FarmPlotRuntime): void {
    plot.bedPulse?.stop();
    plot.cropSway?.stop();
    plot.bedPulse = null;
    plot.cropSway = null;
    plot.bed.setAlpha(1);
    plot.crop.setY(plot.y - 6);
  }
}
