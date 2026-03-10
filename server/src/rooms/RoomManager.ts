import type {
  ChatMessagePayload,
  ChatPayload,
  FarmInteractPayload,
  FarmPlotSnapshot,
  FarmPlotUpdatedPayload,
  FarmStatePayload,
  InteractPayload,
  InteractionStatePayload,
  JoinRoomPayload,
  MovePayload,
  PlayerMovedPayload,
  PlayerSnapshot,
  PlayerState,
  RoomId,
  RoomStatePayload
} from '../../../shared/protocol/events';
import { FARM_GROWTH_MS, FARM_HARVEST_COINS, FARM_PLOT_IDS } from '../../../shared/protocol/farmPlots';

interface PlayerRecord extends PlayerSnapshot {
  socketId: string;
}

interface FarmPlotRecord extends FarmPlotSnapshot {}

const ROOM_FALLBACK: RoomId = 'lobby-1';
const MAX_MESSAGE_LENGTH = 120;

export class RoomManager {
  private readonly players = new Map<string, PlayerRecord>();
  private readonly roomMembers = new Map<RoomId, Set<string>>();
  private readonly farmPlotsByRoom = new Map<RoomId, Map<FarmPlotSnapshot['id'], FarmPlotRecord>>();

  join(socketId: string, payload: JoinRoomPayload): {
    roomState: RoomStatePayload;
    player: PlayerSnapshot;
    leftRoomId: RoomId | null;
  } {
    const previous = this.players.get(socketId);
    const nickname = this.sanitizeNickname(payload.nickname);
    const roomId = payload.roomId || ROOM_FALLBACK;

    const leftRoomId = this.leaveRoomMembership(socketId, previous?.roomId ?? null);

    const player: PlayerRecord = {
      id: socketId,
      socketId,
      nickname,
      roomId,
      position: this.spawnPosition(roomId),
      direction: previous?.direction ?? 'down',
      state: previous?.state ?? 'idle',
      coins: previous?.coins ?? 0
    };

    this.players.set(socketId, player);
    if (!this.roomMembers.has(roomId)) {
      this.roomMembers.set(roomId, new Set());
    }
    this.roomMembers.get(roomId)?.add(socketId);

    if (this.isFarmRoom(roomId)) {
      this.ensureFarmRoom(roomId);
    }

    return {
      player,
      leftRoomId,
      roomState: {
        roomId,
        selfId: socketId,
        players: this.getRoomPlayers(roomId)
      }
    };
  }

  leave(socketId: string): { roomId: RoomId; id: string } | null {
    const player = this.players.get(socketId);
    if (!player) {
      return null;
    }

    this.players.delete(socketId);
    const members = this.roomMembers.get(player.roomId);
    members?.delete(socketId);
    if (members && members.size === 0) {
      this.roomMembers.delete(player.roomId);
    }

    return { roomId: player.roomId, id: socketId };
  }

  move(socketId: string, payload: MovePayload): { roomId: RoomId; moved: PlayerMovedPayload } | null {
    const player = this.players.get(socketId);
    if (!player) {
      return null;
    }

    player.position = payload.position;
    player.direction = payload.direction;
    player.state = payload.state;

    return {
      roomId: player.roomId,
      moved: {
        id: player.id,
        position: payload.position,
        direction: payload.direction,
        state: payload.state,
        serverTime: Date.now()
      }
    };
  }

  chat(socketId: string, payload: ChatPayload): { roomId: RoomId; message: ChatMessagePayload } | null {
    const player = this.players.get(socketId);
    if (!player) {
      return null;
    }

    const message = payload.message.trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!message && !payload.emoji) {
      return null;
    }

