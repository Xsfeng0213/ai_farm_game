import './styles.css';
import { startGame } from './game/createGame';
import { DomUiBridge } from './game/ui/UiBridge';

const DEFAULT_ROOM_ID = 'lobby-1';
const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3000';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('Missing #app root element');
}

app.innerHTML = `
  <div class="game-shell">
    <div id="game-mount" class="game-canvas"></div>

    <div class="hud-layer">
      <section class="pixel-frame hud-top">
        <div class="hud-brand">AI FARM PUBLIC SPACE</div>
        <div id="room-label" class="room-label">Room -</div>
        <div id="coins-label" class="coins-label">Coins 0</div>
      </section>

      <section class="pixel-frame skin-panel">
        <div class="skin-title">Skin</div>
        <button type="button" data-skin="skin1" class="active">Style A</button>
        <button type="button" data-skin="skin2">Style B</button>
        <button type="button" data-skin="skin3">Style C</button>
      </section>

      <section class="pixel-frame hint-bar">
        <span id="hint-label" class="hint-label">Input nickname to enter</span>
      </section>

      <section id="chat-panel" class="pixel-frame chat-panel">
        <div class="chat-head-row">
          <div class="chat-header">Lobby Chat</div>
          <button id="chat-toggle-btn" class="chat-toggle-btn" type="button">Hide</button>
        </div>
        <div id="chat-list" class="chat-list"></div>
        <div class="chat-row">
          <input id="chat-input" type="text" maxlength="120" placeholder="Say something..." />
          <button id="send-btn" type="button">Send</button>
        </div>
        <div class="emoji-row">
          <button type="button" data-emoji="😀">😀</button>
          <button type="button" data-emoji="☕">☕</button>
          <button type="button" data-emoji="🎉">🎉</button>
        </div>
      </section>
    </div>

    <div id="login-overlay" class="login-overlay">
      <div class="pixel-frame login-card">
        <h1>Pixel Lobby</h1>
        <p>Enter nickname and join the online space</p>
        <input id="nickname-input" type="text" maxlength="16" placeholder="Nickname" />
        <button id="join-btn" type="button">Enter Lobby</button>
      </div>
    </div>
  </div>
`;

const roomLabel = document.querySelector<HTMLElement>('#room-label');
const coinsLabel = document.querySelector<HTMLElement>('#coins-label');
const hintLabel = document.querySelector<HTMLElement>('#hint-label');
const chatList = document.querySelector<HTMLElement>('#chat-list');
const chatInput = document.querySelector<HTMLInputElement>('#chat-input');
const sendButton = document.querySelector<HTMLButtonElement>('#send-btn');
const chatPanel = document.querySelector<HTMLElement>('#chat-panel');
const chatToggleButton = document.querySelector<HTMLButtonElement>('#chat-toggle-btn');
const emojiButtons = document.querySelectorAll<HTMLButtonElement>('.emoji-row button');
const skinButtons = document.querySelectorAll<HTMLButtonElement>('.skin-panel button');
const gameMount = document.querySelector<HTMLElement>('#game-mount');
const loginOverlay = document.querySelector<HTMLElement>('#login-overlay');
const nicknameInput = document.querySelector<HTMLInputElement>('#nickname-input');
const joinButton = document.querySelector<HTMLButtonElement>('#join-btn');

if (
  !roomLabel ||
  !coinsLabel ||
  !hintLabel ||
  !chatList ||
  !chatInput ||
  !sendButton ||
  !chatPanel ||
  !chatToggleButton ||
  !gameMount ||
  !loginOverlay ||
  !nicknameInput ||
  !joinButton ||
  skinButtons.length === 0
) {
  throw new Error('UI elements are missing');
}

const ui = new DomUiBridge({
  roomLabel,
  coinsLabel,
  hintLabel,
  chatList,
  chatInput,
  sendButton,
  chatPanel,
  chatToggleButton,
  emojiButtons,
  skinButtons
});

let gameStarted = false;

const joinGame = (): void => {
  if (gameStarted) {
    return;
  }

  const nickname = nicknameInput.value.trim();
  if (!nickname) {
    hintLabel.textContent = 'Please enter nickname';
    nicknameInput.focus();
    return;
  }

  const game = startGame({
    mount: gameMount,
    nickname,
    roomId: DEFAULT_ROOM_ID,
    serverUrl: SERVER_URL,
    ui
  });
  (window as Window & { __AI_FARM_GAME__?: unknown }).__AI_FARM_GAME__ = game;

  gameStarted = true;
  loginOverlay.classList.add('hidden');
  hintLabel.textContent = 'Move with WASD / Arrow keys';
};

joinButton.addEventListener('click', joinGame);
nicknameInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    joinGame();
  }
});
