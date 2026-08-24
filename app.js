// ============================
// 🧮 Buchstabino & Zahlofant – App Entry
// Vanilla JS Game Engine
// ============================
import { CONFIG } from './js/config.js';
import { STATE } from './js/state.js';
import { TTS } from './js/tts.js';
import { Confetti } from './js/confetti.js';
import { Game } from './js/game.js';
import { LetterDraw } from './js/letterDraw.js';
import { initLayoutChrome } from './js/layoutChrome.js';

/* ----------------------------
   Initialization
   ---------------------------- */
function initGame() {
  // Initialize confetti
  Confetti.init();

  // Initialize game
  Game.init();
  LetterDraw.init();
  initLayoutChrome();

  // Expose for debugging
  window.Game = Game;
  window.State = STATE;
  window.Config = CONFIG;
  window.Confetti = Confetti;
  window.TTS = TTS;
  window.LetterDraw = LetterDraw;
}

// Start when DOM loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGame);
} else {
  initGame();
}