    return {
      roomId: player.roomId,
      message: {
        id: `${Date.now()}-${socketId}`,
        playerId: player.id,
        nickname: player.nickname,
        message,
        emoji: payload.emoji,
        serverTime: Date.now()
      }
    };
  }

  interact(socketId: string, payload: InteractPayload): { roomId: RoomId; interaction: InteractionStatePayload } | null {
    const player = this.players.get(socketId);
    if (!player) {
      return null;
    }

    const nextState = this.mapTargetToState(payload.target);
    player.state = nextState;
    player.coins += 1;

    return {
      roomId: player.roomId,
      interaction: {
        playerId: player.id,
        target: payload.target,
        state: nextState,
        coins: player.coins,
        serverTime: Date.now()
      }
    };
  }

  getFarmState(roomId: RoomId): FarmStatePayload | null {
    if (!this.isFarmRoom(roomId)) {
      return null;
    }

    const plots = this.ensureFarmRoom(roomId);
    return {
      roomId,
      plots: Array.from(plots.values()).map((plot) => ({ ...plot }))
    };
  }

  farmInteract(socketId: string, payload: FarmInteractPayload): FarmPlotUpdatedPayload | null {
    const player = this.players.get(socketId);
    if (!player || !this.isFarmRoom(player.roomId)) {
      return null;
    }

    const plots = this.ensureFarmRoom(player.roomId);
    const plot = plots.get(payload.plotId);
    if (!plot) {
      return null;
    }

    const now = Date.now();
    if (plot.state === 'planted' && plot.readyAt && now >= plot.readyAt) {
      plot.state = 'harvestable';
      plot.updatedAt = now;
      plot.readyAt = undefined;
    }

    if (plot.state === 'empty') {
      plot.state = 'planted';
      plot.plantedBy = player.id;
      plot.readyAt = now + FARM_GROWTH_MS;
      plot.updatedAt = now;

      return {
        roomId: player.roomId,
        plot: { ...plot },
        action: 'planted',
        actorId: player.id,
        actorCoins: player.coins,
        serverTime: now
      };
    }

    if (plot.state !== 'harvestable') {
      return null;
    }

    plot.state = 'empty';
    plot.plantedBy = undefined;
    plot.readyAt = undefined;
    plot.updatedAt = now;
    player.coins += FARM_HARVEST_COINS;

    return {
      roomId: player.roomId,
      plot: { ...plot },
      action: 'harvested',
      actorId: player.id,
      actorCoins: player.coins,
      serverTime: now
    };
  }

  collectFarmGrowthUpdates(now: number): FarmPlotUpdatedPayload[] {
    const updates: FarmPlotUpdatedPayload[] = [];

    this.farmPlotsByRoom.forEach((plots, roomId) => {
      plots.forEach((plot) => {
        if (plot.state !== 'planted' || !plot.readyAt || now < plot.readyAt) {
          return;
        }

        plot.state = 'harvestable';
        plot.readyAt = undefined;
        plot.updatedAt = now;

        updates.push({
          roomId,
          plot: { ...plot },
          action: 'grown',
          serverTime: now
        });
      });
    });

    return updates;
  }

  getPlayer(socketId: string): PlayerSnapshot | null {
    return this.players.get(socketId) ?? null;
  }

  private ensureFarmRoom(roomId: RoomId): Map<FarmPlotSnapshot['id'], FarmPlotRecord> {
    const existing = this.farmPlotsByRoom.get(roomId);
    if (existing) {
      return existing;
    }

    const now = Date.now();
    const plots = new Map<FarmPlotSnapshot['id'], FarmPlotRecord>();

    FARM_PLOT_IDS.forEach((id) => {
      plots.set(id, {
        id,
        state: 'empty',
        updatedAt: now
      });
    });

    this.farmPlotsByRoom.set(roomId, plots);
    return plots;
  }

  private getRoomPlayers(roomId: RoomId): PlayerSnapshot[] {
    const members = this.roomMembers.get(roomId);
    if (!members) {
      return [];
    }

    const snapshots: PlayerSnapshot[] = [];
    members.forEach((socketId) => {
      const player = this.players.get(socketId);
      if (player) {
        snapshots.push(player);
      }
    });

    return snapshots;
  }

  private sanitizeNickname(input: string): string {
    const trimmed = input.trim();
    if (!trimmed) {
      return `Player-${Math.floor(Math.random() * 1000)}`;
    }

    return trimmed.slice(0, 16);
  }

  private spawnPosition(roomId: RoomId): { x: number; y: number } {
    if (roomId.endsWith(':farm')) {
      return {
        x: 622 + Math.random() * 40,
        y: 92 + Math.random() * 24
      };
    }

    return {
      x: 612 + Math.random() * 56,
      y: 500 + Math.random() * 72
    };
  }

  private leaveRoomMembership(socketId: string, roomId: RoomId | null): RoomId | null {
    if (!roomId) {
      return null;
    }

    const members = this.roomMembers.get(roomId);
    members?.delete(socketId);
    if (members && members.size === 0) {
      this.roomMembers.delete(roomId);
    }

    return roomId;
  }

  private mapTargetToState(target: InteractPayload['target']): PlayerState {
    if (target === 'desk') {
      return 'working';
    }

    if (target === 'coffee') {
      return 'drinking';
    }

    return 'resting';
  }

  private isFarmRoom(roomId: RoomId): boolean {
    return roomId.endsWith(':farm');
  }
}
