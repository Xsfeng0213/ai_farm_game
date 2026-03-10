import type {
  ChatMessagePayload,
  ChatPayload,
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

interface PlayerRecord extends PlayerSnapshot {
  socketId: string;
}

const ROOM_FALLBACK: RoomId = 'lobby-1';
const MAX_MESSAGE_LENGTH = 120;

export class RoomManager {
  private readonly players = new Map<string, PlayerRecord>();
  private readonly roomMembers = new Map<RoomId, Set<string>>();

  join(socketId: string, payload: JoinRoomPayload): { roomState: RoomStatePayload; player: PlayerSnapshot } {
    const nickname = this.sanitizeNickname(payload.nickname);
    const roomId = payload.roomId || ROOM_FALLBACK;
    const player: PlayerRecord = {
      id: socketId,
      socketId,
      nickname,
      roomId,
      position: this.spawnPosition(),
      direction: 'down',
      state: 'idle',
      coins: 0
    };

    this.players.set(socketId, player);
    if (!this.roomMembers.has(roomId)) {
      this.roomMembers.set(roomId, new Set());
    }
    this.roomMembers.get(roomId)?.add(socketId);

    return {
      player,
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

  getPlayer(socketId: string): PlayerSnapshot | null {
    return this.players.get(socketId) ?? null;
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

  private spawnPosition(): { x: number; y: number } {
    return {
      x: 612 + Math.random() * 56,
      y: 500 + Math.random() * 72
    };
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
}
