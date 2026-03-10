import Phaser from 'phaser';
import type { FacingDirection, PlayerState } from '../../types/protocol';
import type { PlayerSkin } from '../types/playerSkin';

const PLAYER_SCALE = 1.35;
const CHAT_BUBBLE_MS = 2600;

const NICKNAME_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'monospace',
  fontSize: '12px',
  color: '#f8f0d8',
  stroke: '#241c1a',
  strokeThickness: 3
};

const SKIN_TEXTURES: Record<PlayerSkin, string> = {
  skin1: 'player_skin_1',
  skin2: 'player_skin_2',
  skin3: 'player_skin_3'
};

function animKey(texture: string, direction: FacingDirection, state: PlayerState): string {
  const mode = state === 'walking' ? 'walk' : 'idle';
  return `${texture}-${direction}-${mode}`;
}

export class PlayerAvatar extends Phaser.GameObjects.Container {
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly nicknameLabel: Phaser.GameObjects.Text;

  private currentSkin: PlayerSkin;
  private lastDirection: FacingDirection = 'down';
  private lastState: PlayerState = 'idle';
  private chatBubble: Phaser.GameObjects.Container | null = null;
  private chatBubbleText: Phaser.GameObjects.Text | null = null;
  private bubbleHideTimer: Phaser.Time.TimerEvent | null = null;
  private bubbleTween: Phaser.Tweens.Tween | null = null;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    nickname: string,
    nicknameColor = '#f8f0d8',
    initialSkin: PlayerSkin = 'skin1'
  ) {
    super(scene, x, y);

    this.currentSkin = initialSkin;
    PlayerAvatar.ensureAnimations(scene);

    this.sprite = scene.add.sprite(0, 0, SKIN_TEXTURES[initialSkin], 0).setOrigin(0.5, 0.8).setScale(PLAYER_SCALE);
    this.nicknameLabel = scene.add.text(0, -36, nickname, {
      ...NICKNAME_STYLE,
      color: nicknameColor
    }).setOrigin(0.5);

    this.add([this.sprite, this.nicknameLabel]);
    this.setSize(16 * PLAYER_SCALE, 24 * PLAYER_SCALE);

    scene.add.existing(this);
    this.setVisualState('down', 'idle');
    this.syncRenderDepth();
  }

  setNickname(name: string): void {
    this.nicknameLabel.setText(name);
  }

  getNickname(): string {
    return this.nicknameLabel.text;
  }

  setSkin(skin: PlayerSkin): void {
    if (skin === this.currentSkin) {
      return;
    }

    this.currentSkin = skin;
    this.sprite.setTexture(SKIN_TEXTURES[skin], 0);
    this.setVisualState(this.lastDirection, this.lastState);
  }

  setVisualState(direction: FacingDirection, state: PlayerState): void {
    this.lastDirection = direction;
    this.lastState = state;

    const texture = SKIN_TEXTURES[this.currentSkin];
    const key = animKey(texture, direction, state);
    if (this.sprite.anims.currentAnim?.key !== key) {
      this.sprite.play(key, true);
    }

    if (state === 'working' || state === 'drinking' || state === 'resting' || state === 'interacting') {
      this.sprite.setTint(0xffe6a6);
    } else {
      this.sprite.clearTint();
    }

    this.syncRenderDepth();
  }

  getDirection(): FacingDirection {
    return this.lastDirection;
  }

  getState(): PlayerState {
    return this.lastState;
  }

  showChatBubble(content: string): void {
    const text = content.trim();
    if (!text) {
      return;
    }

    const bubbleText = text.length > 42 ? `${text.slice(0, 41)}...` : text;
    const ui = this.ensureChatBubble();
    ui.text.setText(bubbleText);
    ui.text.setWordWrapWidth(148, true);

    const bubbleWidth = Math.max(56, ui.text.width + 16);
    const bubbleHeight = Math.max(24, ui.text.height + 10);

    const background = ui.container.getByName('bubble-bg') as Phaser.GameObjects.Rectangle;
    const border = ui.container.getByName('bubble-border') as Phaser.GameObjects.Rectangle;
    const tail = ui.container.getByName('bubble-tail') as Phaser.GameObjects.Rectangle;

    background.setSize(bubbleWidth, bubbleHeight);
    border.setSize(bubbleWidth + 2, bubbleHeight + 2);
    tail.setPosition(0, bubbleHeight * 0.5 + 3);

    ui.container.setPosition(0, -62);
    ui.container.setAlpha(0);
    ui.container.setScale(0.92);
    ui.container.setVisible(true);

    this.bubbleTween?.stop();
    this.bubbleTween = this.scene.tweens.add({
      targets: ui.container,
      alpha: 1,
      scale: 1,
      y: -66,
      duration: 120,
      ease: 'Quad.Out'
    });

    this.bubbleHideTimer?.remove(false);
    this.bubbleHideTimer = this.scene.time.delayedCall(CHAT_BUBBLE_MS, () => {
      this.hideChatBubble();
    });
  }

  syncRenderDepth(): void {
    this.setDepth(Math.floor(this.y));
  }

  override destroy(fromScene?: boolean): void {
    this.bubbleHideTimer?.remove(false);
    this.bubbleTween?.stop();
    super.destroy(fromScene);
  }

  private hideChatBubble(): void {
    if (!this.chatBubble) {
      return;
    }

    this.bubbleTween?.stop();
    this.bubbleTween = this.scene.tweens.add({
      targets: this.chatBubble,
      alpha: 0,
      y: this.chatBubble.y - 8,
      duration: 220,
      ease: 'Cubic.In',
      onComplete: () => {
        if (this.chatBubble) {
          this.chatBubble.setVisible(false);
        }
      }
    });
  }

  private ensureChatBubble(): {
    container: Phaser.GameObjects.Container;
    text: Phaser.GameObjects.Text;
  } {
    if (this.chatBubble && this.chatBubbleText) {
      return {
        container: this.chatBubble,
        text: this.chatBubbleText
      };
    }

    const border = this.scene.add
      .rectangle(0, 0, 60, 28, 0x3a2b1c, 1)
      .setOrigin(0.5)
      .setName('bubble-border');
    const background = this.scene.add
      .rectangle(0, 0, 58, 26, 0x1a2234, 0.98)
      .setOrigin(0.5)
      .setName('bubble-bg');
    const bubbleText = this.scene.add
      .text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#f5ebc8',
        align: 'center'
      })
      .setOrigin(0.5);
    const tail = this.scene.add
      .rectangle(0, 16, 8, 4, 0x1a2234, 0.98)
      .setOrigin(0.5, 0)
      .setName('bubble-tail');

    this.chatBubble = this.scene.add.container(0, -62, [border, background, bubbleText, tail]);
    this.chatBubble.setVisible(false);
    this.chatBubbleText = bubbleText;
    this.add(this.chatBubble);

    return {
      container: this.chatBubble,
      text: bubbleText
    };
  }

  private static ensureAnimations(scene: Phaser.Scene): void {
    if (scene.anims.exists('player_skin_1-down-idle')) {
      return;
    }

    const textures = Object.values(SKIN_TEXTURES);
    const directions: FacingDirection[] = ['down', 'left', 'right', 'up'];

    textures.forEach((texture) => {
      directions.forEach((direction, i) => {
        const baseFrame = i * 2;

        scene.anims.create({
          key: `${texture}-${direction}-idle`,
          frames: [{ key: texture, frame: baseFrame }],
          frameRate: 1,
          repeat: -1
        });

        scene.anims.create({
          key: `${texture}-${direction}-walk`,
          frames: scene.anims.generateFrameNumbers(texture, { frames: [baseFrame, baseFrame + 1] }),
          frameRate: 5,
          repeat: -1
        });
      });
    });
  }
}
