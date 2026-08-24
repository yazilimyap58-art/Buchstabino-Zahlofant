/* ----------------------------
   Belohnungssystem: rundenlokaler Streak, Meilensteine, Sticker
   ----------------------------
   Kennt kein DOM - reagiert nur auf recordCorrect()/recordWrong()-Aufrufe
   aus Game.handleCorrect()/handleWrong()/LetterDraw.handleNext() und
   emittiert Events für rewardUI.js (Album, Pflanzen-Fortschritt). */
import { GameEvents } from './gameEvents.js';
import { RewardStorage } from './rewardStorage.js';

export const MODE_LABELS = {
  count: 'Zählen',
  arithmetic: 'Rechnen',
  lettersHear: 'Hören',
  lettersFind: 'Finden',
  lettersDraw: 'Zeichnen'
};

// Sticker-Katalog: pro Modus ein Sticker für 3/5/10 in Folge. Emojis statt
// neuer Grafik-Assets (siehe Plan) - jede weitere 5er-Stufe (15, 20 ...)
// zählt intern mit (Elternbereich-Statistik), schaltet aber keinen neuen
// Sticker mehr frei.
const MODE_EMOJI_TIERS = {
  count: ['🔢', '⭐', '🏆'],
  arithmetic: ['➕', '🧮', '🏆'],
  lettersHear: ['👂', '🔤', '🏆'],
  lettersFind: ['🔍', '🔤', '🏆'],
  lettersDraw: ['✏️', '📝', '🏆']
};
const TIERS = [3, 5, 10];

function buildStickerCatalog() {
  const catalog = {};
  Object.keys(MODE_LABELS).forEach(mode => {
    catalog[mode] = {};
    TIERS.forEach((tier, i) => {
      catalog[mode][tier] = {
        id: `${mode}_m${tier}`,
        mode,
        tier,
        emoji: MODE_EMOJI_TIERS[mode][i],
        label: `${MODE_LABELS[mode]}: ${tier} in Folge`
      };
    });
  });
  return catalog;
}
export const STICKER_CATALOG = buildStickerCatalog();

function isMilestone(n) {
  return n === 3 || n === 5 || (n >= 10 && n % 5 === 0);
}

// n=15,20,25... nutzen weiterhin die Stufe-10-Timing/Intensität (siehe
// timings.js celebrateTier()) und keinen neuen Sticker.
function tierFor(n) {
  if (n === 3) return 3;
  if (n === 5) return 5;
  return 10;
}

// Rundenlokal, NICHT persistiert - komplett getrennt von STATE.streak
// (treibt weiterhin unverändert den Fortschrittsring im Header).
let roundStreak = 0;

export const RewardSystem = {
  // Gibt { streakLocal, milestoneLevel: 3|5|10|null, newStickerId } zurück,
  // damit Game.handleCorrect() synchron zwischen Mascot.cheer()/
  // Mascot.celebrate(level) wählen kann.
  recordCorrect(mode) {
    roundStreak++;
    const milestoneLevel = isMilestone(roundStreak) ? tierFor(roundStreak) : null;
    let newStickerId = null;

    const data = RewardStorage.load();
    data.progress.totalCorrectAllTime++;

    if (milestoneLevel && data.milestonesReached[mode]) {
      data.milestonesReached[mode][`m${milestoneLevel}`]++;
      const sticker = STICKER_CATALOG[mode]?.[milestoneLevel];
      if (sticker && !data.unlockedStickers.includes(sticker.id)) {
        data.unlockedStickers.push(sticker.id);
        newStickerId = sticker.id;
      }
    }

    RewardStorage.save(data);

    GameEvents.emit('reward:correct', { mode, streakLocal: roundStreak });
    if (milestoneLevel) GameEvents.emit('reward:milestone', { mode, level: milestoneLevel, streakLocal: roundStreak });
    if (newStickerId) GameEvents.emit('reward:sticker-unlocked', { stickerId: newStickerId, mode });
    GameEvents.emit('reward:progress-changed', { totalCorrectAllTime: data.progress.totalCorrectAllTime });

    return { streakLocal: roundStreak, milestoneLevel, newStickerId };
  },

  // Stiller Reset, keine sichtbare UI-Änderung (kein Streak-verloren-Text,
  // keine traurige Pose - das übernimmt weiterhin Mascot.encourage()).
  recordWrong(mode) {
    roundStreak = 0;
    GameEvents.emit('reward:wrong', { mode });
    return { streakLocal: 0 };
  },

  // Bei jedem Rundenstart (Game.selectMode()/restartGame()) aufzurufen,
  // damit der Streak wirklich rundenlokal bleibt.
  resetRound() {
    roundStreak = 0;
  },

  getProgressSnapshot() {
    return RewardStorage.load().progress;
  },

  getMilestoneStats() {
    return RewardStorage.load().milestonesReached;
  },

  // Flache Liste aller Sticker (freigeschaltet + noch verschlossen) für
  // das Album - verschlossene bekommen ihr Emoji als Silhouette, kein
  // "noch nicht geschafft"-Text (siehe rewardUI.js).
  getStickerAlbum() {
    const data = RewardStorage.load();
    const all = [];
    Object.values(STICKER_CATALOG).forEach(tiers => {
      Object.values(tiers).forEach(sticker => {
        all.push({ ...sticker, unlocked: data.unlockedStickers.includes(sticker.id) });
      });
    });
    return all;
  }
};
