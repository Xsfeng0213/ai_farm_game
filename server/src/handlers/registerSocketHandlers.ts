import type { FarmInteractPayload, JoinRoomPayload } from '../../../shared/protocol/events';
import { RoomManager } from '../rooms/RoomManager';
import type { GameServer, GameSocket } from '../socketTypes';

const DEFAULT_ROOM = 'lobby-1';
const FARM_GROWTH_TICK_MS = 400;

export function registerSocketHandlers(io: GameServer): void {
  const roomManager = new RoomManager();
  setInterval(() => {
    const updates = roomManager.collectFarmGrowthUpdates(Date.now());
    updates.forEach((update) => {
      io.to(update.roomId).emit('farm_plot_updated', update);
    });
  }, FARM_GROWTH_TICK_MS);

  io.on('connection', (socket: GameSocket) => {
    socket.on('join_room', (payload: JoinRoomPayload) => {
      const joinPayload = {
        roomId: payload.roomId || DEFAULT_ROOM,
        nickname: payload.nickname
      };
      const { roomState, player, leftRoomId } = roomManager.join(socket.id, joinPayload);

      if (leftRoomId && leftRoomId !== roomState.roomId) {
        socket.leave(leftRoomId);
        socket.to(leftRoomId).emit('player_left', { id: socket.id });
      }

      socket.join(roomState.roomId);
      socket.emit('room_state', roomState);
      socket.to(roomState.roomId).emit('player_joined', player);

      const farmState = roomManager.getFarmState(roomState.roomId);
      if (farmState) {
        socket.emit('farm_state', farmState);
      }
    });

    socket.on('move', (payload) => {
      const moved = roomManager.move(socket.id, payload);
      if (!moved) {
        return;
      }

      socket.to(moved.roomId).emit('player_moved', moved.moved);
    });

    socket.on('chat', (payload) => {
      const chat = roomManager.chat(socket.id, payload);
      if (!chat) {
        return;
      }

      io.to(chat.roomId).emit('chat_message', chat.message);
    });

    socket.on('interact', (payload) => {
      const interaction = roomManager.interact(socket.id, payload);
      if (!interaction) {
        return;
      }

      io.to(interaction.roomId).emit('interaction_state', interaction.interaction);
    });

    socket.on('farm_interact', (payload: FarmInteractPayload) => {
      const update = roomManager.farmInteract(socket.id, payload);
      if (!update) {
        return;
      }

      io.to(update.roomId).emit('farm_plot_updated', update);
    });

    socket.on('ping', ({ clientTime }) => {
      socket.emit('chat_message', {
        id: `ping-${Date.now()}`,
        playerId: socket.id,
        nickname: 'system',
        message: `pong ${Date.now() - clientTime}ms`,
        serverTime: Date.now()
      });
    });

    socket.on('disconnect', () => {
      const left = roomManager.leave(socket.id);
      if (!left) {
        return;
      }

      socket.to(left.roomId).emit('player_left', { id: left.id });
    });
  });
}
