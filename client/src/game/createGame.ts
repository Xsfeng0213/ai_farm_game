import Phaser from 'phaser';
import { createBaseConfig } from './config/gameConfig';
import { NetworkClient } from './network/NetworkClient';
import { BootScene } from './scenes/BootScene';
import { FarmScene } from './scenes/FarmScene';
import { LobbyScene } from './scenes/LobbyScene';
import type { UiControls } from './types/game';

interface StartGameOptions {
  mount: HTMLElement;
  nickname: string;
  roomId: string;
  serverUrl: string;
  ui: UiControls;
}

export function startGame(options: StartGameOptions): Phaser.Game {
  const network = new NetworkClient(options.serverUrl);
  const config = createBaseConfig(options.mount);

  const sceneOptions = {
    network,
    ui: options.ui,
    nickname: options.nickname,
    roomId: options.roomId
  };

  config.scene = [new BootScene(), new LobbyScene(sceneOptions), new FarmScene(sceneOptions)];

  return new Phaser.Game(config);
}
