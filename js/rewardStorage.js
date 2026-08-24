/* ----------------------------
   Belohnungssystem: Persistenz (localStorage)
   ----------------------------
   Eigener, von STATE (js/state.js) getrennter Key - Game.saveState()/
   loadState() persistieren STATE roh und unversioniert; Sticker/
   Meilensteine bekommen hier bewusst ein eigenes, versioniertes Schema
   samt Migrationsfunktion, statt diese Komplexität in den fragilen
   STATE-Merge hineinzumischen.

   Späteres Backend-Andocken: RewardStorage.load()/save() wären die
   einzigen Stellen, die durch einen API-Aufruf ersetzt werden müssten -
   RewardSystem kennt nur diese beiden Funktionen, nicht localStorage selbst. */

export const REWARD_SCHEMA_VERSION = 1;
const STORAGE_KEY = 'buchstabinoZahlofantRewards';

const REWARD_MODES = ['count', 'arithmetic', 'lettersHear', 'lettersFind', 'lettersDraw'];

function defaultRewards() {
  const milestonesReached = {};
  REWARD_MODES.forEach(mode => {
    milestonesReached[mode] = { m3: 0, m5: 0, m10: 0 };
  });
  return {
    version: REWARD_SCHEMA_VERSION,
    unlockedStickers: [],
    milestonesReached,
    progress: { totalCorrectAllTime: 0 }
  };
}

// Unbekannte/zukünftige Version oder Alt-Daten ohne Versionsfeld: verwerfen
// statt zu raten, was gemeint war - sicherer als ein Schema-Upgrade zu
// erfinden, das nie getestet wurde.
function migrate(raw) {
  if (!raw || typeof raw !== 'object' || raw.version !== REWARD_SCHEMA_VERSION) {
    return defaultRewards();
  }
  // Fehlende Teilstrukturen (z.B. nach manuellem Editieren) robust auffüllen.
  const fallback = defaultRewards();
  return {
    version: REWARD_SCHEMA_VERSION,
    unlockedStickers: Array.isArray(raw.unlockedStickers) ? raw.unlockedStickers : [],
    milestonesReached: { ...fallback.milestonesReached, ...(raw.milestonesReached || {}) },
    progress: { ...fallback.progress, ...(raw.progress || {}) }
  };
}

// Privatmodus/deaktiviertes localStorage darf das Spiel nicht zum Absturz
// bringen - es läuft dann eben ohne Speicherung weiter (In-Memory pro Session).
function storageIsAvailable() {
  try {
    const testKey = '__bz_storage_test__';
    localStorage.setItem(testKey, '1');
    localStorage.removeItem(testKey);
    return true;
  } catch (e) {
    return false;
  }
}
const STORAGE_AVAILABLE = storageIsAvailable();

export const RewardStorage = {
  load() {
    if (!STORAGE_AVAILABLE) return defaultRewards();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultRewards();
      return migrate(JSON.parse(raw));
    } catch (e) {
      console.warn('RewardStorage: konnte Daten nicht laden, starte neu', e);
      return defaultRewards();
    }
  },

  save(data) {
    if (!STORAGE_AVAILABLE) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('RewardStorage: konnte Daten nicht speichern', e);
    }
  }
};
