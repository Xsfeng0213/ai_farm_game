import Phaser from 'phaser';
import { LOBBY_INTERACTABLES } from '../config/lobbyConfig';
import type { InteractionTarget, PlayerState } from '../../types/protocol';
import type { InteractableDef } from '../types/game';

interface InteractableRuntime {
  def: InteractableDef;
  zone: Phaser.GameObjects.Zone;
  sprite: Phaser.GameObjects.Image;
}

export interface InteractionCandidate {
  target: InteractionTarget;
  state: PlayerState;
  label: string;
}

export class InteractionSystem {
  private readonly items: InteractableRuntime[] = [];

  constructor(scene: Phaser.Scene) {
    LOBBY_INTERACTABLES.forEach((def) => {
      const sprite = scene.add.image(def.x, def.y, def.spriteKey).setDepth(def.depth ?? def.y + 20);

      const zone = scene.add.zone(def.x, def.y, def.width + 24, def.height + 24);
      this.items.push({ def, zone, sprite });
    });
  }

  findCandidate(playerPosition: Phaser.Math.Vector2): InteractionCandidate | null {
    let candidate: InteractionCandidate | null = null;

    this.items.forEach((item) => {
      const hit = item.zone.getBounds().contains(playerPosition.x, playerPosition.y);
      if (hit) {
        item.sprite.setTint(0xffec9d);
        candidate = {
          target: item.def.target,
          state: item.def.state,
          label: item.def.label
        };
      } else {
        item.sprite.clearTint();
      }
    });

    return candidate;
  }
}
