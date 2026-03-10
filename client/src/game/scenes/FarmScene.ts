import Phaser from 'phaser';
import type {
  ChatMessagePayload,
  CropType,
  FacingDirection,
  FarmPlotUpdatedPayload,
  FarmStatePayload,
  InteractionStatePayload,
  MovePayload,
  PlayerSnapshot,
  RoomStatePayload
} from '../../types/protocol';
import { FARM_CONFIG } from '../config/farmConfig';
import { LocalPlayer } from '../entities/LocalPlayer';
import { RemotePlayer } from '../entities/RemotePlayer';
import { farmRoomId } from '../network/roomIds';
import { PlayerStateMachine } from '../state/PlayerStateMachine';
import { FarmPlotSystem } from '../systems/FarmPlotSystem';
import { InputSystem } from '../systems/InputSystem';
import type { PlayerSkin } from '../types/playerSkin';
import type { SceneSessionData, SceneStartPayload } from '../types/sceneSession';
import { buildFarmMap } from '../world/FarmMapBuilder';
import { SCENE_KEYS } from './SceneKeys';
import type { SharedSceneOptions } from './SceneOptions';

const FARM_ACTION_COOLDOWN_MS = 220;

export class FarmScene extends Phaser.Scene {
  private readonly network: SharedSceneOptions['network'];
  private readonly ui: SharedSceneOptions['ui'];
  private readonly nickname: SharedSceneOptions['nickname'];
  private readonly baseRoomId: SharedSceneOptions['roomId'];

  private readonly stateMachine = new PlayerStateMachine();

  private selfId = '';
  private activeRoomId = '';
  private localPlayer: LocalPlayer | null = null;
  private readonly remotePlayers = new Map<string, RemotePlayer>();
  private readonly remoteSnapshots = new Map<string, PlayerSnapshot>();

  private inputSystem: InputSystem | null = null;
  private farmPlotSystem: FarmPlotSystem | null = null;
  private interactKey: Phaser.Input.Keyboard.Key | null = null;

  private direction: FacingDirection = 'down';
  private state: MovePayload['state'] = 'idle';
  private coins = 0;
  private selectedSkin: PlayerSkin = 'skin1';
  private pendingTransition: SceneSessionData['local'] | null = null;

  private lastMoveSentAt = 0;
  private lastSentSignature = '';
  private isTransitioning = false;
  private lastFarmActionAt = 0;

  constructor(options: SharedSceneOptions) {
    super(SCENE_KEYS.farm);
    this.network = options.network;
    this.ui = options.ui;
    this.nickname = options.nickname;
    this.baseRoomId = options.roomId;
  }

  create(data?: SceneStartPayload): void {
    this.resetSceneState();

    if (data?.session?.local) {
      this.pendingTransition = data.session.local;
      this.selectedSkin = data.session.local.skin;
      this.direction = data.session.local.direction;
      this.state = data.session.local.state;
      this.coins = data.session.local.coins;
    }

    this.buildWorld();
    this.createLocalPlayerAtSpawn();
    this.inputSystem = new InputSystem(this);
    this.farmPlotSystem = new FarmPlotSystem(this);
    this.interactKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.E) ?? null;

    this.network.offAll();
    this.bindNetworkEvents();
    this.bindUiEvents();
    this.network.connect();
    this.network.joinRoom({
      roomId: this.networkRoomId(),
      nickname: this.nickname
    });

