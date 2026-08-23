// ============================
// 🧮 Buchstabino & Zahlofant – App Logic
// Vanilla JS Game Engine
// ============================

// Löst nach `ms` auf, falls `promise` bis dahin nicht selbst fertig ist.
function withTimeout(promise, ms) {
  const timeout = new Promise(resolve => setTimeout(resolve, ms));
  return Promise.race([Promise.resolve(promise).catch(() => {}), timeout]);
}

/* ----------------------------
   Konstanten & Konfiguration
   ---------------------------- */
const CONFIG = {
  // Spielmodi: werden im Moduswahl-Screen ausgewählt
  modes: {
    count: {
      id: 'count',
      name: 'Zählen',
      icon: '🔢',
      max: 5,
      prompt: 'Wie viele siehst du?'
    },
    arithmetic: {
      id: 'arithmetic',
      name: 'Addieren/Subtrahieren',
      icon: '➕➖',
      max: 10,
      addPrompt: 'Wie viele sind es zusammen?',
      subPrompt: 'Wie viele bleiben übrig?'
    },
    lettersHear: {
      id: 'lettersHear',
      name: 'Hören',
      icon: '👂',
      prompt: 'Welcher Buchstabe wurde genannt?'
    },
    lettersFind: {
      id: 'lettersFind',
      name: 'Finden',
      icon: '🔍',
      tileCount: 6
    },
    lettersDraw: {
      id: 'lettersDraw',
      name: 'Zeichnen',
      icon: '✏️'
    }
  },
  // Buchstaben mit Beispielwort für "Hören"/"Finden" (Anlaut-Motiv)
  letters: [
    { upper: 'A', lower: 'a', word: 'Apfel', emoji: '🍎' },
    { upper: 'B', lower: 'b', word: 'Ball', emoji: '⚽' },
    { upper: 'C', lower: 'c', word: 'Clown', emoji: '🤡' },
    { upper: 'D', lower: 'd', word: 'Drache', emoji: '🐉' },
    { upper: 'E', lower: 'e', word: 'Elefant', emoji: '🐘' },
    { upper: 'F', lower: 'f', word: 'Fisch', emoji: '🐟' },
    { upper: 'G', lower: 'g', word: 'Giraffe', emoji: '🦒' },
    { upper: 'H', lower: 'h', word: 'Hund', emoji: '🐶' },
    { upper: 'I', lower: 'i', word: 'Igel', emoji: '🦔' },
    { upper: 'J', lower: 'j', word: 'Jojo', emoji: '🪀' },
    { upper: 'K', lower: 'k', word: 'Katze', emoji: '🐱' },
    { upper: 'L', lower: 'l', word: 'Löwe', emoji: '🦁' },
    { upper: 'M', lower: 'm', word: 'Maus', emoji: '🐭' },
    { upper: 'N', lower: 'n', word: 'Nashorn', emoji: '🦏' },
    { upper: 'O', lower: 'o', word: 'Orange', emoji: '🍊' },
    { upper: 'P', lower: 'p', word: 'Pinguin', emoji: '🐧' },
    { upper: 'Q', lower: 'q', word: 'Qualle', emoji: '🪼' },
    { upper: 'R', lower: 'r', word: 'Rakete', emoji: '🚀' },
    { upper: 'S', lower: 's', word: 'Sonne', emoji: '☀️' },
    { upper: 'T', lower: 't', word: 'Tiger', emoji: '🐯' },
    { upper: 'U', lower: 'u', word: 'Uhu', emoji: '🦉' },
    { upper: 'V', lower: 'v', word: 'Vogel', emoji: '🐦' },
    { upper: 'W', lower: 'w', word: 'Wal', emoji: '🐋' },
    { upper: 'X', lower: 'x', word: 'Xylophon', emoji: '🎹' },
    { upper: 'Y', lower: 'y', word: 'Yacht', emoji: '⛵' },
    { upper: 'Z', lower: 'z', word: 'Zebra', emoji: '🦓' }
  ],
  // Emoji motifs (can be extended)
  motifs: [
    { name: 'Schmetterling', plural: 'Schmetterlinge', emoji: '🦋', category: 'tier' },
    { name: 'Biene', plural: 'Bienen', emoji: '🐝', category: 'tier' },
    { name: 'Apfel', plural: 'Äpfel', emoji: '🍎', category: 'obst' },
    { name: 'Birne', plural: 'Birnen', emoji: '🍐', category: 'obst' },
    { name: 'Blume', plural: 'Blumen', emoji: '🌸', category: 'pflanze' },
    { name: 'Stern', plural: 'Sterne', emoji: '⭐', category: 'himmel' },
    { name: 'Herz', plural: 'Herzen', emoji: '❤️', category: 'symbol' },
    { name: 'Auto', plural: 'Autos', emoji: '🚗', category: 'verkehr' }
  ],
  // Audio fallback: if Web Speech fails, we can use these (to be filled later)
  audioUrls: {
    correct: '',
    wrong: ''
  }
};

/* ----------------------------
   State Management
   ---------------------------- */
const STATE = {
  mode: null, // 'count' | 'arithmetic'
  streak: 0,
  totalCorrect: 0,
  currentTask: null,
  isPlaying: true,
  isPaused: false
};

/* ----------------------------
   DOM Elements
   ---------------------------- */
const EL = {
  // Screens
  screenCategorySelect: document.getElementById('screen-category-select'),
  screenModeSelect: document.getElementById('screen-mode-select'),
  screenLettersModeSelect: document.getElementById('screen-letters-mode-select'),
  screenGame: document.getElementById('screen-game'),
  screenLetterDraw: document.getElementById('screen-letter-draw'),
  categoryCards: document.querySelectorAll('.category-card'),
  modeCards: document.querySelectorAll('.mode-card[data-mode]'),
  btnsBackToCategories: document.querySelectorAll('.btn-back-category'),

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
  btnDrawClear: document.getElementById('btn-draw-clear'),
  btnDrawRepeat: document.getElementById('btn-draw-repeat'),
  btnDrawNext: document.getElementById('btn-draw-next')
};

