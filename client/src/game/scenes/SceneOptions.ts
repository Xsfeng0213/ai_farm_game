import { NetworkClient } from '../network/NetworkClient';
import type { UiControls } from '../types/game';

export interface SharedSceneOptions {
  network: NetworkClient;
  ui: UiControls;
  nickname: string;
  roomId: string;
}
