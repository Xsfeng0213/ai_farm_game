import Phaser from 'phaser';

export interface FarmActionOption {
  id: string;
  label: string;
  disabled?: boolean;
}

export class FarmActionPanel {
  private readonly container: Phaser.GameObjects.Container;
  private readonly clickBounds = new Phaser.Geom.Rectangle();
  private visible = false;
  private rowWidth = 0;
  private rowBounds: Array<{ id: string; disabled: boolean; minY: number; maxY: number }> = [];
  private selectHandler: ((id: string) => void) | null = null;

  constructor(private readonly scene: Phaser.Scene) {
    this.container = scene.add.container(0, 0);
    this.container.setDepth(2400);
    this.container.setVisible(false);
    scene.input.on('pointerdown', this.onPointerDown, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.input.off('pointerdown', this.onPointerDown, this);
      this.hide();
    });
  }

  show(
    worldX: number,
    worldY: number,
    title: string,
    options: FarmActionOption[],
    onSelect: (id: string) => void
  ): void {
    this.clear();
    this.selectHandler = onSelect;

    const width = 156;
    const rowHeight = 24;
    const panelPadding = 8;
    const titleHeight = 16;
    const height = panelPadding * 2 + titleHeight + options.length * rowHeight + 4;

    const bg = this.scene.add.rectangle(0, 0, width, height, 0x1b2133, 0.95).setStrokeStyle(2, 0xe7c98c, 0.9);
    const titleText = this.scene.add
      .text(0, -height / 2 + panelPadding + titleHeight / 2, title, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#f5dfb8'
      })
      .setOrigin(0.5);

    const objects: Phaser.GameObjects.GameObject[] = [bg, titleText];

    this.rowWidth = width - panelPadding * 2;
    this.rowBounds = [];

    options.forEach((option, index) => {
      const y = -height / 2 + panelPadding + titleHeight + 6 + index * rowHeight + rowHeight / 2;
      const color = option.disabled ? 0x2a2f3e : 0x29324f;
      const border = option.disabled ? 0x54607c : 0xe1b66a;
      const textColor = option.disabled ? '#8f9bb8' : '#f8e4bc';

      const btn = this.scene.add.rectangle(0, y, width - panelPadding * 2, rowHeight - 4, color, 0.98);
      btn.setStrokeStyle(2, border, 0.95);

      const label = this.scene.add
        .text(0, y, option.label, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: textColor
        })
        .setOrigin(0.5);

      this.rowBounds.push({
        id: option.id,
        disabled: Boolean(option.disabled),
        minY: y - (rowHeight - 4) / 2,
        maxY: y + (rowHeight - 4) / 2
      });

      objects.push(btn, label);
    });

    this.container.add(objects);
    this.container.setPosition(worldX, worldY);
    this.container.setScale(0.92);
    this.container.setAlpha(0);
    this.container.setVisible(true);
    this.visible = true;
    this.refreshBounds(width, height);

    this.scene.tweens.add({
      targets: this.container,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 120,
      ease: 'Quad.Out'
    });
  }

  hide(): void {
    if (!this.visible) {
      return;
    }

    this.visible = false;
    this.scene.tweens.add({
      targets: this.container,
      alpha: 0,
      scaleX: 0.94,
      scaleY: 0.94,
      duration: 110,
      ease: 'Quad.In',
      onComplete: () => {
        this.clear();
        this.container.setVisible(false);
      }
    });
  }

  isVisible(): boolean {
    return this.visible;
  }

  containsWorldPoint(x: number, y: number): boolean {
    if (!this.visible) {
      return false;
    }

    return Phaser.Geom.Rectangle.Contains(this.clickBounds, x, y);
  }

  setPosition(worldX: number, worldY: number): void {
    if (!this.visible) {
      return;
    }

    this.container.setPosition(worldX, worldY);
    this.refreshBounds();
  }

  private refreshBounds(width = this.clickBounds.width, height = this.clickBounds.height): void {
    this.clickBounds.x = this.container.x - width / 2;
    this.clickBounds.y = this.container.y - height / 2;
    this.clickBounds.width = width;
    this.clickBounds.height = height;
  }

  private clear(): void {
    this.rowBounds = [];
    this.selectHandler = null;
    this.container.removeAll(true);
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.visible) {
      return;
    }

    const localX = pointer.worldX - this.container.x;
    const localY = pointer.worldY - this.container.y;
    const halfW = this.clickBounds.width / 2;
    const halfH = this.clickBounds.height / 2;

    if (localX < -halfW || localX > halfW || localY < -halfH || localY > halfH) {
      this.hide();
      return;
    }

    if (Math.abs(localX) > this.rowWidth / 2) {
      return;
    }

    const row = this.rowBounds.find((item) => localY >= item.minY && localY <= item.maxY);
    if (!row || row.disabled) {
      return;
    }

    this.selectHandler?.(row.id);
  }
}