/* ----------------------------
   Audio / TTS
   ---------------------------- */
const TTS = {
  // SpeechSynthesis utterance wrapper
  speak(text, lang = 'de-DE', opts = {}) {
    return new Promise((resolve, reject) => {
      if (!('speechSynthesis' in window)) {
        reject('SpeechSynthesis not supported');
        return;
      }
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = lang;
      utter.rate = opts.rate || 0.9;
      utter.pitch = opts.pitch || 1.0;
      utter.volume = opts.volume || 1.0;
      utter.onend = () => resolve();
      utter.onerror = (err) => reject(err);
      window.speechSynthesis.speak(utter);
    });
  },

  // Play pre-loaded audio effect (correct/wrong). Returns a promise that
  // resolves once the audio/speech has finished playing. `value` ist bei
  // Zahlen-Modi eine Zahl, bei Buchstaben-Modi ein einzelner Buchstabe -
  // deshalb eigene Formulierung statt "Es sind X" (klingt bei Buchstaben falsch).
  playEffect(type, value, isLetter = false) {
    const audioEl = document.getElementById(`audio-${type}`);
    if (audioEl.src) {
      audioEl.currentTime = 0;
      return audioEl.play()
        .then(() => new Promise(resolve => { audioEl.onended = resolve; }))
        .catch(() => {}); // ignore autoplay restrictions
    }
    // Fallback to TTS for feedback
    // Kein Punkt direkt nach der Zahl: sonst liest die Sprachausgabe sie als Ordinalzahl ("dritter" statt "drei")
    let text;
    if (isLetter) {
      text = type === 'correct' ? `Richtig! Das ist ${value}` : `Falsch! Das ist nicht ${value}`;
    } else {
      text = type === 'correct' ? `Richtig! Es sind ${value}` : `Falsch! Es sind nicht ${value}`;
    }
    return this.speak(text, 'de-DE', {rate: 0.85}).catch(() => {});
  }
};

/* ----------------------------
   Maskottchen (Buchstabino & Zahlofant)
   ---------------------------- */
const MASCOT_BASE = 'assets/mascots/buchstabino_zahlofant_assets/svg/';

const Mascot = {
  // Setzt eine Pose auf einem Maskottchen-<img>. Weitere Posen (z.B.
  // "retry") lassen sich einfach ergänzen: SVG-Datei als
  // <character>_<pose>.svg ablegen und set()/greet()/celebrate() damit
  // aufrufen - keine weiteren Codeänderungen nötig. Die Pose-Animation
  // kommt automatisch aus dem [data-pose]-Selektor in style.css.
  set(imgEl, character, pose) {
    if (!imgEl) return;
    imgEl.src = `${MASCOT_BASE}${character}_${pose}.svg`;
    imgEl.dataset.pose = pose;
  },

  // Begrüßung: kurz winken, danach zurück zu idle.
  greet(imgEl, character, holdMs = 1400) {
    this.set(imgEl, character, 'waving');
    setTimeout(() => this.set(imgEl, character, 'idle'), holdMs);
  },

  // Kurzes Feiern nach einer richtigen Antwort, danach zurück zu idle.
  celebrate(imgEl, character, holdMs = 1500) {
    this.set(imgEl, character, 'celebrating');
    setTimeout(() => this.set(imgEl, character, 'idle'), holdMs);
  }
};

// Merkt sich pro Session (nicht persistiert), welche Bereiche schon einmal
// geöffnet wurden, damit die Begrüßungs-Pose nur beim ersten Öffnen läuft.
const greetedAreas = new Set();

/* ----------------------------
   Game Logic
   ---------------------------- */
