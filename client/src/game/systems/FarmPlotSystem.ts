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
  watered: boolean;
  fertilized: boolean;
  bed: Phaser.GameObjects.Image;
  crop: Phaser.GameObjects.Image;
  outline: Phaser.GameObjects.Rectangle;
  waterBadge: Phaser.GameObjects.Container;
  fertilizeBadge: Phaser.GameObjects.Container;
  bedPulse: Phaser.Tweens.Tween | null;
  cropSway: Phaser.Tweens.Tween | null;
}

export interface FarmPlotCandidate {
  plotId: FarmPlotSnapshot['id'];
  label: string;
  state: FarmPlotState;
  action: 'plant_menu' | 'care_menu' | 'harvest' | null;
  cropType?: CropType;
  watered: boolean;
  fertilized: boolean;
  canWater: boolean;
  canFertilize: boolean;
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

      const waterBadge = this.createBadge(def.x - 22, def.y - 30, 'W', 0x2d5b8f);
      const fertilizeBadge = this.createBadge(def.x + 22, def.y - 30, 'F', 0x6f5134);

      this.plots.set(def.id, {
        id: def.id,
        label: def.label,
        x: def.x,
        y: def.y,
        state: 'empty',
        watered: false,
        fertilized: false,
        bed,
        crop,
        outline,
        waterBadge,
        fertilizeBadge,
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

    const canWater = nearest.state === 'planted' && !nearest.watered;
    const canFertilize = nearest.state === 'planted' && !nearest.fertilized;

    let action: FarmPlotCandidate['action'] = null;
    if (nearest.state === 'empty') {
      action = 'plant_menu';
    } else if (nearest.state === 'harvestable') {
      action = 'harvest';
    } else if (canWater || canFertilize) {
      action = 'care_menu';
    }

    return {
      plotId: nearest.id,
      label: nearest.label,
      state: nearest.state,
      action,
      cropType: nearest.cropType,
      watered: nearest.watered,
      fertilized: nearest.fertilized,
      canWater,
      canFertilize
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

  pulsePlot(plotId: FarmPlotSnapshot['id'], strokeColor = 0xffd074): void {
    const plot = this.plots.get(plotId);
    if (!plot) {
      return;
    }

    plot.outline.setStrokeStyle(3, strokeColor, 1).setVisible(true).setAlpha(1);
    this.scene.tweens.add({
      targets: plot.outline,
      alpha: 0,
      duration: 220,
      ease: 'Quad.Out',
      onComplete: () => {
        if (this.highlightedId !== plot.id) {
          plot.outline.setVisible(false).setAlpha(1);
          return;
        }

        plot.outline.setVisible(true).setAlpha(1);
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
    runtime.watered = Boolean(snapshot.watered);
    runtime.fertilized = Boolean(snapshot.fertilized);

    runtime.bed.setTexture(BED_TEXTURE_BY_STATE[snapshot.state]);

    this.stopPlotTweens(runtime);

    const showCareBadges = snapshot.state !== 'empty';
    runtime.waterBadge.setVisible(showCareBadges && runtime.watered);
    runtime.fertilizeBadge.setVisible(showCareBadges && runtime.fertilized);

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
    } else if (runtime.fertilized) {
      runtime.bed.setTint(0xb98d55);
      runtime.bed.setAlpha(1);
    } else if (runtime.watered) {
      runtime.bed.setTint(0x7ca8c7);
      runtime.bed.setAlpha(1);
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

  private createBadge(x: number, y: number, label: string, color: number): Phaser.GameObjects.Container {
    const box = this.scene.add.rectangle(0, 0, 14, 12, color, 0.94).setStrokeStyle(1, 0xf0d8a8, 0.9);
    const text = this.scene.add
      .text(0, 0, label, {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#f8f0d8'
      })
      .setOrigin(0.5);

    return this.scene.add.container(x, y, [box, text]).setDepth(y + 10).setVisible(false);
  }
}
