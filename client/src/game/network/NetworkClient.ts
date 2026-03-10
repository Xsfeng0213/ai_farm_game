import { io, type Socket } from 'socket.io-client';
import type {
  ChatPayload,
  ClientToServerEvents,
  InteractPayload,
  JoinRoomPayload,
  MovePayload,
  ServerToClientEvents
} from '../../types/protocol';

export class NetworkClient {
  private readonly socket: Socket<ServerToClientEvents, ClientToServerEvents>;

  constructor(serverUrl: string) {
    this.socket = io(serverUrl, {
      autoConnect: false,
      transports: ['websocket']
    });
  }

  connect(): void {
    if (!this.socket.connected) {
      this.socket.connect();
    }
  }

  disconnect(): void {
    this.socket.disconnect();
  }

  joinRoom(payload: JoinRoomPayload): void {
    this.socket.emit('join_room', payload);
  }

  sendMove(payload: MovePayload): void {
    this.socket.emit('move', payload);
  }

  sendChat(payload: ChatPayload): void {
    this.socket.emit('chat', payload);
  }

  sendInteract(payload: InteractPayload): void {
    this.socket.emit('interact', payload);
  }

  onRoomState(handler: ServerToClientEvents['room_state']): void {
    this.socket.on('room_state', handler);
  }

  onPlayerJoined(handler: ServerToClientEvents['player_joined']): void {
    this.socket.on('player_joined', handler);
  }

  onPlayerLeft(handler: ServerToClientEvents['player_left']): void {
    this.socket.on('player_left', handler);
  }

  onPlayerMoved(handler: ServerToClientEvents['player_moved']): void {
    this.socket.on('player_moved', handler);
  }

  onChatMessage(handler: ServerToClientEvents['chat_message']): void {
    this.socket.on('chat_message', handler);
  }

  onInteractionState(handler: ServerToClientEvents['interaction_state']): void {
    this.socket.on('interaction_state', handler);
  }

  offAll(): void {
    this.socket.removeAllListeners();
  }
}
