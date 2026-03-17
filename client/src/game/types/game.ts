import type { CropType, InteractionTarget, PlayerState } from '../../types/protocol';
import type { PlayerSkin } from './playerSkin';

export interface InteractableDef {
  target: InteractionTarget;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  spriteKey: string;
  state: PlayerState;
  depth?: number;
}

export interface UiBridge {
  updateRoom: (roomId: string, onlineCount: number) => void;
  updateCoins: (coins: number) => void;
  appendChat: (message: string) => void;
  showHint: (message: string) => void;
  setInventoryVisible: (visible: boolean) => void;
  setTaskBoardVisible: (visible: boolean) => void;
  updateInventory: (items: InventoryViewItem[]) => void;
  updateTasks: (tasks: TaskViewItem[]) => void;
}

export interface InventoryTaskActionView {
  taskId: string;
  label: string;
  disabled: boolean;
}

export interface InventoryViewItem {
  cropType: CropType;
  label: string;
  count: number;
  description: string;
  icon: string;
  sellPrice: number;
  taskAction?: InventoryTaskActionView;
}

export interface TaskViewItem {
  id: string;
  title: string;
  detail: string;
  progressText: string;
  rewardText: string;
  actionLabel?: string;
  actionDisabled?: boolean;
  completed: boolean;
}

export type InventoryActionRequest =
  | { type: 'sell_one'; cropType: CropType }
  | { type: 'sell_all'; cropType: CropType }
  | { type: 'deliver_task'; cropType: CropType; taskId: string };

export interface UiControls extends UiBridge {
  onSend: (handler: (message: string) => void) => void;
  onEmoji: (handler: (emoji: string) => void) => void;
  onSkinChange: (handler: (skin: PlayerSkin) => void) => void;
  onInventoryAction: (handler: (action: InventoryActionRequest) => void) => void;
  onTaskAction: (handler: (taskId: string) => void) => void;
}
