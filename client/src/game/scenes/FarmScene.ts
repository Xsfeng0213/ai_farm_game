import Phaser from 'phaser';
import type {
  ChatMessagePayload,
  CropType,
  FacingDirection,
  FarmPlotSnapshot,
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
import { FarmActionPanel } from '../ui/FarmActionPanel';
import { buildFarmMap } from '../world/FarmMapBuilder';
import { SCENE_KEYS } from './SceneKeys';
import type { SharedSceneOptions } from './SceneOptions';

const FARM_ACTION_COOLDOWN_MS = 280;

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
  private actionPanel: FarmActionPanel | null = null;
  private actionPanelPlotId: FarmPlotSnapshot['id'] | null = null;
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
    this.actionPanel = new FarmActionPanel(this);
    this.interactKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.E) ?? null;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.hideActionPanel();
    });

    this.network.offAll();
    this.bindNetworkEvents();
    this.bindUiEvents();
    this.network.connect();
    this.network.joinRoom({
      roomId: this.networkRoomId(),
      nickname: this.nickname
    });

    this.ui.updateCoins(this.coins);
    this.ui.showHint('Farm ready. Press E near field to interact');
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
    this.updateActionPanelPosition();
    this.checkLobbyGate();
  }

  private resetSceneState(): void {
    this.actionPanel?.hide();
    this.actionPanel = null;
    this.actionPanelPlotId = null;
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

      if (
        this.actionPanelPlotId === payload.plot.id &&
        (payload.plot.state !== 'planted' || (payload.plot.watered && payload.plot.fertilized))
      ) {
        this.hideActionPanel();
      }

      if (payload.actorId === this.selfId && typeof payload.actorCoins === 'number') {
        this.coins = payload.actorCoins;
        this.ui.updateCoins(this.coins);
      }

      if (payload.action === 'planted') {
        this.farmPlotSystem?.pulsePlot(payload.plot.id, 0x88d07a);
        this.farmPlotSystem?.showFloatingText(payload.plot.id, `${cropLabel} planted`, '#a8f3a0');
      } else if (payload.action === 'watered') {
        this.farmPlotSystem?.pulsePlot(payload.plot.id, 0x6ea8e4);
        this.farmPlotSystem?.showFloatingText(payload.plot.id, 'Watered', '#9edbff');
      } else if (payload.action === 'fertilized') {
        this.farmPlotSystem?.pulsePlot(payload.plot.id, 0xc19b64);
        this.farmPlotSystem?.showFloatingText(payload.plot.id, 'Fertilized', '#f3cc94');
      } else if (payload.action === 'grown') {
        this.farmPlotSystem?.pulsePlot(payload.plot.id, 0xffd97a);
        this.farmPlotSystem?.showFloatingText(payload.plot.id, `${cropLabel} ready`, '#ffe48f');
      } else if (payload.action === 'harvested') {
        this.farmPlotSystem?.pulsePlot(payload.plot.id, 0xffdd8b);
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
      this.hideActionPanel();
      this.ui.showHint('Farm ready. Press E near field to interact');
      return;
    }

    if (candidate.action === 'plant_menu') {
      this.ui.showHint(`Press E to choose crop for ${candidate.label}`);
    } else if (candidate.action === 'care_menu') {
      this.ui.showHint(
        `Press E to care ${this.cropLabel(candidate.cropType)} (${candidate.watered ? 'W' : '-'} / ${candidate.fertilized ? 'F' : '-'})`
      );
    } else if (candidate.action === 'harvest') {
      this.hideActionPanel();
      this.ui.showHint(`Press E to harvest ${this.cropLabel(candidate.cropType)} at ${candidate.label}`);
    } else {
      this.hideActionPanel();
      this.ui.showHint(`${this.cropLabel(candidate.cropType)} is growing at ${candidate.label}`);
    }

    if (!this.interactKey || !Phaser.Input.Keyboard.JustDown(this.interactKey)) {
      return;
    }

    if (now - this.lastFarmActionAt <= FARM_ACTION_COOLDOWN_MS) {
      return;
    }

    if (candidate.action === 'plant_menu') {
      this.lastFarmActionAt = now;
      this.openPlantMenu(candidate.plotId, candidate.label);
      return;
    }

    if (candidate.action === 'care_menu') {
      this.lastFarmActionAt = now;
      this.openCareMenu(candidate.plotId, candidate.canWater, candidate.canFertilize);
      return;
    }

    if (
      candidate.action === 'harvest' &&
      now - this.lastFarmActionAt > FARM_ACTION_COOLDOWN_MS
    ) {
      this.lastFarmActionAt = now;
      this.hideActionPanel();
      this.network.sendFarmInteract({ plotId: candidate.plotId, action: 'harvest' });
      this.state = 'interacting';
      this.localPlayer.setVisualState(this.direction, this.state);
      this.sendMoveIfNeeded(true);
    }
  }

  private openPlantMenu(plotId: FarmPlotSnapshot['id'], label: string): void {
    if (!this.actionPanel || !this.localPlayer) {
      return;
    }

    this.actionPanelPlotId = plotId;
    this.actionPanel.show(
      this.localPlayer.x,
      this.localPlayer.y - 86,
      `Plant ${label}`,
      [
        { id: 'wheat', label: 'Wheat' },
        { id: 'carrot', label: 'Carrot' },
        { id: 'potato', label: 'Potato' }
      ],
      (id) => {
        if (id !== 'wheat' && id !== 'carrot' && id !== 'potato') {
          return;
        }

        this.network.sendFarmInteract({ plotId, action: 'plant', cropType: id });
        this.state = 'interacting';
        this.localPlayer?.setVisualState(this.direction, this.state);
        this.sendMoveIfNeeded(true);
        this.hideActionPanel();
      }
    );
  }

  private openCareMenu(plotId: FarmPlotSnapshot['id'], canWater: boolean, canFertilize: boolean): void {
    if (!this.actionPanel || !this.localPlayer) {
      return;
    }

    this.actionPanelPlotId = plotId;
    this.actionPanel.show(
      this.localPlayer.x,
      this.localPlayer.y - 82,
      'Care Action',
      [
        { id: 'water', label: canWater ? 'Water' : 'Watered', disabled: !canWater },
        { id: 'fertilize', label: canFertilize ? 'Fertilize' : 'Fertilized', disabled: !canFertilize }
      ],
      (id) => {
        if (id !== 'water' && id !== 'fertilize') {
          return;
        }

        this.network.sendFarmInteract({ plotId, action: id });
        this.state = 'interacting';
        this.localPlayer?.setVisualState(this.direction, this.state);
        this.sendMoveIfNeeded(true);
        this.hideActionPanel();
      }
    );
  }

  private hideActionPanel(): void {
    this.actionPanel?.hide();
    this.actionPanelPlotId = null;
  }

  private updateActionPanelPosition(): void {
    if (!this.actionPanel?.isVisible() || !this.localPlayer || !this.farmPlotSystem || !this.actionPanelPlotId) {
      return;
    }

    const plotPos = this.farmPlotSystem.getPlotPosition(this.actionPanelPlotId);
    if (plotPos) {
      const distance = Phaser.Math.Distance.Between(this.localPlayer.x, this.localPlayer.y, plotPos.x, plotPos.y);
      if (distance > 110) {
        this.hideActionPanel();
        return;
      }
    }

    this.actionPanel.setPosition(this.localPlayer.x, this.localPlayer.y - 86);
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

    this.hideActionPanel();
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
