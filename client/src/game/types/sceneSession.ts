import type { CropType, FacingDirection, PlayerSnapshot, PlayerState } from '../../types/protocol';
import type { PlayerSkin } from './playerSkin';

interface Position {
  x: number;
  y: number;
}

export interface LocalPlayerSession {
  id: string;
  nickname: string;
  position: Position;
  direction: FacingDirection;
  state: PlayerState;
  coins: number;
  skin: PlayerSkin;
  inventory?: Record<CropType, number>;
}

export interface SceneSessionData {
  roomId: string;
  selfId: string;
  local: LocalPlayerSession;
  remotes: PlayerSnapshot[];
}

export interface SceneStartPayload {
  session?: SceneSessionData;
}
