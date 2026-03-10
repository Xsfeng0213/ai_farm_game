import type { FacingDirection, PlayerSnapshot, PlayerState } from '../../types/protocol';
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
