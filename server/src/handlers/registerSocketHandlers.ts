import type { JoinRoomPayload } from '../../../shared/protocol/events';
import { RoomManager } from '../rooms/RoomManager';
import type { GameServer, GameSocket } from '../socketTypes';

const DEFAULT_ROOM = 'lobby-1';

export function registerSocketHandlers(io: GameServer): void {
  const roomManager = new RoomManager();

  io.on('connection', (socket: GameSocket) => {
    socket.on('join_room', (payload: JoinRoomPayload) => {
      const joinPayload = {
        roomId: payload.roomId || DEFAULT_ROOM,
        nickname: payload.nickname
      };
      const { roomState, player } = roomManager.join(socket.id, joinPayload);

      socket.join(roomState.roomId);
      socket.emit('room_state', roomState);
      socket.to(roomState.roomId).emit('player_joined', player);
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
