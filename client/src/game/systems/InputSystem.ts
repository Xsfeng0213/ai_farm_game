import Phaser from 'phaser';
import type { FacingDirection, PlayerState } from '../../types/protocol';

export interface MovementInput {
  velocityX: number;
  velocityY: number;
  direction: FacingDirection;
  state: PlayerState;
}

export class InputSystem {
  private readonly cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private readonly wasd: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };

  constructor(scene: Phaser.Scene) {
    const keyboard = scene.input.keyboard;
    if (!keyboard) {
      throw new Error('Keyboard input is unavailable');
    }

    this.cursors = keyboard.createCursorKeys();
    this.wasd = {
      up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D)
    };
  }

  read(speed: number, fallbackDirection: FacingDirection): MovementInput {
    const left = this.cursors.left.isDown || this.wasd.left.isDown;
    const right = this.cursors.right.isDown || this.wasd.right.isDown;
    const up = this.cursors.up.isDown || this.wasd.up.isDown;
    const down = this.cursors.down.isDown || this.wasd.down.isDown;

    let velocityX = 0;
    let velocityY = 0;
    let direction = fallbackDirection;

    if (left) {
      velocityX = -speed;
      direction = 'left';
    }
    if (right) {
      velocityX = speed;
      direction = 'right';
    }
    if (up) {
      velocityY = -speed;
      direction = 'up';
    }
    if (down) {
      velocityY = speed;
      direction = 'down';
    }

    if (velocityX !== 0 && velocityY !== 0) {
      const diagonalScale = Math.SQRT1_2;
      velocityX *= diagonalScale;
      velocityY *= diagonalScale;
    }

    const state: PlayerState = velocityX === 0 && velocityY === 0 ? 'idle' : 'walking';

    return {
      velocityX,
      velocityY,
      direction,
      state
    };
  }
}