const Game = {
  init() {
    this.loadState();
    this.bindEvents();
    this.showScreen('category-select');
    Mascot.greet(EL.mascotCategoryLetters, 'buchstabino');
    Mascot.greet(EL.mascotCategoryNumbers, 'zahlofant');
  },

  loadState() {
    const saved = localStorage.getItem('buchstabinoZahlofant');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        Object.assign(STATE, parsed);
        // Nur langfristige Werte übernehmen: isPaused/isPlaying sind
        // Session-Zustand und dürfen nicht als "true" überleben, sonst
        // blockieren sie generateTask()/handleOptionClick() stumm nach
        // einem Reload (die App startet ohnehin immer am Moduswahl-Screen).
        STATE.isPaused = false;
        STATE.isPlaying = true;
      } catch (e) {
        console.warn('Could not parse saved state', e);
      }
    }
  },

  saveState() {
    localStorage.setItem('buchstabinoZahlofant', JSON.stringify(STATE));
  },

  showScreen(name) {
    EL.screenCategorySelect.hidden = name !== 'category-select';
    EL.screenModeSelect.hidden = name !== 'mode-select';
    EL.screenLettersModeSelect.hidden = name !== 'letters-mode-select';
    EL.screenGame.hidden = name !== 'game';
    EL.screenLetterDraw.hidden = name !== 'letter-draw';
  },

  // Erste Ebene: Kategoriewahl (Buchstaben/Zahlen)
  selectCategory(categoryId) {
    const firstVisit = !greetedAreas.has(categoryId);
    greetedAreas.add(categoryId);

    if (categoryId === 'numbers') {
      this.showScreen('mode-select');
      if (firstVisit) {
        Mascot.greet(EL.mascotModeSelect, 'zahlofant');
      } else {
        Mascot.set(EL.mascotModeSelect, 'zahlofant', 'idle');
      }
    } else if (categoryId === 'letters') {
      this.showScreen('letters-mode-select');
      if (firstVisit) {
        Mascot.greet(EL.mascotLettersModeSelect, 'buchstabino');
      } else {
        Mascot.set(EL.mascotLettersModeSelect, 'buchstabino', 'idle');
      }
    }
  },

  selectMode(modeId) {
    STATE.mode = modeId;
    STATE.streak = 0;
    this.saveState();

    if (modeId === 'lettersDraw') {
      this.showScreen('letter-draw');
      Mascot.greet(EL.mascotDraw, 'buchstabino');
      LetterDraw.start();
      return;
    }

    this.showScreen('game');
    this.updateUI();
    const character = modeId === 'lettersHear' || modeId === 'lettersFind' ? 'buchstabino' : 'zahlofant';
    Mascot.greet(EL.mascotGame, character);
    this.generateTask();
  },

  updateUI() {
    const modeCfg = CONFIG.modes[STATE.mode];
    EL.levelBadge.textContent = `${modeCfg.icon} ${modeCfg.name}`;
    EL.streakCount.textContent = STATE.streak;

    // Progress ring: fills up every 10 correct answers, then loops
    const progress = (STATE.streak % 10) / 10;
    const circumference = 2 * Math.PI * 26;
    const offset = circumference * (1 - progress);
    EL.progressBar.style.strokeDashoffset = offset;

    // Update option buttons accessibility
    EL.optionButtons.forEach(btn => {
      btn.setAttribute('aria-pressed', 'false');
    });
  },

  generateTask() {
    if (STATE.isPaused) return;

    const modeCfg = CONFIG.modes[STATE.mode];
    let answer, options, groups, displayPrompt, operation;

    if (STATE.mode === 'count') {
      const { max } = modeCfg;
      const motif = this.pickRandomMotifs(1)[0];
      const count = 2 + Math.floor(Math.random() * (max - 1)); // 2..max
      answer = count;
      displayPrompt = modeCfg.prompt;
      options = this.generateDistractors(answer, max, 2);
      groups = [{ motif, count }];
    } else if (STATE.mode === 'arithmetic') {
      const { max } = modeCfg;
      operation = Math.random() < 0.5 ? 'add' : 'sub';
      // Beide Gruppen nutzen dasselbe Motiv, damit die Aufgabe nicht verwirrt
      const motifA = this.pickRandomMotifs(1)[0];
      const motifB = motifA;

      if (operation === 'add') {
        const countA = 1 + Math.floor(Math.random() * max);
        const countB = 1 + Math.floor(Math.random() * (max - countA + 1));
        answer = countA + countB;
        displayPrompt = modeCfg.addPrompt;
        options = this.generateDistractors(answer, max * 2, 2);
        groups = [{ motif: motifA, count: countA, operator: '+' }, { motif: motifB, count: countB }];
      } else {
        const total = 2 + Math.floor(Math.random() * (max - 1)); // 2..max
        const taken = 1 + Math.floor(Math.random() * (total - 1));
        answer = total - taken;
        displayPrompt = modeCfg.subPrompt;
        options = this.generateDistractors(answer, max, 2);
        groups = [{ motif: motifA, count: total, operator: '−' }, { motif: motifB, count: taken }];
      }
    } else if (STATE.mode === 'lettersHear') {
      const useUpper = Math.random() < 0.5;
      const target = this.pickRandomLetters(1)[0];
      const letterCase = useUpper ? 'upper' : 'lower';
      answer = target[letterCase];
      displayPrompt = modeCfg.prompt;
      const distractorLetters = this.pickRandomLetters(2, [target]);
      options = [answer, ...distractorLetters.map(l => l[letterCase])];
      groups = [{ motif: target, count: 1 }]; // liefert Emoji-Hinweis fürs Motiv-Stage
    } else if (STATE.mode === 'lettersFind') {
      const { tileCount } = modeCfg;
      const useUpper = Math.random() < 0.5;
      const target = this.pickRandomLetters(1)[0];
      const letterCase = useUpper ? 'upper' : 'lower';
      answer = target[letterCase];
      const distractorLetters = this.pickRandomLetters(tileCount - 1, [target]);
      const tiles = [
        { char: answer, correct: true },
        ...distractorLetters.map(l => ({ char: l[Math.random() < 0.5 ? 'upper' : 'lower'], correct: false }))
      ].sort(() => Math.random() - 0.5);
      displayPrompt = `Wo ist der Buchstabe „${answer}“?`;
      groups = [{ motif: target, tiles }];
    } else {
      throw new Error('No mode selected');
    }

    // Shuffle options
    if (options) options = options.sort(() => Math.random() - 0.5);

    STATE.currentTask = { answer, options, groups, displayPrompt, mode: STATE.mode, operation };
    this.renderTask();

    // Speak the question
    this.speakQuestion();
  },

  pickRandomMotifs(count) {
    const shuffled = [...CONFIG.motifs].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  },

  // Wählt zufällige, eindeutige Buchstaben aus CONFIG.letters, optional ohne die in `exclude` genannten
  pickRandomLetters(count, exclude = []) {
    const excludeUppers = new Set(exclude.map(l => l.upper));
    const pool = CONFIG.letters.filter(l => !excludeUppers.has(l.upper));
    const shuffled = [...pool].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  },

  generateDistractors(correct, maxRange, count) {
    const set = new Set([correct]);
    while (set.size < count + 1) {
      const cand = Math.floor(Math.random() * (maxRange + 1));
      if (cand !== correct) set.add(cand);
    }
    return Array.from(set);
  },

  renderTask() {
    const { answer, options, groups, displayPrompt, mode } = STATE.currentTask;

    // Clear motif stage
    EL.motifStage.innerHTML = '';
    EL.motifStage.className = 'motif-stage';

    if (mode === 'count') {
      EL.motifStage.classList.add('motif-stage--scatter');
      this.renderScatteredMotifs(groups[0].motif, answer);
    } else if (mode === 'arithmetic') {
      EL.motifStage.classList.add('motif-stage--groups');
      this.renderMotifGroups(groups);
    } else if (mode === 'lettersHear') {
      EL.motifStage.classList.add('motif-stage--groups');
      this.renderHearHint(groups[0].motif);
    } else if (mode === 'lettersFind') {
      EL.motifStage.classList.add('motif-stage--scatter');
      this.renderLetterTiles(groups[0].tiles);
    }

    // Set question text (short prompt only, never the raw object sequence)
    EL.taskQuestion.textContent = displayPrompt;

    // Finden: der gesuchte Buchstabe wird direkt in der Bühne angetippt,
    // die 3 Options-Buttons werden dafür nicht gebraucht
    EL.optionsContainer.hidden = mode === 'lettersFind';

    if (mode !== 'lettersFind') {
      EL.optionButtons.forEach((btn, idx) => {
        btn.dataset.value = options[idx];
        btn.textContent = options[idx];
        btn.className = mode === 'lettersHear' ? 'option-btn option-btn--letter' : 'option-btn'; // reset
        btn.disabled = false;
        btn.style.opacity = '';
        btn.removeAttribute('aria-pressed');
        btn.blur(); // verhindert, dass der Fokus-/Highlight-Ring der letzten Runde sichtbar bleibt
      });
    }

    // Clear feedback
    EL.feedbackArea.hidden = true;
  },

  // Hören: großes Beispiel-Emoji als visueller Hinweis, während TTS den Buchstaben ansagt
  renderHearHint(letterMotif) {
    const item = document.createElement('div');
    item.className = 'hear-hint';
    item.innerHTML = `<div class="hear-hint__emoji" aria-hidden="true">${letterMotif.emoji}</div>`;
    EL.motifStage.appendChild(item);
  },

  // Finden: antippbare Buchstaben-Kacheln über die Bühne verteilt
  renderLetterTiles(tiles) {
    const cols = Math.ceil(Math.sqrt(tiles.length));
    const rows = Math.ceil(tiles.length / cols);
    const cellW = 100 / cols;
    const cellH = 100 / rows;

    tiles.forEach((tile, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const jitterX = 0.2 + Math.random() * 0.6;
      const jitterY = 0.2 + Math.random() * 0.6;
      const left = (col + jitterX) * cellW;
      const top = (row + jitterY) * cellH;

      const tileEl = document.createElement('button');
      tileEl.type = 'button';
      tileEl.className = 'letter-tile';
      tileEl.style.left = `${left}%`;
      tileEl.style.top = `${top}%`;
      tileEl.textContent = tile.char;
      tileEl.dataset.correct = tile.correct ? 'true' : 'false';
      EL.motifStage.appendChild(tileEl);
    });
  },

  // Zählen: Objekte nicht überlappend über die Bühne verteilt
  renderScatteredMotifs(motif, count) {
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);
    const cellW = 100 / cols;
    const cellH = 100 / rows;

    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const jitterX = 0.25 + Math.random() * 0.5; // 0.25..0.75 within cell
      const jitterY = 0.25 + Math.random() * 0.5;
      const left = (col + jitterX) * cellW;
      const top = (row + jitterY) * cellH;
      const rotation = (Math.random() * 30 - 15).toFixed(1);

      const item = document.createElement('div');
      item.className = 'motif-item';
      item.style.left = `${left}%`;
      item.style.top = `${top}%`;
      item.innerHTML = `<div class="motif-svg" style="transform: rotate(${rotation}deg)" aria-hidden="true">${motif.emoji}</div>`;
      EL.motifStage.appendChild(item);
    }
  },

  // Addieren/Subtrahieren: zwei Gruppen nebeneinander mit Operator-Symbol
  renderMotifGroups(groups) {
    groups.forEach((group, idx) => {
      if (idx > 0) {
        const prevOperator = groups[idx - 1].operator;
        const opEl = document.createElement('div');
        opEl.className = 'operator-symbol';
        opEl.setAttribute('aria-hidden', 'true');
        opEl.textContent = prevOperator || '+';
        EL.motifStage.appendChild(opEl);
      }

      const groupEl = document.createElement('div');
      groupEl.className = 'motif-group';
      for (let i = 0; i < group.count; i++) {
        const item = document.createElement('div');
        item.className = 'motif-item';
        item.innerHTML = `<div class="motif-svg" aria-hidden="true">${group.motif.emoji}</div>`;
        groupEl.appendChild(item);
      }
      EL.motifStage.appendChild(groupEl);
    });
  },

  // Wählt Singular/Plural-Form eines Motivs passend zur Anzahl
  nameForCount(motif, count) {
    return count === 1 ? motif.name : motif.plural;
  },

  // Zahlofant rechnet/zählt, Buchstabino ist für Buchstaben-Modi zuständig
  mascotCharacter() {
    return (STATE.mode === 'lettersHear' || STATE.mode === 'lettersFind' || STATE.mode === 'lettersDraw')
      ? 'buchstabino' : 'zahlofant';
  },

  speakQuestion() {
    if (!STATE.isPlaying) return;
    const { displayPrompt, mode, groups, operation } = STATE.currentTask;
    const character = this.mascotCharacter();

    // Während die Aufgabe vorgelesen wird, "denkt" das Maskottchen nach;
    // danach zurück zu idle (egal ob Sprachausgabe erfolgreich war oder nicht).
    Mascot.set(EL.mascotGame, character, 'thinking');
    const resetMascotIdle = () => Mascot.set(EL.mascotGame, character, 'idle');

    if (mode === 'count') {
      // Nur die kurze Frage vorlesen, keine Objekt-Wiederholung
      TTS.speak(displayPrompt, 'de-DE', {rate: 0.9}).then(resetMascotIdle, resetMascotIdle);
      return;
    }

    if (mode === 'lettersHear') {
      // Buchstabe + Beispielwort ansagen, z.B. "B wie Ball"
      const target = groups[0].motif;
      const spokenLetter = STATE.currentTask.answer;
      TTS.speak(`${spokenLetter} wie ${target.word}`, 'de-DE', {rate: 0.8}).then(resetMascotIdle, resetMascotIdle);
      return;
    }

    if (mode === 'lettersFind') {
      TTS.speak(`Wo ist der Buchstabe ${STATE.currentTask.answer}?`, 'de-DE', {rate: 0.85}).then(resetMascotIdle, resetMascotIdle);
      return;
    }

    // Addieren/Subtrahieren: Zahlen und Objektnamen ansagen, nicht jedes Objekt einzeln aufzählen
    const [groupA, groupB] = groups;
    let spoken;
    if (operation === 'add') {
      spoken = `${groupA.count} ${this.nameForCount(groupA.motif, groupA.count)} plus ${groupB.count} ${this.nameForCount(groupB.motif, groupB.count)}. Wie viele sind das zusammen?`;
    } else {
      spoken = `Es gibt ${groupA.count} ${this.nameForCount(groupA.motif, groupA.count)}. Wie viele bleiben übrig, wenn du ${groupB.count} ${this.nameForCount(groupB.motif, groupB.count)} wegnimmst?`;
    }
    TTS.speak(spoken, 'de-DE', {rate: 0.85}).then(resetMascotIdle, resetMascotIdle);
  },

  handleOptionClick(event) {
    if (!STATE.isPlaying || STATE.isPaused) return;
    const btn = event.target.closest('.option-btn');
    if (!btn) return;

    const { answer } = STATE.currentTask;

    // Disable all options during feedback
    EL.optionButtons.forEach(b => b.disabled = true);

    // String-Vergleich statt Number(): Buchstaben-Modi liefern Buchstaben statt Zahlen als Wert
    if (String(btn.dataset.value) === String(answer)) {
      // Correct!
      this.handleCorrect(btn);
    } else {
      // Wrong
      this.handleWrong(btn);
    }
  },

  handleCorrect(correctBtn) {
    correctBtn.classList.add('correct');
    correctBtn.setAttribute('aria-pressed', 'true');

    // Play confetti + sound in parallel. Beide bekommen ein Timeout-Fallback:
    // requestAnimationFrame pausiert z.B. komplett wenn der Tab in den
    // Hintergrund gerät, und speechSynthesis feuert nicht überall "onend" -
    // ohne Fallback würde das Spiel dann auf "Richtig" hängen bleiben.
    const isLetterMode = STATE.mode === 'lettersHear' || STATE.mode === 'lettersFind';
    const confettiDone = withTimeout(Confetti.trigger(), 2500);
    const audioDone = withTimeout(TTS.playEffect('correct', STATE.currentTask.answer, isLetterMode), 4000);
    Mascot.celebrate(EL.mascotGame, this.mascotCharacter());

    // Update state
    STATE.streak++;
    STATE.totalCorrect++;

    this.saveState();
    this.updateUI();

    // Show brief feedback
    this.showFeedback('Richtig! 🎉', 'correct');

    // Erst zur nächsten Aufgabe wechseln, wenn Audio UND Konfetti fertig sind
    Promise.all([confettiDone, audioDone]).then(() => {
      this.generateTask();
    });
  },

  // `siblings` sind die anderen antippbaren Elemente derselben Aufgabe (Options-Buttons
  // oder, im Finden-Modus, die Buchstaben-Kacheln) - die werden nach kurzer Pause wieder aktiv.
  handleWrong(wrongBtn, siblings = EL.optionButtons) {
    wrongBtn.classList.add('wrong');
    wrongBtn.setAttribute('aria-pressed', 'true');

    // Play sound
    const isLetterMode = STATE.mode === 'lettersHear' || STATE.mode === 'lettersFind';
    const wrongValue = wrongBtn.dataset.value ?? wrongBtn.textContent;
    TTS.playEffect('wrong', wrongValue, isLetterMode);

    // Remove wrong option (as per spec)
    wrongBtn.disabled = true;
    wrongBtn.style.opacity = '0.5';

    // Show feedback
    this.showFeedback('Falsch! Versuch es noch einmal.', 'wrong');

    // Re-enable all buttons except the one just marked wrong
    setTimeout(() => {
      siblings.forEach(btn => {
        if (btn !== wrongBtn) btn.disabled = false;
      });
    }, 800);
  },

  handleLetterTileClick(event) {
    if (!STATE.isPlaying || STATE.isPaused) return;
    const tileEl = event.target.closest('.letter-tile');
    if (!tileEl || tileEl.disabled) return;

    const tiles = EL.motifStage.querySelectorAll('.letter-tile');
    tiles.forEach(t => t.disabled = true);

    if (tileEl.dataset.correct === 'true') {
      this.handleCorrect(tileEl);
    } else {
      this.handleWrong(tileEl, tiles);
    }
  },

  showFeedback(message, type) {
    EL.feedbackMessage.textContent = message;
    EL.feedbackMessage.className = `feedback-message feedback-message--${type}`;
    EL.feedbackArea.hidden = false;

    // Automatisch ausblenden, damit die Objekte wieder sichtbar sind
    const hideDelay = type === 'correct' ? 1500 : 2000;
    setTimeout(() => {
      EL.feedbackArea.hidden = true;
    }, hideDelay);
  },

  bindEvents() {
    // Category selection (erste Ebene: Buchstaben/Zahlen)
    EL.categoryCards.forEach(card => {
      card.addEventListener('click', () => {
        this.selectCategory(card.dataset.category);
      });
    });

    // Zurück zur Kategoriewahl
    EL.btnsBackToCategories.forEach(btn => {
      btn.addEventListener('click', () => {
        this.showScreen('category-select');
      });
    });

    // Mode selection
    EL.modeCards.forEach(card => {
      card.addEventListener('click', () => {
        this.selectMode(card.dataset.mode);
      });
    });

    // Option clicks
    EL.optionButtons.forEach(btn => {
      btn.addEventListener('click', this.handleOptionClick.bind(this));
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.handleOptionClick({ target: btn });
        }
      });
    });

    // Buchstaben-Kacheln (Finden-Modus) werden dynamisch pro Aufgabe neu gerendert,
    // deshalb Delegation auf die (statische) Bühne statt Einzel-Listener pro Kachel
    EL.motifStage.addEventListener('click', this.handleLetterTileClick.bind(this));

    // Menu button (back to mode select)
    EL.btnMenu.addEventListener('click', () => {
      if (STATE.isPaused) this.togglePause();
      this.showScreen('mode-select');
    });

    // Repeat button
    EL.btnRepeat.addEventListener('click', () => {
      this.speakQuestion();
    });

    // Pause button
    EL.btnPause.addEventListener('click', () => {
      this.togglePause();
    });

    // Pause modal buttons
    EL.btnResume.addEventListener('click', () => {
      this.togglePause();
    });
    EL.btnRestart.addEventListener('click', () => {
      this.restartGame();
    });

    // Visibility change (pause when tab hidden)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.pauseGame();
      } else {
        // optionally resume
      }
    });
  },

  togglePause() {
    if (STATE.isPaused) {
      this.resumeGame();
    } else {
      this.pauseGame();
    }
  },

  pauseGame() {
    if (STATE.isPaused || EL.screenGame.hidden) return;
    STATE.isPaused = true;
    this.updatePauseStats();
    EL.pauseModal.showModal();
    EL.btnPause.textContent = '▶️ Weiter';
  },

  resumeGame() {
    STATE.isPaused = false;
    EL.pauseModal.close();
    EL.btnPause.textContent = '⏸️ Pause';
    // Optionally generate new task after resume
    this.generateTask();
  },

  updatePauseStats() {
    const modeCfg = CONFIG.modes[STATE.mode];
    EL.pauseStats.innerHTML = `
      <div><strong>Modus:</strong> ${modeCfg.icon} ${modeCfg.name}</div>
      <div><strong>Richtige:</strong> ${STATE.totalCorrect}</div>
      <div><strong>Serie:</strong> ${STATE.streak}</div>
    `;
  },

  restartGame() {
    STATE.streak = 0;
    STATE.totalCorrect = 0;
    this.saveState();
    this.updateUI();
    this.resumeGame();
  }
};

