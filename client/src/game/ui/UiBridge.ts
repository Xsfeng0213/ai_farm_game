import type { UiControls } from '../types/game';
import { PLAYER_SKINS, type PlayerSkin } from '../types/playerSkin';

interface UiElements {
  roomLabel: HTMLElement;
  coinsLabel: HTMLElement;
  hintLabel: HTMLElement;
  chatList: HTMLElement;
  chatInput: HTMLInputElement;
  sendButton: HTMLButtonElement;
  emojiButtons: NodeListOf<HTMLButtonElement>;
  skinButtons: NodeListOf<HTMLButtonElement>;
}

export class DomUiBridge implements UiControls {
  private readonly elements: UiElements;
  private sendHandler: ((message: string) => void) | null = null;
  private emojiHandler: ((emoji: string) => void) | null = null;
  private skinHandler: ((skin: PlayerSkin) => void) | null = null;

  constructor(elements: UiElements) {
    this.elements = elements;
    this.bindDomListeners();
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
  }

  showHint(message: string): void {
    this.elements.hintLabel.textContent = message;
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
}
