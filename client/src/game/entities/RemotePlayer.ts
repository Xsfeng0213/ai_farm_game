import Phaser from 'phaser';
import type { PlayerMovedPayload, PlayerSnapshot } from '../../types/protocol';
import { PlayerAvatar } from './PlayerAvatar';

export class RemotePlayer extends PlayerAvatar {
  private target = new Phaser.Math.Vector2();

  constructor(scene: Phaser.Scene, player: PlayerSnapshot) {
    super(scene, player.position.x, player.position.y, player.nickname, '#b8dcff', 'skin2');
    this.target.set(player.position.x, player.position.y);
    this.setVisualState(player.direction, player.state);
  }

  syncFromSnapshot(player: PlayerSnapshot): void {
    this.target.set(player.position.x, player.position.y);
    this.setNickname(player.nickname);
    this.setVisualState(player.direction, player.state);
  }

  syncMove(payload: PlayerMovedPayload): void {
    this.target.set(payload.position.x, payload.position.y);
    this.setVisualState(payload.direction, payload.state);
  }

  tick(delta: number): void {
    const t = Math.min(1, delta / 100);
    this.x = Phaser.Math.Linear(this.x, this.target.x, t);
    this.y = Phaser.Math.Linear(this.y, this.target.y, t);
    this.syncRenderDepth();
  }
}