/* ----------------------------
   Confetti Effect (simple)
   ---------------------------- */
const Confetti = {
  canvas: document.getElementById('confetti-canvas'),
  ctx: null,
  width: 0,
  height: 0,
  particles: [],
  maxParticles: 80,

  init() {
    this.ctx = this.canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
  },

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width * devicePixelRatio;
    this.canvas.height = this.height * devicePixelRatio;
    // setTransform statt scale: sonst summiert sich die Skalierung bei
    // jedem weiteren Resize (Fenster verändern, Gerät drehen) auf.
    this.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  },

  // Startet die Konfetti-Animation. Gibt ein Promise zurück, das erst
  // aufgelöst wird, wenn alle Partikel verblasst sind.
  trigger() {
    this.particles = [];
    for (let i = 0; i < this.maxParticles; i++) {
      this.particles.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height - 20,
        radius: Math.random() * 4 + 2,
        color: `hsl(${Math.random() * 360}, 70%, 60%)`,
        rotation: Math.random() * Math.PI * 2,
        speed: {
          x: (Math.random() - 0.5) * 6,
          y: Math.random() * 6 + 2
        },
        friction: 0.98,
        gravity: 0.2,
        opacity: 1
      });
    }
    this.update();
    return new Promise(resolve => { this._onDone = resolve; });
  },

  update() {
    if (this.particles.length === 0) {
      if (this._onDone) {
        this._onDone();
        this._onDone = null;
      }
      return;
    }

    this.ctx.clearRect(0, 0, this.width, this.height);

    this.particles.forEach((p, idx) => {
      // Update physics
      p.speed.x *= p.friction;
      p.speed.y *= p.friction;
      p.speed.y += p.gravity;

      p.x += p.speed.x;
      p.y += p.speed.y;
      p.rotation += 0.1;
      p.opacity -= 0.015;

      // Remove if faded out
      if (p.opacity <= 0) {
        this.particles.splice(idx, 1);
        return;
      }

      // Draw
      this.ctx.save();
      this.ctx.translate(p.x, p.y);
      this.ctx.rotate(p.rotation);
      this.ctx.beginPath();
      // Simple square confetti
      this.ctx.rect(-p.radius, -p.radius, p.radius * 2, p.radius * 2);
      this.ctx.fillStyle = p.color;
      this.ctx.globalAlpha = p.opacity;
      this.ctx.fill();
      this.ctx.restore();
    });

    requestAnimationFrame(() => this.update());
  }
};

