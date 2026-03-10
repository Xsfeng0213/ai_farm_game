import type { FarmPlotId } from './farmPlots';

export type RoomId = string;
export type PlayerId = string;

export type FacingDirection = 'up' | 'down' | 'left' | 'right';

export type PlayerState =
  | 'idle'
  | 'walking'
  | 'interacting'
  | 'working'
  | 'drinking'
  | 'resting';

export type InteractionTarget = 'desk' | 'coffee' | 'sofa';

export interface Vec2 {
  x: number;
  y: number;
}

export interface PlayerSnapshot {
  id: PlayerId;
  nickname: string;
  roomId: RoomId;
  position: Vec2;
  direction: FacingDirection;
  state: PlayerState;
  coins: number;
}

export interface JoinRoomPayload {
  roomId: RoomId;
  nickname: string;
}

export interface MovePayload {
  position: Vec2;
  direction: FacingDirection;
  state: PlayerState;
  clientTime: number;
}

export interface ChatPayload {
  message: string;
  emoji?: string;
}

export interface InteractPayload {
  target: InteractionTarget;
}

export interface RoomStatePayload {
  roomId: RoomId;
  selfId: PlayerId;
  players: PlayerSnapshot[];
}

export interface PlayerMovedPayload {
  id: PlayerId;
  position: Vec2;
  direction: FacingDirection;
  state: PlayerState;
  serverTime: number;
}

export interface ChatMessagePayload {
  id: string;
  playerId: PlayerId;
  nickname: string;
  message: string;
  emoji?: string;
  serverTime: number;
}

export interface InteractionStatePayload {
  playerId: PlayerId;
  target: InteractionTarget;
  state: PlayerState;
  coins: number;
  serverTime: number;
}

export type FarmPlotState = 'empty' | 'planted' | 'harvestable';

export interface FarmPlotSnapshot {
  id: FarmPlotId;
  state: FarmPlotState;
  plantedBy?: PlayerId;
  readyAt?: number;
  updatedAt: number;
}

export interface FarmStatePayload {
  roomId: RoomId;
  plots: FarmPlotSnapshot[];
}

export interface FarmInteractPayload {
  plotId: FarmPlotId;
}

export interface FarmPlotUpdatedPayload {
  roomId: RoomId;
  plot: FarmPlotSnapshot;
  action: 'planted' | 'grown' | 'harvested';
  actorId?: PlayerId;
  actorCoins?: number;
  serverTime: number;
}

export interface ServerToClientEvents {
  room_state: (payload: RoomStatePayload) => void;
  player_joined: (player: PlayerSnapshot) => void;
  player_left: (payload: { id: PlayerId }) => void;
  player_moved: (payload: PlayerMovedPayload) => void;
  chat_message: (payload: ChatMessagePayload) => void;
  interaction_state: (payload: InteractionStatePayload) => void;
  farm_state: (payload: FarmStatePayload) => void;
  farm_plot_updated: (payload: FarmPlotUpdatedPayload) => void;
}

export interface ClientToServerEvents {
  join_room: (payload: JoinRoomPayload) => void;
  move: (payload: MovePayload) => void;
  chat: (payload: ChatPayload) => void;
  interact: (payload: InteractPayload) => void;
  farm_interact: (payload: FarmInteractPayload) => void;
  ping: (payload: { clientTime: number }) => void;
}
