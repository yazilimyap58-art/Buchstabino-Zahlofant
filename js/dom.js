/* ----------------------------
   DOM Elements
   ---------------------------- */
export const EL = {
  // Screens
  screenCategorySelect: document.getElementById('screen-category-select'),
  screenModeSelect: document.getElementById('screen-mode-select'),
  screenLettersModeSelect: document.getElementById('screen-letters-mode-select'),
  screenGame: document.getElementById('screen-game'),
  screenLetterDraw: document.getElementById('screen-letter-draw'),
  screenStickerAlbum: document.getElementById('screen-sticker-album'),
  categoryCards: document.querySelectorAll('.category-card'),
  modeCards: document.querySelectorAll('.mode-card[data-mode]'),
  btnsBackToCategories: document.querySelectorAll('.btn-back-category'),

  // Sticker-Album (Belohnungssystem, siehe js/rewardSystem.js)
  btnStickerAlbum: document.getElementById('btn-sticker-album'),
  albumLettersGrid: document.getElementById('album-letters-grid'),
  albumNumbersGrid: document.getElementById('album-numbers-grid'),
  albumMilestonesGrid: document.getElementById('album-milestones-grid'),

  // Mascots
  mascotCategoryLetters: document.getElementById('mascot-category-letters'),
  mascotCategoryNumbers: document.getElementById('mascot-category-numbers'),
  mascotModeSelect: document.getElementById('mascot-mode-select'),
  mascotLettersModeSelect: document.getElementById('mascot-letters-mode-select'),
  mascotGame: document.getElementById('mascot-game'),
  mascotDraw: document.getElementById('mascot-draw'),

  // Header
  progressBar: document.querySelector('.progress-bar'),
  levelBadge: document.querySelector('.level-badge'),
  streakCount: document.querySelector('.streak-count'),

  // Task area
  motifStage: document.getElementById('motif-stage'),
  taskQuestion: document.getElementById('task-question'),

  // Options
  optionsContainer: document.querySelector('.options-container'),
  optionButtons: document.querySelectorAll('.option-btn'),

  // Feedback
  feedbackArea: document.querySelector('.feedback-area'),
  feedbackMessage: document.getElementById('feedback-message'),

  // Controls
  btnMenu: document.getElementById('btn-menu'),
  btnRepeat: document.getElementById('btn-repeat'),
  btnHelp: document.getElementById('btn-help'),
  btnPause: document.getElementById('btn-pause'),

  // Pause modal
  pauseModal: document.getElementById('pause-modal'),
  pauseStats: document.getElementById('pause-stats'),
  btnResume: document.getElementById('btn-resume'),
  btnRestart: document.getElementById('btn-restart'),

  // Zeichnen-Screen
  drawQuestion: document.getElementById('draw-question'),
  drawGuideCanvas: document.getElementById('draw-guide-canvas'),
  drawInkCanvas: document.getElementById('draw-ink-canvas'),
  drawStars: document.getElementById('draw-stars'),
  drawHelpMarker: document.getElementById('draw-help-marker'),
  btnDrawMenu: document.getElementById('btn-draw-menu'),
  btnDrawClear: document.getElementById('btn-draw-clear'),
  btnDrawRepeat: document.getElementById('btn-draw-repeat'),
  btnDrawHelp: document.getElementById('btn-draw-help'),
  btnDrawNext: document.getElementById('btn-draw-next')
};