/* ----------------------------
   Buchstaben zeichnen (Nachfahren + Freihand)
   ---------------------------- */
const LetterDraw = {
  guideCtx: null,
  inkCtx: null,
  width: 0,
  height: 0,
  isDrawing: false,
  lastPoint: null,
  currentLetter: null,
  currentCase: 'upper',
  phase: 'guided', // 'guided' | 'freehand'
  guideBandWidth: 10, // Breite der Führungslinie (CSS px) - dünn genug, damit sie sichtbar hohl wirkt (zum Nachfahren) statt wie eine ausgefüllte Fläche
  inkLineWidth: 16,

  init() {
    this.guideCtx = EL.drawGuideCanvas.getContext('2d');
    this.inkCtx = EL.drawInkCanvas.getContext('2d', { willReadFrequently: true });
    window.addEventListener('resize', () => this.resize());

    EL.drawInkCanvas.addEventListener('pointerdown', this.handlePointerDown.bind(this));
    EL.drawInkCanvas.addEventListener('pointermove', this.handlePointerMove.bind(this));
    EL.drawInkCanvas.addEventListener('pointerup', this.handlePointerUp.bind(this));
    EL.drawInkCanvas.addEventListener('pointercancel', this.handlePointerUp.bind(this));

    EL.btnDrawClear.addEventListener('click', () => this.clearInk());
    EL.btnDrawRepeat.addEventListener('click', () => this.speakLetter());
    EL.btnDrawNext.addEventListener('click', () => this.handleNext());
  },

  resize() {
    const rect = EL.drawInkCanvas.parentElement.getBoundingClientRect();
    if (rect.width === 0) return; // Screen gerade nicht sichtbar
    this.width = rect.width;
    this.height = rect.height;
    [EL.drawGuideCanvas, EL.drawInkCanvas].forEach(canvas => {
      canvas.width = rect.width * devicePixelRatio;
      canvas.height = rect.height * devicePixelRatio;
    });
    this.guideCtx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    this.inkCtx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    if (this.currentLetter && this.phase === 'guided') this.drawGuide();
  },

  start() {
    this.resize();
    this.pickNewLetter();
  },

  pickNewLetter() {
    this.currentLetter = Game.pickRandomLetters(1)[0];
    this.currentCase = Math.random() < 0.5 ? 'upper' : 'lower';
    this.beginGuidedPhase();
  },

  beginGuidedPhase() {
    this.phase = 'guided';
    EL.drawGuideCanvas.hidden = false;
    EL.drawStars.hidden = true;
    EL.btnDrawNext.textContent = 'Fertig ✓';
    EL.drawQuestion.textContent = `Fahre den Buchstaben „${this.currentLetter[this.currentCase]}“ nach`;
    this.clearInk();
    this.drawGuide();
    this.speakLetter();
  },

  beginFreehandPhase() {
    this.phase = 'freehand';
    EL.drawGuideCanvas.hidden = true;
    EL.drawStars.hidden = true;
    EL.btnDrawNext.textContent = 'Weiter ▶';
    EL.drawQuestion.textContent = `Male den Buchstaben „${this.currentLetter[this.currentCase]}“ frei, ohne Hilfslinie`;
    this.clearInk();
  },

  // Führungslinie: großer Buchstabe aus Systemschrift statt handgepflegter
  // Pfaddaten pro Buchstabe (kein Content-Aufwand für Strichrichtung/Pfeile -
  // dafür auch keine Schreibrichtungs-Pfeile in dieser ersten Version).
  // Wichtig: strokeText() statt fillText()! Eine gefüllte Fläche würde bei
  // breiten Buchstaben fast den ganzen Canvas abdecken - dann "besteht" jede
  // beliebige Kritzelei irgendwo in der Fläche die Trefferprüfung. Der Umriss
  // (dünne Linie) zwingt zum tatsächlichen Nachfahren.
  drawGuide() {
    const ctx = this.guideCtx;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.font = `bold ${Math.floor(this.height * 0.72)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = this.guideBandWidth;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.55)';
    ctx.strokeText(this.currentLetter[this.currentCase], this.width / 2, this.height / 2 + this.height * 0.02);
    ctx.restore();
  },

  clearInk() {
    this.inkCtx.clearRect(0, 0, this.width, this.height);
  },

  speakLetter() {
    Mascot.set(EL.mascotDraw, 'buchstabino', 'thinking');
    const resetIdle = () => Mascot.set(EL.mascotDraw, 'buchstabino', 'idle');
    TTS.speak(`${this.currentLetter[this.currentCase]} wie ${this.currentLetter.word}`, 'de-DE', {rate: 0.8})
      .then(resetIdle, resetIdle);
  },

  getPoint(event) {
    const rect = EL.drawInkCanvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  },

  handlePointerDown(event) {
    if (STATE.isPaused) return;
    event.preventDefault();
    EL.drawInkCanvas.setPointerCapture(event.pointerId);
    this.isDrawing = true;
    this.lastPoint = this.getPoint(event);
  },

  handlePointerMove(event) {
    if (!this.isDrawing) return;
    event.preventDefault();
    const point = this.getPoint(event);
    const ctx = this.inkCtx;
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = this.inkLineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(this.lastPoint.x, this.lastPoint.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    this.lastPoint = point;
  },

  handlePointerUp() {
    this.isDrawing = false;
    this.lastPoint = null;
  },

  handleNext() {
    if (this.phase === 'guided') {
      const score = this.scoreDrawing();
      this.showStars(score);
      STATE.streak++;
      STATE.totalCorrect++;
      Game.saveState();

      const audioDone = withTimeout(TTS.speak(this.praiseFor(score), 'de-DE', {rate: 0.9}), 3000);

      // Konfetti/Feiern nur bei einer echten, erkennbaren Nachfahr-Leistung -
      // sonst würde jede beliebige Kritzelei optisch genauso "gefeiert" wie
      // ein sauberer Nachfahr-Versuch. Kein hartes "Falsch", aber ein
      // spürbarer Unterschied im Feedback (siehe scoreDrawing()).
      if (score >= this.passScore) {
        Mascot.celebrate(EL.mascotDraw, 'buchstabino');
        const confettiDone = withTimeout(Confetti.trigger(), 2500);
        Promise.all([confettiDone, audioDone]).then(() => this.beginFreehandPhase());
      } else {
        Mascot.set(EL.mascotDraw, 'buchstabino', 'thinking');
        audioDone.then(() => {
          Mascot.set(EL.mascotDraw, 'buchstabino', 'idle');
          this.beginFreehandPhase();
        });
      }
    } else {
      // Freihand zeigt keine Führungslinie, aber sie steht (nur unsichtbar)
      // weiterhin auf dem Guide-Canvas - wird für eine echte, wenn auch
      // grosszügigere Prüfung wiederverwendet. Ohne das würde diese Phase
      // JEDE Eingabe (auch eine leere Fläche) unterschiedslos als "Toll
      // gemalt!" feiern, was genau der gemeldete Bug war.
      const score = this.scoreDrawing();
      const passed = score >= this.freehandPassScore;
      const audioDone = withTimeout(
        TTS.speak(passed ? 'Toll gemalt!' : 'Versuch mal, dich genau an die Form zu erinnern!', 'de-DE', {rate: 0.9}),
        2500
      );

      if (passed) {
        Mascot.celebrate(EL.mascotDraw, 'buchstabino');
        const confettiDone = withTimeout(Confetti.trigger(), 2000);
        Promise.all([confettiDone, audioDone]).then(() => this.pickNewLetter());
      } else {
        Mascot.set(EL.mascotDraw, 'buchstabino', 'thinking');
        audioDone.then(() => {
          Mascot.set(EL.mascotDraw, 'buchstabino', 'idle');
          this.pickNewLetter();
        });
      }
    }
  },

  passScore: 0.5, // ab hier gilt der geführte Versuch als "getroffen" (Konfetti/Feiern)
  freehandPassScore: 0.22, // niedrigere Schwelle: ohne sichtbare Linie ist Treffen viel schwerer

  praiseFor(score) {
    if (score >= 0.75) return 'Super gemacht!';
    if (score >= this.passScore) return 'Gut gemacht, weiter so!';
    return 'Guter Versuch! Schau dir die Linie noch mal genau an und probier es gleich noch mal.';
  },

  showStars(score) {
    const starCount = score >= 0.75 ? 3 : score >= this.passScore ? 2 : 1; // nie 0 Sterne: sanftes Feedback statt harter Fehlermeldung
    EL.drawStars.textContent = '⭐'.repeat(starCount) + '☆'.repeat(3 - starCount);
    EL.drawStars.hidden = false;
  },

  // Grobe Trefferanalyse per Grid-Sampling statt exaktem Pixelvergleich:
  // vergleicht, wie viel der Führungslinie mit Tinte bedeckt wurde (Coverage)
  // und wie viel der Tinte tatsächlich nahe der Führungslinie liegt
  // (Precision) statt wahllos über den Canvas verteilt zu sein. Die
  // Führungslinie selbst ist nur ein dünnes Band (siehe drawGuide()) -
  // deshalb bestraft die Precision-Komponente wirksam große Kritzeleien, die
  // einfach die ganze Fläche bedecken, ohne dem Buchstaben zu folgen.
  scoreDrawing() {
    const gridStep = 6;
    const toleranceCells = 1; // ±1 Zelle (~6px) Toleranz für zittrige Kinderhände, nicht mehr
    const dpr = window.devicePixelRatio || 1;
    const guideCanvas = EL.drawGuideCanvas;
    const inkCanvas = EL.drawInkCanvas;
    const guideData = this.guideCtx.getImageData(0, 0, guideCanvas.width, guideCanvas.height);
    const inkData = this.inkCtx.getImageData(0, 0, inkCanvas.width, inkCanvas.height);
    const cols = Math.floor(this.width / gridStep);
    const rows = Math.floor(this.height / gridStep);

    const alphaAt = (imageData, x, y) => {
      const px = Math.floor(x * dpr);
      const py = Math.floor(y * dpr);
      if (px < 0 || py < 0 || px >= imageData.width || py >= imageData.height) return 0;
      return imageData.data[(py * imageData.width + px) * 4 + 3];
    };

    const guideCells = [];
    const inkCells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * gridStep + gridStep / 2;
        const y = r * gridStep + gridStep / 2;
        if (alphaAt(guideData, x, y) > 40) guideCells.push([c, r]);
        if (alphaAt(inkData, x, y) > 40) inkCells.push([c, r]);
      }
    }

    if (guideCells.length === 0 || inkCells.length === 0) return 0;

    const hasNeighbor = (cells, cell) =>
      cells.some(([c, r]) => Math.abs(c - cell[0]) <= toleranceCells && Math.abs(r - cell[1]) <= toleranceCells);

    const coverage = guideCells.filter(cell => hasNeighbor(inkCells, cell)).length / guideCells.length;
    const precision = inkCells.filter(cell => hasNeighbor(guideCells, cell)).length / inkCells.length;

    // Precision etwas höher gewichtet als Coverage: verhindert, dass eine große
    // Kritzelei über die gesamte Fläche (hohe Coverage "geschenkt") allein
    // schon als gute Leistung durchgeht - sie muss auch der Linie folgen.
    return coverage * 0.45 + precision * 0.55;
  }
};

/* ----------------------------
   Initialization
   ---------------------------- */
function initGame() {
  // Initialize confetti
  Confetti.init();

  // Initialize game
  Game.init();
  LetterDraw.init();

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
