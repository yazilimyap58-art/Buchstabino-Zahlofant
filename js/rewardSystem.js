import { CONFIG } from './config.js';

/* ----------------------------
   Belohnungssystem (Sticker & Meilensteine)
   ----------------------------
   Eigenständiges, wiederverwendbares Modul - jedes Minispiel ruft nur
   RewardSystem.recordCorrect(modeId, { streak, letter/number }) bei einer
   validierten richtigen Antwort auf (streak = STATE.streak NACH dem
   Hochzählen); das Modul entscheidet selbst, ob dadurch ein Sticker
   freigeschaltet wird, und liefert die neu freigeschalteten Sticker zurück,
   damit der Aufrufer RewardSystem.trigger('sticker', sticker) für die
   Feier-Animation aufrufen kann. Zwei unabhängige Freischalt-Wege:
   Meilenstein alle 5 Richtige IN FOLGE (siehe MILESTONE_INTERVAL) und
   Buchstaben-/Zahlen-"Meisterschaft" nach 5 Erkennungen DESSELBEN Ziels
   (siehe MASTERY_THRESHOLD) - letzteres ist bewusst zusätzlich zum
   Streak-Meilenstein da, nicht als Ersatz dafür.

   Bewusst ENTKOPPELT von STATE/js/state.js (eigener localStorage-Key statt
   in `buchstabinoZahlofant` mitgespeichert): STATE.streak/totalCorrect
   werden vom "Neu starten"-Button im Pause-Modal auf 0 zurückgesetzt (siehe
   Game.restartGame()) - Sticker/Meilensteine sollen davon nicht betroffen
   sein, sie sollen als dauerhafte Erfolge bestehen bleiben.

   Persistenz aktuell nur localStorage (kein Login-System vorausgesetzt).
   Für eine spätere Backend-Anbindung (z.B. geräteübergreifender Fortschritt)
   wäre load()/save() die Stelle, die gegen eine API statt localStorage
   ausgetauscht werden müsste - die restliche Modul-API (recordCorrect/
   trigger/getAlbumView/getModeProgress) bliebe unverändert.
*/
const STORAGE_KEY = 'buchstabinoZahlofantRewards';
// Gleiche Basis wie js/mascot.js (dort nicht exportiert, deshalb hier
// dupliziert statt importiert - vermeidet eine unnötige Kopplung an das
// Mascot-Modul nur für einen Pfad-String).
const MASCOT_BASE = 'assets/mascots/buchstabino_zahlofant_assets/svg/';
const HEART_EMOJI = ['❤️', '🧡', '💛', '💚', '💙', '💜', '🩷'];

// Alle X richtige Antworten IN FOLGE in einem Modus (STATE.streak, siehe
// game.js - persistiert über die laufende Spielsitzung, wird NICHT bei
// falschen Antworten zurückgesetzt, siehe CLAUDE.md "nie bestrafend", nur
// beim Moduswechsel/Neustart) gibt es einen Meilenstein-Sticker. Damit ein
// zurückliegender Sitzungsneustart schon erreichte Meilensteine nicht
// "vergisst", wird nicht der aktuelle Streak-Wert direkt geprüft, sondern
// der JE ERREICHTE BESTWERT pro Modus (siehe recordCorrect()) - so bleibt
// die Sticker-Vergabe dauerhaft und einmalig pro Stufe, wächst aber genau
// dann, wenn das Kind eine neue persönliche Bestserie erreicht.
const MILESTONE_INTERVAL = 5;
// Ab X richtigen Erkennungen desselben Buchstabens/derselben Zahl gilt er/sie
// als "gemeistert" und schaltet einen eigenen Sticker frei.
const MASTERY_THRESHOLD = 5;

function defaultData() {
  return {
    // Chronologische Liste bereits freigeschalteter Sticker-IDs (dient auch
    // als "schon vergeben?"-Prüfung, siehe unlockOnce()).
    unlockedStickers: [],
    progress: {
      modeMilestoneCount: {}, // { [modeId]: bester je erreichter Streak (STATE.streak) }
      letters: {},            // { [buchstabe_klein]: Anzahl richtiger Erkennungen }
      numbers: {}             // { [zahl]: Anzahl richtiger Erkennungen }
    }
  };
}

