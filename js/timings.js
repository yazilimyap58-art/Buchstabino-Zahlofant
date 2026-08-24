/* ----------------------------
   Belohnungssystem: zentrale Zeit-Konstanten
   ----------------------------
   Alle Dauern für die Maskottchen-Zustandsmaschine (cheer/celebrate/
   encourage, siehe js/mascot.js) an einer Stelle, damit sie sich nach dem
   ersten Test mit dem Kind ohne Dateisuche nachjustieren lassen. */

export const TIMINGS = {
  // == heutiger, unveränderter Normalfall (Game.handleCorrect() vor der
  // Erweiterung): flightMs 550 + holdMs 1700 (überlappt mit Konfetti
  // <=2200ms) + Rückflug (~flightMs+50) - gemessene Klick-bis-nächste-
  // Aufgabe-Dauer ca. 2.8-3.5s. Referenzwert für die Budgets unten: 3.0s.
  CHEER: { holdMs: 1700, flightMs: 550, confettiTimeoutMs: 2200 },

  // Herz-Feier bei Streak-Meilensteinen. holdMs wächst nur leicht ggü.
  // CHEER (die Herzen laufen INNERHALB des Hold-Fensters, nicht als
  // zusätzliche sequentielle Phase - siehe Mascot.celebrate()), damit das
  // Zeitbudget (max. +0.5s/+1s/+1.5s ggü. der normalen Antwort) eingehalten
  // wird, obwohl der Herz-Schwarm selbst länger sichtbar ist.
  CELEBRATE: {
    3: { holdMs: 1900, flightMs: 550, confettiTimeoutMs: 2200, heartsMs: 1200, heartsTimeoutMs: 1400 },
    5: { holdMs: 2300, flightMs: 550, confettiTimeoutMs: 2200, heartsMs: 1800, heartsTimeoutMs: 2000 },
    10: { holdMs: 2800, flightMs: 550, confettiTimeoutMs: 2200, heartsMs: 2500, heartsTimeoutMs: 2700 }
  },

  // == heutiger, unveränderter Falsch-Antwort-Auftritt (Game.handleWrong()).
  ENCOURAGE: { holdMs: 1300, flightMs: 500 },
  // == heutige, unveränderte Wiederaktivierung der übrigen Optionen.
  WRONG_RETRY_ENABLE_MS: 800,

  // Sticker-Album/Eltern-Bereich: In-Place-Pose-Wechsel ohne Bühnenflug
  // (siehe Mascot.reward()), nicht an eine Antwort gebunden.
  REWARD_POSE_HOLD_MS: 1400,
  // Eltern-Gate: so lange muss der "Für Eltern"-Button gehalten werden.
  PARENT_GATE_HOLD_MS: 2000
};

// Jede weitere 5er-Stufe über 10 hinaus (15, 20, 25 ...) nutzt dieselbe
// Timing/Intensität wie Stufe 10 weiter - kein Deckel, aber auch keine
// zusätzliche Eskalation.
export function celebrateTier(level) {
  const tier = level >= 10 ? 10 : level;
  return TIMINGS.CELEBRATE[tier] || TIMINGS.CELEBRATE[3];
}

export function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
