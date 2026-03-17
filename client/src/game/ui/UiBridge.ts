import type { CropType } from '../../types/protocol';
import type {
  InventoryActionRequest,
  InventoryViewItem,
  TaskViewItem,
  UiControls
} from '../types/game';
import { PLAYER_SKINS, type PlayerSkin } from '../types/playerSkin';

interface UiElements {
  roomLabel: HTMLElement;
  coinsLabel: HTMLElement;
  hintLabel: HTMLElement;
  taskPanel: HTMLElement;
  taskList: HTMLElement;
  inventoryToggleButton: HTMLButtonElement;
  inventoryPanel: HTMLElement;
  inventoryGrid: HTMLElement;
  inventoryTooltip: HTMLElement;
  inventoryTooltipTitle: HTMLElement;
  inventoryTooltipCount: HTMLElement;
  inventoryTooltipDesc: HTMLElement;
  inventorySellButton: HTMLButtonElement;
  inventorySellAllButton: HTMLButtonElement;
  inventoryTaskButton: HTMLButtonElement;
  chatPanel: HTMLElement;
  chatToggleButton: HTMLButtonElement;
  chatList: HTMLElement;
  chatInput: HTMLInputElement;
  sendButton: HTMLButtonElement;
  emojiButtons: NodeListOf<HTMLButtonElement>;
  skinButtons: NodeListOf<HTMLButtonElement>;
}

const SLOT_COLUMNS = 6;
const SLOT_ROWS = 8;
const SLOT_COUNT = SLOT_COLUMNS * SLOT_ROWS;
const CROP_ORDER: CropType[] = ['wheat', 'carrot', 'potato'];

export class DomUiBridge implements UiControls {
  private readonly elements: UiElements;
  private sendHandler: ((message: string) => void) | null = null;
  private emojiHandler: ((emoji: string) => void) | null = null;
  private skinHandler: ((skin: PlayerSkin) => void) | null = null;
  private inventoryActionHandler: ((action: InventoryActionRequest) => void) | null = null;
  private taskHandler: ((taskId: string) => void) | null = null;

  private chatCollapsed = false;
  private unreadCount = 0;

  private inventoryEnabled = false;
  private inventoryOpen = false;
  private readonly inventoryItems = new Map<CropType, InventoryViewItem>();
  private slotCrops: Array<CropType | null> = Array.from({ length: SLOT_COUNT }, () => null);
  private activeTooltipCrop: CropType | null = null;

  private taskBoardVisible = false;
  private taskItems: TaskViewItem[] = [];

  constructor(elements: UiElements) {
    this.elements = elements;
    this.bindDomListeners();
    this.renderInventoryGrid();
    this.renderTaskList();
  }

  updateRoom(roomId: string, onlineCount: number): void {
    this.elements.roomLabel.textContent = `Room ${roomId} | Online ${onlineCount}`;
  }

  updateCoins(coins: number): void {
    this.elements.coinsLabel.textContent = `Coins ${coins}`;
  }

  appendChat(message: string): void {
    const item = document.createElement('div');
    item.className = 'chat-item';
    item.textContent = message;
    this.elements.chatList.appendChild(item);
    this.elements.chatList.scrollTop = this.elements.chatList.scrollHeight;

    if (this.chatCollapsed) {
      this.unreadCount += 1;
      this.refreshChatToggleLabel();
    }
  }

  showHint(message: string): void {
    this.elements.hintLabel.textContent = message;
  }

  setInventoryVisible(visible: boolean): void {
    this.inventoryEnabled = visible;
    this.elements.inventoryToggleButton.classList.toggle('is-hidden', !visible);

    if (!visible) {
      this.inventoryOpen = false;
      this.activeTooltipCrop = null;
      this.elements.inventoryPanel.classList.add('is-hidden');
      this.hideInventoryTooltip();
      this.renderInventoryGrid();
      this.elements.inventoryToggleButton.textContent = 'Bag';
      return;
    }

    this.elements.inventoryToggleButton.textContent = this.inventoryOpen ? 'Close' : 'Bag';
  }

