/* ----------------------------
   Belohnungssystem: Sticker-Album, Pflanzen-Fortschritt, Eltern-Bereich
   ----------------------------
   Hört nur auf GameEvents/liest RewardSystem - kennt keine Spiellogik. */
import { EL } from './dom.js';
import { GameEvents } from './gameEvents.js';
import { RewardSystem, MODE_LABELS } from './rewardSystem.js';
import { TIMINGS } from './timings.js';
import { Game } from './game.js';

// Kindgerechte Fortschrittsanzeige statt Prozentzahl: eine Pflanze wächst
// mit der Gesamtzahl richtiger Antworten (nie gegen andere Kinder, immer
// nur gegen die eigene Vorgeschichte).
const PLANT_STAGES = ['🌱', '🌿', '🪴', '🌻', '🌳'];
const PLANT_THRESHOLDS = [0, 10, 30, 60, 100];

function plantStageFor(total) {
  let stage = PLANT_STAGES[0];
  for (let i = 0; i < PLANT_THRESHOLDS.length; i++) {
    if (total >= PLANT_THRESHOLDS[i]) stage = PLANT_STAGES[i];
  }
  return stage;
}

export const RewardUI = {
  init() {
    EL.btnOpenAlbum?.addEventListener('click', () => this.openAlbum());

    // Album im Hintergrund aktuell halten, auch während gerade nicht
    // sichtbar - kostet nichts (reines Neu-Rendern kleiner DOM-Bereiche)
    // und das Album zeigt beim nächsten Öffnen sofort den aktuellen Stand.
    GameEvents.on('reward:progress-changed', () => this.renderPlant());
    GameEvents.on('reward:sticker-unlocked', () => this.renderStickers());

    this.bindParentGate();
    this.renderPlant();
    this.renderStickers();
  },

  openAlbum() {
    this.renderPlant();
    this.renderStickers();
    Game.showScreen('sticker-album');
  },

  renderPlant() {
    if (!EL.progressPlantStage) return;
    const { totalCorrectAllTime } = RewardSystem.getProgressSnapshot();
    EL.progressPlantStage.textContent = plantStageFor(totalCorrectAllTime);
  },

  renderStickers() {
    if (!EL.stickerGrid) return;
    const album = RewardSystem.getStickerAlbum();
    EL.stickerGrid.innerHTML = '';
    album.forEach(sticker => {
      const el = document.createElement('div');
      el.className = `sticker ${sticker.unlocked ? 'sticker--unlocked' : 'sticker--locked'}`;
      el.setAttribute('role', 'listitem');
      el.setAttribute('aria-label', sticker.unlocked ? sticker.label : 'Noch nicht freigeschaltet');
      el.innerHTML = `<span class="sticker__emoji" aria-hidden="true">${sticker.emoji}</span>`;
      EL.stickerGrid.appendChild(el);
    });
  },

  // 2-Sekunden-Halten statt Lesen/Rechnen - einfache, aber verlässliche
  // Hürde gegen versehentliches/kindliches Antippen.
  bindParentGate() {
    if (!EL.btnParentGate) return;
    let holdTimer = null;
    const start = () => {
      holdTimer = setTimeout(() => this.openParentArea(), TIMINGS.PARENT_GATE_HOLD_MS);
    };
    const cancel = () => {
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
    };
    EL.btnParentGate.addEventListener('pointerdown', start);
    EL.btnParentGate.addEventListener('pointerup', cancel);
    EL.btnParentGate.addEventListener('pointerleave', cancel);
    EL.btnParentGate.addEventListener('pointercancel', cancel);

    EL.btnParentClose?.addEventListener('click', () => EL.parentModal.close());
  },

  openParentArea() {
    if (!EL.parentModal || !EL.parentStats) return;
    const stats = RewardSystem.getMilestoneStats();
    const { totalCorrectAllTime } = RewardSystem.getProgressSnapshot();

    const rows = Object.entries(stats).map(([mode, tiers]) => `
      <div class="parent-stats__row">
        <strong>${MODE_LABELS[mode] || mode}:</strong>
        3er ${tiers.m3}× · 5er ${tiers.m5}× · 10er+ ${tiers.m10}×
      </div>
    `).join('');

    EL.parentStats.innerHTML = `
      ${rows}
      <div class="parent-stats__total"><strong>Insgesamt richtig beantwortet:</strong> ${totalCorrectAllTime}</div>
    `;
    EL.parentModal.showModal();
  }
};