    this.ui.updateCoins(this.coins);
    this.ui.showHint('Farm ready. Press E near field to plant/harvest');
    this.ui.appendChat('[system] Entered farm map');
    this.syncRoomHud();
    this.cameras.main.fadeIn(240, 0, 0, 0);
  }

  update(_time: number, delta: number): void {
    const now = Date.now();

    const stepped = this.stateMachine.tick(now);
    if (stepped !== this.state) {
      this.state = stepped;
      this.localPlayer?.setVisualState(this.direction, this.state);
      this.sendMoveIfNeeded(true);
    }

    this.updateLocalMovement(delta, now);
    this.updateRemotePlayers(delta);
    this.updateFarmInteractionPrompt(now);
    this.checkLobbyGate();
  }

  private resetSceneState(): void {
    this.isTransitioning = false;
    this.selfId = '';
    this.activeRoomId = this.networkRoomId();
    this.lastMoveSentAt = 0;
    this.lastSentSignature = '';
    this.lastFarmActionAt = 0;
    this.direction = 'down';
    this.state = 'idle';
    this.inputSystem = null;
    this.farmPlotSystem = null;
    this.interactKey = null;

    this.localPlayer = null;
    this.remotePlayers.clear();
    this.remoteSnapshots.clear();
  }

  private networkRoomId(): string {
    return farmRoomId(this.baseRoomId);
  }

  private buildWorld(): void {
    this.cameras.main.setBounds(0, 0, FARM_CONFIG.mapWidth, FARM_CONFIG.mapHeight);
    this.physics.world.setBounds(0, 0, FARM_CONFIG.mapWidth, FARM_CONFIG.mapHeight);
    buildFarmMap(this);
  }

  private createLocalPlayerAtSpawn(): void {
    const spawn = this.pendingTransition?.position ?? FARM_CONFIG.spawn;
    this.localPlayer = new LocalPlayer(this, spawn.x, spawn.y, this.nickname);
    this.localPlayer.setSkin(this.selectedSkin);
    this.state = this.stateMachine.reset(this.pendingTransition?.state ?? 'idle', Date.now());
    this.direction = this.pendingTransition?.direction ?? 'down';
    this.localPlayer.setVisualState(this.direction, this.state);
    this.cameras.main.startFollow(this.localPlayer, true, 0.12, 0.12);
  }

  private bindNetworkEvents(): void {
    this.network.onRoomState((payload: RoomStatePayload) => {
      this.handleRoomState(payload);
    });

    this.network.onPlayerJoined((player: PlayerSnapshot) => {
      if (player.id === this.selfId) {
        return;
      }

      this.createOrSyncRemote(player);
      this.remoteSnapshots.set(player.id, { ...player });
      this.syncRoomHud();
      this.ui.appendChat(`[system] ${player.nickname} joined`);
    });

    this.network.onPlayerLeft(({ id }: { id: string }) => {
      const remote = this.remotePlayers.get(id);
      if (remote) {
        remote.destroy();
        this.remotePlayers.delete(id);
      }

      this.remoteSnapshots.delete(id);
      this.syncRoomHud();
    });

    this.network.onPlayerMoved((payload) => {
      if (payload.id === this.selfId) {
        return;
      }

      const remote = this.remotePlayers.get(payload.id);
      remote?.syncMove(payload);

      const current = this.remoteSnapshots.get(payload.id);
      if (current) {
        this.remoteSnapshots.set(payload.id, {
          ...current,
          position: payload.position,
          direction: payload.direction,
          state: payload.state
        });
      }
    });

    this.network.onChatMessage((payload: ChatMessagePayload) => {
      this.handleChatMessage(payload);
    });

    this.network.onInteractionState((payload: InteractionStatePayload) => {
      if (payload.playerId === this.selfId) {
        this.coins = payload.coins;
        this.ui.updateCoins(this.coins);
        this.state = this.stateMachine.syncFromServer(payload.state, Date.now());
        this.localPlayer?.setVisualState(this.direction, this.state);
      } else {
        const remote = this.remotePlayers.get(payload.playerId);
        if (remote) {
          remote.setVisualState(remote.getDirection(), payload.state);
        }
      }
    });

    this.network.onFarmState((payload: FarmStatePayload) => {
      if (payload.roomId !== this.activeRoomId) {
        return;
      }

      this.farmPlotSystem?.applyFullState(payload.plots);
    });

    this.network.onFarmPlotUpdated((payload: FarmPlotUpdatedPayload) => {
      if (payload.roomId !== this.activeRoomId) {
        return;
      }

      this.farmPlotSystem?.applyPlotUpdate(payload.plot);
      const cropLabel = payload.plot.cropType ? this.cropLabel(payload.plot.cropType) : 'Crop';

      if (payload.actorId === this.selfId && typeof payload.actorCoins === 'number') {
        this.coins = payload.actorCoins;
        this.ui.updateCoins(this.coins);
      }

      if (payload.action === 'planted') {
        this.farmPlotSystem?.showFloatingText(payload.plot.id, `${cropLabel} planted`, '#a8f3a0');
      } else if (payload.action === 'grown') {
        this.farmPlotSystem?.showFloatingText(payload.plot.id, `${cropLabel} ready`, '#ffe48f');
      } else if (payload.action === 'harvested') {
        this.farmPlotSystem?.showFloatingText(payload.plot.id, '+2 coins', '#ffe58b');
      }
    });
  }

  private bindUiEvents(): void {
    this.ui.onSend((message) => {
      this.network.sendChat({ message });
    });

    this.ui.onEmoji((emoji) => {
      this.network.sendChat({ message: '', emoji });
    });

    this.ui.onSkinChange((skin) => {
      this.selectedSkin = skin;
      this.localPlayer?.setSkin(skin);
      this.ui.showHint(`Skin switched: ${skin}`);
    });
  }

  private handleRoomState(payload: RoomStatePayload): void {
    this.selfId = payload.selfId;
    this.activeRoomId = payload.roomId;

    const existingIds = new Set<string>();

    payload.players.forEach((player) => {
      existingIds.add(player.id);
      if (player.id === payload.selfId) {
        this.createOrSyncLocal(player);
      } else {
        this.createOrSyncRemote(player);
        this.remoteSnapshots.set(player.id, { ...player });
      }
    });

    this.remotePlayers.forEach((player, id) => {
      if (!existingIds.has(id)) {
        player.destroy();
        this.remotePlayers.delete(id);
      }
    });

    this.remoteSnapshots.forEach((_player, id) => {
      if (!existingIds.has(id)) {
        this.remoteSnapshots.delete(id);
      }
    });

    if (this.pendingTransition && this.localPlayer) {
      this.localPlayer.setSkin(this.pendingTransition.skin);
      this.localPlayer.setPosition(this.pendingTransition.position.x, this.pendingTransition.position.y);
      this.direction = this.pendingTransition.direction;
      this.state = this.stateMachine.reset(this.pendingTransition.state, Date.now());
      this.localPlayer.setVisualState(this.direction, this.state);
      this.sendMoveIfNeeded(true);
      this.pendingTransition = null;
    }

    this.syncRoomHud();
  }

  private createOrSyncLocal(player: PlayerSnapshot): void {
    if (!this.localPlayer) {
      this.localPlayer = new LocalPlayer(this, player.position.x, player.position.y, player.nickname);
      this.cameras.main.startFollow(this.localPlayer, true, 0.12, 0.12);
    } else {
      this.localPlayer.setPosition(player.position.x, player.position.y);
      this.localPlayer.setNickname(player.nickname);
    }

    this.localPlayer.setSkin(this.selectedSkin);
    this.direction = player.direction;
    this.state = this.stateMachine.reset(player.state, Date.now());
    this.coins = player.coins;
    this.localPlayer.setVisualState(this.direction, this.state);
    this.ui.updateCoins(this.coins);
  }

  private createOrSyncRemote(player: PlayerSnapshot): void {
    const existing = this.remotePlayers.get(player.id);
    if (existing) {
      existing.syncFromSnapshot(player);
      return;
    }

    this.remotePlayers.set(player.id, new RemotePlayer(this, player));
  }

  private updateLocalMovement(delta: number, now: number): void {
    if (!this.localPlayer || !this.inputSystem || this.isTransitioning) {
      return;
    }

    const input = this.inputSystem.read(FARM_CONFIG.playerSpeed, this.direction);
    const locked = this.stateMachine.isMovementLocked(now);
    const velocityX = locked ? 0 : input.velocityX;
    const velocityY = locked ? 0 : input.velocityY;

    this.direction = input.direction;
    this.state = this.stateMachine.setMovement(!locked && input.state === 'walking', now);
    this.localPlayer.applyMovement(
      velocityX,
      velocityY,
      delta,
      FARM_CONFIG.worldBounds,
      this.direction,
      this.state
    );

    this.sendMoveIfNeeded();
  }

  private updateRemotePlayers(delta: number): void {
    this.remotePlayers.forEach((player) => {
      player.tick(delta);
    });
  }

  private updateFarmInteractionPrompt(now: number): void {
    if (!this.localPlayer || !this.farmPlotSystem || this.isTransitioning) {
      return;
    }

    const candidate = this.farmPlotSystem.findCandidate(new Phaser.Math.Vector2(this.localPlayer.x, this.localPlayer.y));
    if (!candidate) {
      this.ui.showHint('Farm ready. Press E near field to plant/harvest');
      return;
    }

    if (candidate.action === 'plant') {
      this.ui.showHint(`Press E to plant on ${candidate.label}`);
    } else if (candidate.action === 'harvest') {
      this.ui.showHint(`Press E to harvest ${this.cropLabel(candidate.cropType)} at ${candidate.label}`);
    } else {
      this.ui.showHint(`${this.cropLabel(candidate.cropType)} is growing at ${candidate.label}`);
    }

    if (
      candidate.action &&
      this.interactKey &&
      Phaser.Input.Keyboard.JustDown(this.interactKey) &&
      now - this.lastFarmActionAt > FARM_ACTION_COOLDOWN_MS
    ) {
      this.lastFarmActionAt = now;
      this.network.sendFarmInteract({ plotId: candidate.plotId });
      this.state = 'interacting';
      this.localPlayer.setVisualState(this.direction, this.state);
      this.sendMoveIfNeeded(true);
    }
  }

  private checkLobbyGate(): void {
    if (!this.localPlayer || this.isTransitioning) {
      return;
    }

    const withinGateX =
      this.localPlayer.x >= FARM_CONFIG.gateToLobby.minX && this.localPlayer.x <= FARM_CONFIG.gateToLobby.maxX;
    const crossedGate = this.localPlayer.y <= FARM_CONFIG.gateToLobby.triggerY;

    if (withinGateX && crossedGate) {
      this.transitionBackToLobby();
    }
  }

  private transitionBackToLobby(): void {
    if (this.isTransitioning) {
      return;
    }

    this.isTransitioning = true;
    this.ui.showHint('Returning to lobby...');
    this.state = this.stateMachine.reset('idle', Date.now());
    this.localPlayer?.setVisualState(this.direction, this.state);

    this.cameras.main.fadeOut(360, 8, 10, 16);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(SCENE_KEYS.lobby, {
        session: this.buildSessionData({ x: 640, y: 742 })
      });
    });
  }

  private handleChatMessage(payload: ChatMessagePayload): void {
    const message = payload.message ? payload.message : '';
    const emoji = payload.emoji ? ` ${payload.emoji}` : '';
    const bubbleText = `${message}${emoji}`.trim();

    this.ui.appendChat(`${payload.nickname}: ${message}${emoji}`.trim());

    if (!bubbleText) {
      return;
    }

    if (payload.playerId === this.selfId) {
      this.localPlayer?.showChatBubble(bubbleText);
      return;
    }

    this.remotePlayers.get(payload.playerId)?.showChatBubble(bubbleText);
  }

  private sendMoveIfNeeded(force = false): void {
    if (!this.localPlayer) {
      return;
    }

    const now = Date.now();
    if (!force && now - this.lastMoveSentAt < FARM_CONFIG.moveIntervalMs) {
      return;
    }

    const payload: MovePayload = {
      position: {
        x: this.localPlayer.x,
        y: this.localPlayer.y
      },
      direction: this.direction,
      state: this.state,
      clientTime: now
    };

    const signature = `${payload.position.x.toFixed(1)}|${payload.position.y.toFixed(1)}|${payload.direction}|${payload.state}`;
    if (!force && signature === this.lastSentSignature) {
      return;
    }

    this.network.sendMove(payload);
    this.lastMoveSentAt = now;
    this.lastSentSignature = signature;
  }

  private syncRoomHud(): void {
    const online = this.localPlayer ? this.remotePlayers.size + 1 : this.remotePlayers.size;
    this.ui.updateRoom(this.activeRoomId, online);
  }

  private buildSessionData(nextPosition: { x: number; y: number }): SceneSessionData {
    return {
      roomId: this.baseRoomId,
      selfId: this.selfId,
      local: {
        id: this.selfId,
        nickname: this.nickname,
        position: nextPosition,
        direction: 'down',
        state: 'idle',
        coins: this.coins,
        skin: this.selectedSkin
      },
      remotes: []
    };
  }

  private cropLabel(cropType: CropType | undefined): string {
    if (!cropType) {
      return 'Crop';
    }

    if (cropType === 'wheat') {
      return 'Wheat';
    }

    if (cropType === 'potato') {
      return 'Potato';
    }

    return 'Carrot';
  }
}
