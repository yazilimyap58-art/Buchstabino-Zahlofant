// ============================
// 🧮 Buchstabino & Zahlofant – App Entry
// Vanilla JS Game Engine
// ============================
import { CONFIG } from './js/config.js';
import { STATE } from './js/state.js';
import { TTS } from './js/tts.js';
import { Confetti } from './js/confetti.js';
import { Celebration } from './js/celebration.js';
import { Game } from './js/game.js';
import { TraceDraw } from './js/traceDraw.js';
import { RewardUI } from './js/rewardUI.js';
import { initLayoutChrome } from './js/layoutChrome.js';

/* ----------------------------
   Initialization
   ---------------------------- */
function initGame() {
  // Initialize confetti + Herz-Feier-Canvas
  Confetti.init();
  Celebration.init();

  // Initialize game
  Game.init();
  TraceDraw.init();
  RewardUI.init();
  initLayoutChrome();

  // Expose for debugging
  window.Game = Game;
  window.State = STATE;
  window.Config = CONFIG;
  window.Confetti = Confetti;
  window.TTS = TTS;
  window.TraceDraw = TraceDraw;
  window.RewardUI = RewardUI;
}

// Start when DOM loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGame);
} else {
  initGame();
}
