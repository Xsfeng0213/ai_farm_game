import type { CropType } from '../../types/protocol';
import type { InventoryViewItem, UiControls } from '../types/game';
import { PLAYER_SKINS, type PlayerSkin } from '../types/playerSkin';

interface UiElements {
  roomLabel: HTMLElement;
  coinsLabel: HTMLElement;
  hintLabel: HTMLElement;
  inventoryToggleButton: HTMLButtonElement;
  inventoryPanel: HTMLElement;
  inventoryGrid: HTMLElement;
  inventoryTooltip: HTMLElement;
  inventoryTooltipTitle: HTMLElement;
  inventoryTooltipCount: HTMLElement;
  inventoryTooltipDesc: HTMLElement;
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

  private chatCollapsed = false;
  private unreadCount = 0;

  private inventoryEnabled = false;
  private inventoryOpen = false;
  private readonly inventoryItems = new Map<CropType, InventoryViewItem>();
  private slotCrops: Array<CropType | null> = Array.from({ length: SLOT_COUNT }, () => null);
  private activeSlotIndex: number | null = null;

  constructor(elements: UiElements) {
    this.elements = elements;
    this.bindDomListeners();
    this.renderInventoryGrid();
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
      this.elements.inventoryPanel.classList.add('is-hidden');
      this.hideInventoryTooltip();
      this.elements.inventoryToggleButton.textContent = 'Bag';
      return;
    }

    this.elements.inventoryToggleButton.textContent = this.inventoryOpen ? 'Close' : 'Bag';
  }

  updateInventory(items: InventoryViewItem[]): void {
    items.forEach((item) => {
      this.inventoryItems.set(item.cropType, item);
    });

    this.renderInventoryGrid();

    if (this.activeSlotIndex !== null) {
      const activeCrop = this.slotCrops[this.activeSlotIndex];
      if (!activeCrop) {
        this.hideInventoryTooltip();
        this.activeSlotIndex = null;
      }
    }
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

  private bindDomListeners(): void {
    this.elements.inventoryToggleButton.addEventListener('click', () => {
      if (!this.inventoryEnabled) {
        return;
      }

      this.inventoryOpen = !this.inventoryOpen;
      this.elements.inventoryPanel.classList.toggle('is-hidden', !this.inventoryOpen);
      this.elements.inventoryToggleButton.textContent = this.inventoryOpen ? 'Close' : 'Bag';

      if (!this.inventoryOpen) {
        this.hideInventoryTooltip();
      }
    });

    this.elements.inventoryGrid.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const slot = target.closest<HTMLButtonElement>('.bag-slot');
      if (!slot) {
        return;
      }

      const index = Number(slot.dataset.index ?? '-1');
      if (Number.isNaN(index) || index < 0 || index >= SLOT_COUNT) {
        return;
      }

      const crop = this.slotCrops[index];
      if (!crop) {
        this.activeSlotIndex = null;
        this.hideInventoryTooltip();
        this.renderInventoryGrid();
        return;
      }

      const item = this.inventoryItems.get(crop);
      if (!item || item.count <= 0) {
        this.activeSlotIndex = null;
        this.hideInventoryTooltip();
        this.renderInventoryGrid();
        return;
      }

      // Clicking the same filled slot toggles the tooltip off.
      if (this.activeSlotIndex === index && !this.elements.inventoryTooltip.classList.contains('is-hidden')) {
        this.activeSlotIndex = null;
        this.hideInventoryTooltip();
        this.renderInventoryGrid();
        return;
      }

      const clickedSlotRect = slot.getBoundingClientRect();
      this.activeSlotIndex = index;
      this.renderInventoryGrid();
      this.showInventoryTooltip(clickedSlotRect, item);
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

      this.hideInventoryTooltip();
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

    if (this.activeSlotIndex !== null && !this.slotCrops[this.activeSlotIndex]) {
      this.activeSlotIndex = null;
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
        if (this.activeSlotIndex === i) {
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

  private showInventoryTooltip(slotRect: DOMRect, item: InventoryViewItem): void {
    this.elements.inventoryTooltipTitle.textContent = item.label;
    this.elements.inventoryTooltipCount.textContent = `Qty ${item.count}`;
    this.elements.inventoryTooltipDesc.textContent = item.description;
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
