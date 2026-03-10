import type { InteractionTarget, PlayerState } from '../../types/protocol';
import type { PlayerSkin } from './playerSkin';

export interface InteractableDef {
  target: InteractionTarget;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  spriteKey: string;
  state: PlayerState;
  depth?: number;
}

export interface UiBridge {
  updateRoom: (roomId: string, onlineCount: number) => void;
  updateCoins: (coins: number) => void;
  appendChat: (message: string) => void;
  showHint: (message: string) => void;
}

export interface UiControls extends UiBridge {
  onSend: (handler: (message: string) => void) => void;
  onEmoji: (handler: (emoji: string) => void) => void;
  onSkinChange: (handler: (skin: PlayerSkin) => void) => void;
}