export const RewardSystem = {
  MILESTONE_INTERVAL,
  MASTERY_THRESHOLD,

  data: null,
  _toastQueue: [],
  _toastPlaying: false,

  load() {
    if (this.data) return this.data;
    let parsed = null;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) parsed = JSON.parse(saved);
    } catch (e) {
      console.warn('Could not parse reward data', e);
    }
    this.data = Object.assign(defaultData(), parsed);
    // Nested Objekte einzeln mergen (Object.assign ist nur flach) - fehlende
    // Unterobjekte in alten/gekürzten Speicherständen sollen nicht die
    // gesamte progress-Struktur ersetzen.
    this.data.progress = Object.assign(defaultData().progress, parsed && parsed.progress);
    return this.data;
  },

  save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
  },

  // Schaltet `id` frei, falls noch nicht geschehen. Gibt das Sticker-Meta
  // zurück, wenn es NEU freigeschaltet wurde, sonst null (Aufrufer soll die
  // Feier-Animation nur bei echten Neu-Unlocks zeigen).
  _unlockOnce(id, meta) {
    if (this.data.unlockedStickers.includes(id)) return null;
    this.data.unlockedStickers.push(id);
    return { id, ...meta };
  },

  // Zahlen-Modi zeigen Zahlofant im Kopf, Buchstaben-Modi Buchstabino (siehe
  // Game.mascotCharacter()) - dieselbe Zuordnung hier, damit die große
  // Sticker-Feier (siehe _playNextToast()) die zum Sticker passende Figur
  // zeigt statt immer dieselbe.
  _milestoneMeta(modeId, tier) {
    const modeCfg = CONFIG.modes[modeId];
    const isNumberMode = modeId === 'count' || modeId === 'arithmetic';
    return {
      kind: 'milestone',
      emoji: modeCfg ? modeCfg.icon : '⭐',
      title: modeCfg ? `${modeCfg.name} Level ${tier}` : `Level ${tier}`,
      character: isNumberMode ? 'zahlofant' : 'buchstabino'
    };
  },

  _letterMeta(lower) {
    const letterCfg = CONFIG.letters.find(l => l.lower === lower);
    return {
      kind: 'letter',
      emoji: letterCfg ? letterCfg.emoji : '🔤',
      title: letterCfg ? letterCfg.upper : lower.toUpperCase(),
      display: letterCfg ? letterCfg.upper : lower.toUpperCase(),
      character: 'buchstabino'
    };
  },

  _numberMeta(n) {
    return {
      kind: 'number',
      emoji: '🔢',
      title: `Zahl ${n}`,
      display: String(n),
      character: 'zahlofant'
    };
  },

  // Von einem Minispiel bei JEDER validierten richtigen Antwort aufzurufen
  // (nicht bei "Hilfe" - siehe CLAUDE.md, Hilfe wählt nichts automatisch aus
  // und zählt nirgends mit). `meta`:
  //  - { streak } PFLICHT für die Meilenstein-Prüfung - der aktuelle
  //    STATE.streak-Wert NACH dem Hochzählen der richtigen Antwort (siehe
  //    game.js handleCorrect()/letterDraw.js handleNext()).
  //  - { letter: 'a' } für Buchstaben-Erkennung (lettersHear/lettersFind/lettersDraw)
  //  - { number: 3 } für Zahlen-Erkennung (aktuell nur count-Modus, da dort
  //    "die gezeigte Zahl" eindeutig ist - bei arithmetic wäre unklar, ob das
  //    Ergebnis oder eine der beiden Ausgangszahlen gemeint ist)
  // Gibt ein Array neu freigeschalteter Sticker-Metas zurück (meist leer).
  recordCorrect(modeId, meta = {}) {
    this.load();
    const unlocked = [];

    // Nur bei einer NEUEN persönlichen Bestserie prüfen/freischalten (siehe
    // MILESTONE_INTERVAL-Kommentar) - ein `streak`, der den bisherigen
    // Bestwert nicht übertrifft (z.B. nach einem Moduswechsel wieder von 0
    // hochzählend), löst nichts erneut aus.
    const prevBest = this.data.progress.modeMilestoneCount[modeId] || 0;
    const streak = meta.streak || 0;
    if (streak > prevBest) {
      this.data.progress.modeMilestoneCount[modeId] = streak;
      const prevTier = Math.floor(prevBest / MILESTONE_INTERVAL);
      const newTier = Math.floor(streak / MILESTONE_INTERVAL);
      if (newTier > prevTier) {
        const s = this._unlockOnce(`milestone_${modeId}_${newTier}`, this._milestoneMeta(modeId, newTier));
        if (s) unlocked.push(s);
      }
    }

    if (meta.letter) {
      const key = meta.letter.toLowerCase();
      const c = (this.data.progress.letters[key] = (this.data.progress.letters[key] || 0) + 1);
      if (c === MASTERY_THRESHOLD) {
        const s = this._unlockOnce(`buchstabe_${key}`, this._letterMeta(key));
        if (s) unlocked.push(s);
      }
    }

    if (meta.number !== undefined && meta.number !== null) {
      const key = String(meta.number);
      const c = (this.data.progress.numbers[key] = (this.data.progress.numbers[key] || 0) + 1);
      if (c === MASTERY_THRESHOLD) {
        const s = this._unlockOnce(`zahl_${key}`, this._numberMeta(key));
        if (s) unlocked.push(s);
      }
    }

    this.save();
    return unlocked;
  },

  // Wie weit ist die beste je erreichte Serie in diesem Modus bis zum
  // nächsten Meilenstein-Sticker? Für eine eventuelle Fortschrittsanzeige
  // pro Minispiel.
  getModeProgress(modeId) {
    this.load();
    const count = this.data.progress.modeMilestoneCount[modeId] || 0;
    return { current: count % MILESTONE_INTERVAL, target: MILESTONE_INTERVAL };
  },

  // Datengrundlage fürs Sticker-Album: feste Buchstaben-/Zahlen-Slots
  // (gemeistert oder noch verschlossen) plus die bereits erreichten
  // Meilenstein-Sticker (deren Zahl ist prinzipiell unbegrenzt, deshalb kein
  // fester Slot pro Tier).
  getAlbumView() {
    this.load();
    const letters = CONFIG.letters.map(l => ({
      id: `buchstabe_${l.lower}`,
      unlocked: this.data.unlockedStickers.includes(`buchstabe_${l.lower}`),
      ...this._letterMeta(l.lower)
    }));

    // Zahlen-Mastery wird ausschließlich über den Zählen-Modus gemeldet
    // (siehe recordCorrect()-Aufrufer in game.js) - dessen `max` ist daher
    // die richtige Obergrenze fürs Album, nicht CONFIG.modes.arithmetic.max
    // (sonst blieben Zahlen-Slots über count.max dauerhaft unerreichbar).
    const maxNumber = CONFIG.modes.count ? CONFIG.modes.count.max : 5;
    const numbers = [];
    for (let n = 1; n <= maxNumber; n++) {
      const id = `zahl_${n}`;
      numbers.push({ id, unlocked: this.data.unlockedStickers.includes(id), ...this._numberMeta(n) });
    }

    const milestones = this.data.unlockedStickers
      .filter(id => id.startsWith('milestone_'))
      .map(id => {
        const [, modeId, tier] = id.match(/^milestone_(.+)_(\d+)$/) || [];
        return { id, unlocked: true, ...this._milestoneMeta(modeId, tier) };
      });

    return { letters, numbers, milestones };
  },

  // Zeigt die Belohnungs-Animation und gibt ein Promise zurück, das erst
  // aufgelöst wird, wenn die Feier (inkl. Ausblenden) fertig ist - der
  // Aufrufer soll damit den Übergang zur nächsten Aufgabe verzögern (siehe
  // game.js handleCorrect()/letterDraw.js handleNext()), sonst startet die
  // nächste Aufgabe (und deren eigene Sprachausgabe) mitten in der noch
  // laufenden Sticker-Feier statt danach.
  // `type` ist aktuell nur 'sticker', als String-Schalter angelegt (statt
  // direkt eine Funktion), damit sich das Modul später leicht um weitere
  // Belohnungsarten erweitern lässt (z.B. 'levelUp'), ohne die
  // Aufrufer-Signatur zu ändern.
  trigger(type, payload) {
    if (type !== 'sticker' || !payload) return Promise.resolve();
    return new Promise(resolve => {
      this._toastQueue.push({ sticker: payload, resolve });
      this._playNextToast();
    });
  },

  _playNextToast() {
    if (this._toastPlaying || this._toastQueue.length === 0) return;
    this._toastPlaying = true;
    const { sticker, resolve } = this._toastQueue.shift();
    const holdMs = 2200;

    const toast = this._ensureToastEl();
    const mascotEl = toast.querySelector('.sticker-toast__mascot');
    mascotEl.src = `${MASCOT_BASE}${sticker.character || 'buchstabino'}_celebrating.svg`;
    toast.querySelector('.sticker-toast__emoji').textContent = sticker.display || sticker.emoji;
    toast.querySelector('.sticker-toast__title').textContent = sticker.title;
    toast.hidden = false;
    // Reflow erzwingen, bevor die Einblend-Klasse gesetzt wird, sonst greift
    // die CSS-Transition nicht (gleiche Technik wie Mascot.flyTo()'s FLIP).
    toast.getBoundingClientRect();
    toast.classList.add('sticker-toast--visible');

    // Bunte Herzen statt der quadratischen Konfetti aus Confetti.trigger()
    // (die feiert schon jede einzelne richtige Antwort, siehe
    // Game.handleCorrect()) - der Sticker-Unlock ist ein selteneres, größeres
    // Ereignis und soll sich davon optisch abheben.
    this._burstHearts();

    setTimeout(() => {
      toast.classList.remove('sticker-toast--visible');
      setTimeout(() => {
        toast.hidden = true;
        this._toastPlaying = false;
        resolve();
        this._playNextToast();
      }, 350);
    }, holdMs);
  },

  _ensureToastEl() {
    let toast = document.getElementById('sticker-toast');
    if (toast) return toast;
    toast = document.createElement('div');
    toast.id = 'sticker-toast';
    toast.className = 'sticker-toast';
    toast.hidden = true;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.innerHTML = `
      <div class="sticker-toast__card">
        <img class="mascot-img sticker-toast__mascot" data-pose="celebrating" alt="" aria-hidden="true">
        <span class="sticker-toast__emoji"></span>
        <span class="sticker-toast__label">Neuer Sticker!</span>
        <span class="sticker-toast__title"></span>
      </div>
    `;
    document.body.appendChild(toast);
    return toast;
  },

  _ensureHeartLayer() {
    let layer = document.getElementById('heart-burst-layer');
    if (layer) return layer;
    layer = document.createElement('div');
    layer.id = 'heart-burst-layer';
    layer.className = 'heart-burst-layer';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);
    return layer;
  },

  // Streut bunte Herz-Emoji über den Bildschirm, die einzeln nach oben
  // schweben und verblassen - bewusst per CSS-Animation auf einfachen
  // <span>-Elementen statt über ein Canvas (wie Confetti), weil hier keine
  // Physik/Kollision gebraucht wird und ein `animationend`-Listener pro
  // Herz für die Aufräumung genügt.
  _burstHearts(count = 18) {
    const layer = this._ensureHeartLayer();
    for (let i = 0; i < count; i++) {
      const heart = document.createElement('span');
      heart.className = 'heart-particle';
      heart.textContent = HEART_EMOJI[Math.floor(Math.random() * HEART_EMOJI.length)];
      heart.style.left = `${Math.random() * 100}%`;
      heart.style.fontSize = `${1.2 + Math.random() * 1.2}rem`;
      heart.style.setProperty('--drift', `${(Math.random() - 0.5) * 140}px`);
      heart.style.setProperty('--duration', `${1.6 + Math.random() * 0.9}s`);
      heart.style.setProperty('--delay', `${Math.random() * 0.3}s`);
      heart.addEventListener('animationend', () => heart.remove());
      layer.appendChild(heart);
    }
  }
};
