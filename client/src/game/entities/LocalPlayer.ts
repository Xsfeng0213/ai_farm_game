import Phaser from 'phaser';
import type { FacingDirection, PlayerState } from '../../types/protocol';
import { PlayerAvatar } from './PlayerAvatar';

export class LocalPlayer extends PlayerAvatar {
  constructor(scene: Phaser.Scene, x: number, y: number, nickname: string) {
    super(scene, x, y, nickname, '#ffe7a8', 'skin1');
  }

  applyMovement(
    velocityX: number,
    velocityY: number,
    deltaMs: number,
    bounds: { minX: number; maxX: number; minY: number; maxY: number },
    direction: FacingDirection,
    state: PlayerState
  ): void {
    const dt = deltaMs / 1000;
    const nextX = Phaser.Math.Clamp(this.x + velocityX * dt, bounds.minX, bounds.maxX);
    const nextY = Phaser.Math.Clamp(this.y + velocityY * dt, bounds.minY, bounds.maxY);

    this.setPosition(nextX, nextY);
    this.setVisualState(direction, state);
  }
}