  setTaskBoardVisible(visible: boolean): void {
    this.taskBoardVisible = visible;
    this.elements.taskPanel.classList.toggle('is-hidden', !visible);
    this.renderTaskList();
  }

  updateInventory(items: InventoryViewItem[]): void {
    this.inventoryItems.clear();
    items.forEach((item) => {
      this.inventoryItems.set(item.cropType, item);
    });

    this.renderInventoryGrid();
    this.refreshActiveTooltip();
  }

  updateTasks(tasks: TaskViewItem[]): void {
    this.taskItems = tasks;
    this.renderTaskList();
  }

  onSend(handler: (message: string) => void): void {
    this.sendHandler = handler;
  }

  onEmoji(handler: (emoji: string) => void): void {
    this.emojiHandler = handler;
  }

  onSkinChange(handler: (skin: PlayerSkin) => void): void {
    this.skinHandler = handler;
  }

  onInventoryAction(handler: (action: InventoryActionRequest) => void): void {
    this.inventoryActionHandler = handler;
  }

  onTaskAction(handler: (taskId: string) => void): void {
    this.taskHandler = handler;
  }

  private bindDomListeners(): void {
    this.elements.inventoryToggleButton.addEventListener('click', () => {
      if (!this.inventoryEnabled) {
        return;
      }

      this.inventoryOpen = !this.inventoryOpen;
      this.elements.inventoryPanel.classList.toggle('is-hidden', !this.inventoryOpen);
      this.elements.inventoryToggleButton.textContent = this.inventoryOpen ? 'Close' : 'Bag';

      if (!this.inventoryOpen) {
        this.activeTooltipCrop = null;
        this.hideInventoryTooltip();
        this.renderInventoryGrid();
        return;
      }

      this.refreshActiveTooltip();
    });

    this.elements.inventoryGrid.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const slot = target.closest<HTMLButtonElement>('.bag-slot');
      if (!slot) {
        return;
      }

      const crop = slot.dataset.crop as CropType | undefined;
      if (!crop) {
        this.activeTooltipCrop = null;
        this.hideInventoryTooltip();
        this.renderInventoryGrid();
        return;
      }

      const item = this.inventoryItems.get(crop);
      if (!item || item.count <= 0) {
        this.activeTooltipCrop = null;
        this.hideInventoryTooltip();
        this.renderInventoryGrid();
        return;
      }

      if (this.activeTooltipCrop === crop && !this.elements.inventoryTooltip.classList.contains('is-hidden')) {
        this.activeTooltipCrop = null;
        this.hideInventoryTooltip();
        this.renderInventoryGrid();
        return;
      }

      const clickedSlotRect = slot.getBoundingClientRect();
      this.activeTooltipCrop = crop;
      this.renderInventoryGrid();
      this.showInventoryTooltip(clickedSlotRect, item);
    });

    this.elements.inventorySellButton.addEventListener('click', () => {
      if (!this.activeTooltipCrop) {
        return;
      }

      this.inventoryActionHandler?.({
        type: 'sell_one',
        cropType: this.activeTooltipCrop
      });
    });

    this.elements.inventorySellAllButton.addEventListener('click', () => {
      if (!this.activeTooltipCrop) {
        return;
      }

      this.inventoryActionHandler?.({
        type: 'sell_all',
        cropType: this.activeTooltipCrop
      });
    });

    this.elements.inventoryTaskButton.addEventListener('click', () => {
      if (!this.activeTooltipCrop) {
        return;
      }

      const item = this.inventoryItems.get(this.activeTooltipCrop);
      if (!item?.taskAction || item.taskAction.disabled) {
        return;
      }

      this.inventoryActionHandler?.({
        type: 'deliver_task',
        cropType: this.activeTooltipCrop,
        taskId: item.taskAction.taskId
      });
    });

    this.elements.taskList.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const button = target.closest<HTMLButtonElement>('.task-action-btn');
      if (!button || button.disabled) {
        return;
      }

      const taskId = button.dataset.taskId;
      if (!taskId) {
        return;
      }

      this.taskHandler?.(taskId);
    });

    document.addEventListener('pointerdown', (event) => {
      if (this.elements.inventoryPanel.classList.contains('is-hidden')) {
        return;
      }

      const target = event.target as Node;
      if (
        this.elements.inventoryPanel.contains(target) ||
        this.elements.inventoryToggleButton.contains(target)
      ) {
        return;
      }

      this.activeTooltipCrop = null;
      this.hideInventoryTooltip();
      this.renderInventoryGrid();
    });

    this.elements.chatToggleButton.addEventListener('click', () => {
      this.toggleChatPanel();
    });

    this.elements.sendButton.addEventListener('click', () => {
      this.emitChat();
    });

    this.elements.chatInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        this.emitChat();
      }
    });

    this.elements.emojiButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const emoji = button.dataset.emoji ?? '';
        if (emoji) {
          this.emojiHandler?.(emoji);
        }
      });
    });

    this.elements.skinButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const skin = button.dataset.skin as PlayerSkin | undefined;
        if (!skin || !PLAYER_SKINS.includes(skin)) {
          return;
        }

        this.elements.skinButtons.forEach((btn) => btn.classList.remove('active'));
        button.classList.add('active');
        this.skinHandler?.(skin);
      });
    });

    this.refreshChatToggleLabel();
    this.elements.inventoryToggleButton.textContent = 'Bag';
  }

  private renderInventoryGrid(): void {
    const ordered = CROP_ORDER.map((cropType) => this.inventoryItems.get(cropType)).filter(
      (item): item is InventoryViewItem => Boolean(item && item.count > 0)
    );

    this.slotCrops = Array.from({ length: SLOT_COUNT }, () => null);
    ordered.forEach((item, index) => {
      if (index < SLOT_COUNT) {
        this.slotCrops[index] = item.cropType;
      }
    });

    if (this.activeTooltipCrop && !this.slotCrops.includes(this.activeTooltipCrop)) {
      this.activeTooltipCrop = null;
    }

    const fragment = document.createDocumentFragment();

    for (let i = 0; i < SLOT_COUNT; i += 1) {
      const crop = this.slotCrops[i];
      const item = crop ? this.inventoryItems.get(crop) : undefined;

      const slot = document.createElement('button');
      slot.type = 'button';
      slot.className = 'bag-slot';
      slot.dataset.index = String(i);

      if (item && item.count > 0) {
        slot.classList.add('filled');
        if (crop) {
          slot.dataset.crop = crop;
        }
        if (this.activeTooltipCrop === crop) {
          slot.classList.add('active');
        }

        const icon = document.createElement('img');
        icon.className = 'bag-slot-icon';
        icon.src = item.icon;
        icon.alt = item.label;

        const count = document.createElement('span');
        count.className = 'bag-slot-count';
        count.textContent = `x${item.count}`;

        slot.append(icon, count);
      } else {
        slot.classList.add('empty');
      }

      fragment.appendChild(slot);
    }

    this.elements.inventoryGrid.replaceChildren(fragment);
  }

  private refreshActiveTooltip(): void {
    if (!this.inventoryOpen || !this.activeTooltipCrop) {
      this.hideInventoryTooltip();
      return;
    }

    const item = this.inventoryItems.get(this.activeTooltipCrop);
    const slot = this.elements.inventoryGrid.querySelector<HTMLButtonElement>(`.bag-slot[data-crop="${this.activeTooltipCrop}"]`);
    if (!item || item.count <= 0 || !slot) {
      this.activeTooltipCrop = null;
      this.hideInventoryTooltip();
      this.renderInventoryGrid();
      return;
    }

    this.showInventoryTooltip(slot.getBoundingClientRect(), item);
  }

  private showInventoryTooltip(slotRect: DOMRect, item: InventoryViewItem): void {
    this.elements.inventoryTooltipTitle.textContent = item.label;
    this.elements.inventoryTooltipCount.textContent = `Qty ${item.count}`;
    this.elements.inventoryTooltipDesc.textContent = item.description;
    this.elements.inventorySellButton.textContent = `Sell +${item.sellPrice}`;
    this.elements.inventorySellAllButton.textContent = `Sell All +${item.sellPrice * item.count}`;

    if (item.taskAction) {
      this.elements.inventoryTaskButton.classList.remove('is-hidden');
      this.elements.inventoryTaskButton.textContent = item.taskAction.label;
      this.elements.inventoryTaskButton.disabled = item.taskAction.disabled;
    } else {
      this.elements.inventoryTaskButton.classList.add('is-hidden');
      this.elements.inventoryTaskButton.textContent = 'Deliver';
      this.elements.inventoryTaskButton.disabled = true;
    }

    this.elements.inventoryTooltip.classList.remove('is-hidden');

    const panelRect = this.elements.inventoryPanel.getBoundingClientRect();
    let left = slotRect.right - panelRect.left + 8;
    let top = slotRect.top - panelRect.top;

    this.elements.inventoryTooltip.style.left = `${left}px`;
    this.elements.inventoryTooltip.style.top = `${top}px`;

    const tipRect = this.elements.inventoryTooltip.getBoundingClientRect();
    const tipHeight = tipRect.height;

    if (top + tipHeight > panelRect.height - 6) {
      top = panelRect.height - tipHeight - 8;
    }

    top = Math.max(8, top);

    this.elements.inventoryTooltip.style.left = `${left}px`;
    this.elements.inventoryTooltip.style.top = `${top}px`;
  }

  private hideInventoryTooltip(): void {
    this.elements.inventoryTooltip.classList.add('is-hidden');
  }

  private renderTaskList(): void {
    if (!this.taskBoardVisible) {
      this.elements.taskList.replaceChildren();
      return;
    }

    const fragment = document.createDocumentFragment();

    this.taskItems.forEach((task) => {
      const card = document.createElement('article');
      card.className = 'task-card';
      if (task.completed) {
        card.classList.add('done');
      }

      const title = document.createElement('div');
      title.className = 'task-card-title';
      title.textContent = task.title;

      const detail = document.createElement('div');
      detail.className = 'task-card-detail';
      detail.textContent = task.detail;

      const progress = document.createElement('div');
      progress.className = 'task-card-progress';
      progress.textContent = task.progressText;

      const reward = document.createElement('div');
      reward.className = 'task-card-reward';
      reward.textContent = task.rewardText;

      const footer = document.createElement('div');
      footer.className = 'task-card-footer';

      const status = document.createElement('span');
      status.className = 'task-card-status';
      status.textContent = task.completed ? 'Done' : task.actionLabel ? 'Ready' : 'Active';

      footer.append(status);

      if (task.actionLabel) {
        const action = document.createElement('button');
        action.type = 'button';
        action.className = 'task-action-btn';
        action.dataset.taskId = task.id;
        action.textContent = task.actionLabel;
        action.disabled = task.actionDisabled ?? false;
        footer.append(action);
      }

      card.append(title, detail, progress, reward, footer);
      fragment.appendChild(card);
    });

    this.elements.taskList.replaceChildren(fragment);
  }

  private emitChat(): void {
    if (!this.sendHandler) {
      return;
    }

    const value = this.elements.chatInput.value.trim();
    if (!value) {
      return;
    }

    this.sendHandler(value);
    this.elements.chatInput.value = '';
    this.elements.chatInput.focus();
  }

  private toggleChatPanel(forceState?: boolean): void {
    const next = forceState ?? !this.chatCollapsed;
    this.chatCollapsed = next;
    this.elements.chatPanel.classList.toggle('collapsed', this.chatCollapsed);

    if (!this.chatCollapsed) {
      this.unreadCount = 0;
      this.elements.chatInput.focus();
    }

    this.refreshChatToggleLabel();
  }

  private refreshChatToggleLabel(): void {
    if (this.chatCollapsed) {
      this.elements.chatToggleButton.textContent = this.unreadCount > 0 ? `Chat (${this.unreadCount})` : 'Chat';
      return;
    }

    this.elements.chatToggleButton.textContent = 'Hide';
  }
}
