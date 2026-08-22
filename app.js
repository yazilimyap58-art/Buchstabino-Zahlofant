// ============================
// 🧮 Rechen-Abenteuer – App Logic
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
    }
  },
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
  screenModeSelect: document.getElementById('screen-mode-select'),
  screenGame: document.getElementById('screen-game'),
  modeCards: document.querySelectorAll('.mode-card'),

  // Header
  progressBar: document.querySelector('.progress-bar'),
  levelBadge: document.querySelector('.level-badge'),
  streakCount: document.querySelector('.streak-count'),

  // Task area
  motifStage: document.getElementById('motif-stage'),
  taskQuestion: document.getElementById('task-question'),

  // Options
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
  btnRestart: document.getElementById('btn-restart')
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
  // resolves once the audio/speech has finished playing.
  playEffect(type, number) {
    const audioEl = document.getElementById(`audio-${type}`);
    if (audioEl.src) {
      audioEl.currentTime = 0;
      return audioEl.play()
        .then(() => new Promise(resolve => { audioEl.onended = resolve; }))
        .catch(() => {}); // ignore autoplay restrictions
    }
    // Fallback to TTS for feedback
    // Kein Punkt direkt nach der Zahl: sonst liest die Sprachausgabe sie als Ordinalzahl ("dritter" statt "drei")
    const text = type === 'correct' ? `Richtig! Es sind ${number}` : `Falsch! Es sind nicht ${number}`;
    return this.speak(text, 'de-DE', {rate: 0.85}).catch(() => {});
  }
};

/* ----------------------------
   Game Logic
   ---------------------------- */
const Game = {
  init() {
    this.loadState();
    this.bindEvents();
    this.showScreen('mode-select');
  },

  loadState() {
    const saved = localStorage.getItem('rechenAbenteuer');
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
    localStorage.setItem('rechenAbenteuer', JSON.stringify(STATE));
  },

  showScreen(name) {
    EL.screenModeSelect.hidden = name !== 'mode-select';
    EL.screenGame.hidden = name !== 'game';
  },

  selectMode(modeId) {
    STATE.mode = modeId;
    STATE.streak = 0;
    this.saveState();
    this.showScreen('game');
    this.updateUI();
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
    } else {
      throw new Error('No mode selected');
    }

    // Shuffle options
    options = options.sort(() => Math.random() - 0.5);

    STATE.currentTask = { answer, options, groups, displayPrompt, mode: STATE.mode, operation };
    this.renderTask();

    // Speak the question
    this.speakQuestion();
  },

  pickRandomMotifs(count) {
    const shuffled = [...CONFIG.motifs].sort(() => 0.5 - Math.random());
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
    } else {
      EL.motifStage.classList.add('motif-stage--groups');
      this.renderMotifGroups(groups);
    }

    // Set question text (short prompt only, never the raw object sequence)
    EL.taskQuestion.textContent = displayPrompt;

    // Set option buttons
    EL.optionButtons.forEach((btn, idx) => {
      btn.dataset.value = options[idx];
      btn.textContent = options[idx];
      btn.className = 'option-btn'; // reset
      btn.disabled = false;
      btn.style.opacity = '';
      btn.removeAttribute('aria-pressed');
      btn.blur(); // verhindert, dass der Fokus-/Highlight-Ring der letzten Runde sichtbar bleibt
    });

    // Clear feedback
    EL.feedbackArea.hidden = true;
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

  speakQuestion() {
    if (!STATE.isPlaying) return;
    const { displayPrompt, mode, groups, operation } = STATE.currentTask;

    if (mode === 'count') {
      // Nur die kurze Frage vorlesen, keine Objekt-Wiederholung
      TTS.speak(displayPrompt, 'de-DE', {rate: 0.9}).catch(() => {});
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
    TTS.speak(spoken, 'de-DE', {rate: 0.85}).catch(() => {});
  },

  handleOptionClick(event) {
    if (!STATE.isPlaying || STATE.isPaused) return;
    const btn = event.target.closest('.option-btn');
    if (!btn) return;

    const chosen = Number(btn.dataset.value);
    const { answer } = STATE.currentTask;

    // Disable all options during feedback
    EL.optionButtons.forEach(b => b.disabled = true);

    if (chosen === answer) {
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
    const confettiDone = withTimeout(Confetti.trigger(), 2500);
    const audioDone = withTimeout(TTS.playEffect('correct', STATE.currentTask.answer), 4000);

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

  handleWrong(wrongBtn) {
    wrongBtn.classList.add('wrong');
    wrongBtn.setAttribute('aria-pressed', 'true');

    // Play sound
    TTS.playEffect('wrong', wrongBtn.dataset.value);

    // Remove wrong option (as per spec)
    wrongBtn.disabled = true;
    wrongBtn.style.opacity = '0.5';

    // Show feedback
    this.showFeedback('Falsch! Versuch es noch einmal.', 'wrong');

    // Re-enable all buttons except the one just marked wrong
    setTimeout(() => {
      EL.optionButtons.forEach(btn => {
        if (btn !== wrongBtn) btn.disabled = false;
      });
    }, 800);
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
   Initialization
   ---------------------------- */
function initGame() {
  // Initialize confetti
  Confetti.init();

  // Initialize game
  Game.init();

  // Expose for debugging
  window.Game = Game;
  window.State = STATE;
  window.Config = CONFIG;
  window.Confetti = Confetti;
  window.TTS = TTS;
}

// Start when DOM loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGame);
} else {
  initGame();
}
