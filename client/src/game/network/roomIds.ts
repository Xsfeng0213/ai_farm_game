export function lobbyRoomId(baseRoomId: string): string {
  return `${baseRoomId}:lobby`;
}

export function farmRoomId(baseRoomId: string): string {
  return `${baseRoomId}:farm`;
}
