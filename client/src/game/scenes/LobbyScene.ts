import Phaser from 'phaser';
import type {
  ChatMessagePayload,
  FacingDirection,
  InteractionStatePayload,
  MovePayload,
  PlayerSnapshot,
  RoomStatePayload
} from '../../types/protocol';
import { LOBBY_CONFIG } from '../config/lobbyConfig';
import { LocalPlayer } from '../entities/LocalPlayer';
import { RemotePlayer } from '../entities/RemotePlayer';
import { lobbyRoomId } from '../network/roomIds';
import { PlayerStateMachine, type ActivityState } from '../state/PlayerStateMachine';
import { InputSystem } from '../systems/InputSystem';
import { InteractionSystem } from '../systems/InteractionSystem';
import type { PlayerSkin } from '../types/playerSkin';
import type { SceneSessionData, SceneStartPayload } from '../types/sceneSession';
import { buildLobbyMap } from '../world/LobbyMapBuilder';
import { SCENE_KEYS } from './SceneKeys';
import type { SharedSceneOptions } from './SceneOptions';

export class LobbyScene extends Phaser.Scene {
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
  private interactionSystem: InteractionSystem | null = null;
  private interactKey: Phaser.Input.Keyboard.Key | null = null;

  private direction: FacingDirection = 'down';
  private state: MovePayload['state'] = 'idle';
  private coins = 0;
  private selectedSkin: PlayerSkin = 'skin1';
  private pendingTransition: SceneSessionData['local'] | null = null;

  private lastMoveSentAt = 0;
  private lastSentSignature = '';
  private isTransitioning = false;

  constructor(options: SharedSceneOptions) {
    super(SCENE_KEYS.lobby);
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
    this.interactionSystem = new InteractionSystem(this);
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
    this.ui.showHint('Use WASD / Arrow keys to move');
    this.ui.appendChat('[system] Lobby connected');
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
    this.updateInteractionPrompt(now);
    this.checkFarmPortal();
  }

  private resetSceneState(): void {
    this.isTransitioning = false;
    this.selfId = '';
    this.activeRoomId = this.networkRoomId();
    this.lastMoveSentAt = 0;
    this.lastSentSignature = '';
    this.direction = 'down';
    this.state = 'idle';
    this.inputSystem = null;
    this.interactionSystem = null;
    this.interactKey = null;

    this.localPlayer = null;
    this.remotePlayers.clear();
    this.remoteSnapshots.clear();
  }

  private networkRoomId(): string {
    return lobbyRoomId(this.baseRoomId);
  }

  private buildWorld(): void {
    this.cameras.main.setBounds(0, 0, LOBBY_CONFIG.mapWidth, LOBBY_CONFIG.mapHeight);
    this.physics.world.setBounds(0, 0, LOBBY_CONFIG.mapWidth, LOBBY_CONFIG.mapHeight);
    buildLobbyMap(this);
  }

  private createLocalPlayerAtSpawn(): void {
    const spawn = this.pendingTransition?.position ?? LOBBY_CONFIG.spawn;
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
      this.handleInteractionState(payload);
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

    const input = this.inputSystem.read(LOBBY_CONFIG.playerSpeed, this.direction);
    const locked = this.stateMachine.isMovementLocked(now);
    const velocityX = locked ? 0 : input.velocityX;
    const velocityY = locked ? 0 : input.velocityY;

    this.direction = input.direction;
    this.state = this.stateMachine.setMovement(!locked && input.state === 'walking', now);

    const dt = delta / 1000;
    const nextX = this.localPlayer.x + velocityX * dt;
    const inDoorLane = nextX >= LOBBY_CONFIG.doorPortal.minX && nextX <= LOBBY_CONFIG.doorPortal.maxX;

    const bounds = inDoorLane
      ? {
          ...LOBBY_CONFIG.worldBounds,
          maxY: LOBBY_CONFIG.doorPortal.extendedMaxY
        }
      : LOBBY_CONFIG.worldBounds;

    this.localPlayer.applyMovement(velocityX, velocityY, delta, bounds, this.direction, this.state);

    this.sendMoveIfNeeded();
  }

  private updateRemotePlayers(delta: number): void {
    this.remotePlayers.forEach((player) => {
      player.tick(delta);
    });
  }

  private updateInteractionPrompt(now: number): void {
    if (!this.localPlayer || !this.interactionSystem || this.isTransitioning) {
      return;
    }

    const candidate = this.interactionSystem.findCandidate(new Phaser.Math.Vector2(this.localPlayer.x, this.localPlayer.y));
    if (!candidate) {
      this.ui.showHint('Use WASD / Arrow keys to move');
      return;
    }

    this.ui.showHint(`Press E to interact with ${candidate.label}`);

    if (this.interactKey && Phaser.Input.Keyboard.JustDown(this.interactKey)) {
      this.state = this.stateMachine.beginInteraction(candidate.state as ActivityState, now);
      this.localPlayer.setVisualState(this.direction, this.state);
      this.network.sendInteract({ target: candidate.target });
      this.sendMoveIfNeeded(true);
    }
  }

  private checkFarmPortal(): void {
    if (!this.localPlayer || this.isTransitioning) {
      return;
    }

    const withinDoorX =
      this.localPlayer.x >= LOBBY_CONFIG.doorPortal.minX && this.localPlayer.x <= LOBBY_CONFIG.doorPortal.maxX;
    const crossedDoor = this.localPlayer.y >= LOBBY_CONFIG.doorPortal.triggerY;

    if (withinDoorX && crossedDoor) {
      this.startTransitionToFarm();
    }
  }

  private startTransitionToFarm(): void {
    if (this.isTransitioning || !this.localPlayer) {
      return;
    }

    this.isTransitioning = true;
    this.ui.showHint('Walking through the gate...');

    this.state = this.stateMachine.reset('idle', Date.now());
    this.localPlayer.setVisualState(this.direction, this.state);

    this.cameras.main.fadeOut(360, 8, 10, 16);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(SCENE_KEYS.farm, {
        session: this.buildSessionData({ x: 640, y: 112 })
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

  private handleInteractionState(payload: InteractionStatePayload): void {
    if (payload.playerId === this.selfId) {
      this.coins = payload.coins;
      this.ui.updateCoins(this.coins);
      this.state = this.stateMachine.syncFromServer(payload.state, Date.now());
      this.localPlayer?.setVisualState(this.direction, this.state);
      return;
    }

    const remote = this.remotePlayers.get(payload.playerId);
    if (remote) {
      remote.setVisualState(remote.getDirection(), payload.state);
    }

    const snapshot = this.remoteSnapshots.get(payload.playerId);
    if (snapshot) {
      this.remoteSnapshots.set(payload.playerId, {
        ...snapshot,
        state: payload.state,
        coins: payload.coins
      });
    }
  }

  private sendMoveIfNeeded(force = false): void {
    if (!this.localPlayer) {
      return;
    }

    const now = Date.now();
    if (!force && now - this.lastMoveSentAt < LOBBY_CONFIG.moveIntervalMs) {
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
}
