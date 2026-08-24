import { CONFIG } from './config.js';
import { STATE } from './state.js';
import { EL } from './dom.js';
import { TTS } from './tts.js';
import { Mascot } from './mascot.js';
import { withTimeout } from './utils.js';
import { TraceDraw } from './traceDraw.js';
import { measureLayoutChrome } from './layoutChrome.js';
import { RewardSystem } from './rewardSystem.js';

// Merkt sich pro Session (nicht persistiert), welche Bereiche schon einmal
// geöffnet wurden, damit die Begrüßungs-Pose nur beim ersten Öffnen läuft.
const greetedAreas = new Set();

/* ----------------------------
   Game Logic
   ---------------------------- */
export const Game = {
  init() {
    this.loadState();
    this.bindEvents();
    this.showScreen('category-select');
    this.greetCategoryScreen();
  },

  // Begrüßung auf der Startseite: beide Maskottchen winken SOFORT (rein
  // visuell, keine Einschränkung durch Browser-Autoplay-Regeln). Sie
  // SPRECHEN hier bewusst nicht - das passiert erst pro Kategorie beim
  // tatsächlichen Einstieg (siehe selectCategory()), ausgelöst durch genau
  // den Klick, der die Kategorie öffnet. Ein früherer Versuch, beide
  // Ansagen an den allerersten Klick irgendwo auf der Seite zu hängen,
  // spielte immer BEIDE Stimmen ab, egal welche Kategorie gewählt wurde -
  // fachlich falsch (nur die gewählte Figur soll sich vorstellen) und ergab
  // zusätzlich hörbares Überlappen.
  greetCategoryScreen() {
    Mascot.set(EL.mascotCategoryLetters, 'buchstabino', 'waving');
    Mascot.set(EL.mascotCategoryNumbers, 'zahlofant', 'waving');
  },

  // Winkt UND spricht die Begrüßung der übergebenen Figur, revertiert erst
  // zu idle wenn die Ansage fertig ist (nicht nach fixem Timeout) - siehe
  // selectCategory()/firstVisit.
  greetWithVoice(imgEl, character, key) {
    const gen = Mascot.set(imgEl, character, 'waving');
    const backToIdle = () => Mascot.setIfCurrent(imgEl, character, 'idle', gen);
    TTS.speak([key]).then(backToIdle, backToIdle);
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
    EL.screenStickerAlbum.hidden = name !== 'sticker-album';
    // Neu vermisst die tatsächliche Höhe der schwebenden Header-/Footer-
    // Leisten des jetzt sichtbaren Screens (siehe js/layoutChrome.js für
    // die Begründung, warum das synchron statt per rAF passiert).
    measureLayoutChrome();
  },

  // Erste Ebene: Kategoriewahl (Buchstaben/Zahlen)
  selectCategory(categoryId) {
    const firstVisit = !greetedAreas.has(categoryId);
    greetedAreas.add(categoryId);

    if (categoryId === 'numbers') {
      this.showScreen('mode-select');
      if (firstVisit) {
        this.greetWithVoice(EL.mascotModeSelect, 'zahlofant', 'greet_zahlofant');
      } else {
        Mascot.set(EL.mascotModeSelect, 'zahlofant', 'idle');
      }
    } else if (categoryId === 'letters') {
      this.showScreen('letters-mode-select');
      if (firstVisit) {
        this.greetWithVoice(EL.mascotLettersModeSelect, 'buchstabino', 'greet_buchstabino');
      } else {
        Mascot.set(EL.mascotLettersModeSelect, 'buchstabino', 'idle');
      }
    }
  },

  selectMode(modeId) {
    STATE.mode = modeId;
    STATE.streak = 0;
    // Rundenlokaler Reward-Streak (separat von STATE.streak, siehe
    // rewardSystem.js) startet bei jeder neuen Runde bei 0. Bricht
    // außerdem eine evtl. noch laufende Feier des jeweils anderen Screens
    // ab (z.B. Zahlen->Buchstaben-Wechsel während einer Zeichnen-Feier) -
    // sonst bliebe das blockierende Celebration-Overlay über dem neuen
    // Screen hängen.
    RewardSystem.resetRound();
    Mascot.cancelFlight(EL.mascotGame);
    Mascot.cancelFlight(EL.mascotDraw);
    this.saveState();

    if (modeId === 'lettersDraw' || modeId === 'numbersDraw') {
      this.showScreen('letter-draw');
      Mascot.greet(EL.mascotDraw, modeId === 'lettersDraw' ? 'buchstabino' : 'zahlofant');
      TraceDraw.start(modeId);
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

  // Scatter-Layouts (Finden-Kacheln, Zählen-Motive) positionieren Kinder
  // per CSS-Prozent-Koordinaten relativ zur eigenen Box von #motif-stage
  // (`.motif-stage--scatter .motif-item/.letter-tile { position:absolute;
  // transform:translate(-50%,-50%); }`). Die 100dvh-Vollbild-Bühne kann
  // heute (Konzept C) sehr niedrig werden (Handy quer), sodass ein Item
  // nahe 0%/100% durch das translate(-50%,-50%)-Zentrieren zur Hälfte
  // seiner eigenen Pixelgröße über den Rand der Stage hinausragen und
  // unter die schwebenden Header-/Footer-Leisten geraten kann - das lässt
  // sich nicht rein prozentual vermeiden, da der Rand-Sicherheitsabstand
  // von der TATSÄCHLICHEN Pixelgröße des Items UND der Stage abhängt.
  // Dieser Helper rechnet die Item-Halbgröße in einen Prozent-Rand um und
  // liefert den sicheren [min,max]-Bereich je Achse.
  getScatterSafeRange(itemSizePx) {
    const rect = EL.motifStage.getBoundingClientRect();
    const marginXPct = rect.width > 0 ? (itemSizePx / 2 / rect.width) * 100 : 0;
    const marginYPct = rect.height > 0 ? (itemSizePx / 2 / rect.height) * 100 : 0;
    return {
      minX: Math.min(marginXPct, 40),
      maxX: 100 - Math.min(marginXPct, 40),
      minY: Math.min(marginYPct, 40),
      maxY: 100 - Math.min(marginYPct, 40)
    };
  },

  // Finden: antippbare Buchstaben-Kacheln über die Bühne verteilt
  renderLetterTiles(tiles) {
    const cols = Math.ceil(Math.sqrt(tiles.length));
    const rows = Math.ceil(tiles.length / cols);
    // .letter-tile ist mindestens 60px (min-width/min-height, style.css)
    const { minX, maxX, minY, maxY } = this.getScatterSafeRange(60);
    const cellW = (maxX - minX) / cols;
    const cellH = (maxY - minY) / rows;

    tiles.forEach((tile, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const jitterX = 0.2 + Math.random() * 0.6;
      const jitterY = 0.2 + Math.random() * 0.6;
      const left = minX + (col + jitterX) * cellW;
      const top = minY + (row + jitterY) * cellH;

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
    // .motif-item ist ~56px groß (.motif-svg, style.css) plus Label darunter
    const { minX, maxX, minY, maxY } = this.getScatterSafeRange(64);
    const cellW = (maxX - minX) / cols;
    const cellH = (maxY - minY) / rows;

    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const jitterX = 0.25 + Math.random() * 0.5; // 0.25..0.75 within cell
      const jitterY = 0.25 + Math.random() * 0.5;
      const left = minX + (col + jitterX) * cellW;
      const top = minY + (row + jitterY) * cellH;
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

  // Zahlofant rechnet/zählt, Buchstabino ist für Buchstaben-Modi zuständig
  mascotCharacter() {
    return (STATE.mode === 'lettersHear' || STATE.mode === 'lettersFind' || STATE.mode === 'lettersDraw')
      ? 'buchstabino' : 'zahlofant';
  },

  speakQuestion() {
    if (!STATE.isPlaying) return Promise.resolve();
    const { mode, groups, operation } = STATE.currentTask;
    const character = this.mascotCharacter();

    // Während die Aufgabe vorgelesen wird, "denkt" das Maskottchen nach;
    // danach zurück zu idle (egal ob Sprachausgabe erfolgreich war oder nicht).
    // setIfCurrent() statt set(): falls währenddessen z.B. Hilfe getippt
    // wurde (Mascot.flyTo()), soll dieser verzögerte Callback die neuere
    // Pose nicht überschreiben.
    const thinkingGen = Mascot.set(EL.mascotGame, character, 'thinking');
    const resetMascotIdle = () => Mascot.setIfCurrent(EL.mascotGame, character, 'idle', thinkingGen);

    if (mode === 'count') {
      // Nur die kurze Frage vorlesen, keine Objekt-Wiederholung
      return TTS.speak(['fixed_count_question']).then(resetMascotIdle, resetMascotIdle);
    }

    if (mode === 'lettersHear') {
      // Buchstabe + Beispielwort ansagen, z.B. "B wie Ball"
      const target = groups[0].motif;
      const spokenLetter = STATE.currentTask.answer;
      return TTS.speak([TTS.letterKey(spokenLetter), 'glue_wie', TTS.wordKey(target.lower)]).then(resetMascotIdle, resetMascotIdle);
    }

    if (mode === 'lettersFind') {
      return TTS.speak(['glue_find_lead', TTS.letterKey(STATE.currentTask.answer)]).then(resetMascotIdle, resetMascotIdle);
    }

    // Addieren/Subtrahieren: Zahlen und Objektnamen ansagen, nicht jedes Objekt einzeln aufzählen
    const [groupA, groupB] = groups;
    let sequence;
    if (operation === 'add') {
      sequence = [
        TTS.numberKey(groupA.count), TTS.motifKey(groupA.motif, groupA.count), 'glue_plus',
        TTS.numberKey(groupB.count), TTS.motifKey(groupB.motif, groupB.count), 'glue_add_tail'
      ];
    } else {
      sequence = [
        'glue_sub_lead', TTS.numberKey(groupA.count), TTS.motifKey(groupA.motif, groupA.count),
        'glue_sub_mid', TTS.numberKey(groupB.count), TTS.motifKey(groupB.motif, groupB.count), 'glue_sub_tail'
      ];
    }
    return TTS.speak(sequence).then(resetMascotIdle, resetMascotIdle);
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

    const character = this.mascotCharacter();
    const isLetterMode = STATE.mode === 'lettersHear' || STATE.mode === 'lettersFind';

    // confettiDone bekommt wie zuvor ein Timeout-Fallback
    // (requestAnimationFrame pausiert komplett, wenn der Tab in den
    // Hintergrund gerät) - siehe Mascot.cheer()/celebrate().
    const audioDone = withTimeout(TTS.playEffect('correct', STATE.currentTask.answer, isLetterMode), 4000);

    // RewardSystem entscheidet synchron, ob dieser Streak einen
    // Meilenstein trifft - danach GENAU EIN Maskottchen-Auftritt: der
    // normale cheer() (== der bisherige Ecke->Mitte-Auftritt) oder,
    // gesteigert, celebrate(level) mit Herz-Schwarm. Nie beides.
    const result = RewardSystem.recordCorrect(STATE.mode);
    const effectsDone = result.milestoneLevel
      ? Mascot.celebrate(result.milestoneLevel, EL.mascotGame, character, EL.motifStage, {
          size: { width: 120, height: 120 },
          holdUntil: audioDone
        })
      : Mascot.cheer(EL.mascotGame, character, EL.motifStage, {
          size: { width: 120, height: 120 },
          holdUntil: audioDone
        });

    // Update state
    STATE.streak++;
    STATE.totalCorrect++;

    this.saveState();
    this.updateUI();

    // Show brief feedback
    this.showFeedback('Richtig! 🎉', 'correct');

    // Erst zur nächsten Aufgabe wechseln, wenn Audio UND Maskottchen-Feier fertig sind
    Promise.all([effectsDone, audioDone]).then(() => {
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
    const audioDone = TTS.playEffect('wrong', wrongValue, isLetterMode);

    // Stiller Reset des rundenlokalen Reward-Streaks - kein sichtbares
    // Bestrafungs-Feedback (siehe rewardSystem.js), STATE.streak/der
    // Fortschrittsring bleiben davon unberührt.
    RewardSystem.recordWrong(STATE.mode);

    // encourage() - es gibt keine eigene "traurige" Pose (siehe CLAUDE.md),
    // das nachdenkliche Wippen wirkt aber aufmunternd genug für "versuch's
    // nochmal". holdUntil sorgt dafür, dass das Maskottchen mindestens so
    // lange bleibt, wie die Sprachausgabe dauert, statt nach einer
    // geschätzten Festzeit zu verschwinden.
    Mascot.encourage(EL.mascotGame, this.mascotCharacter(), EL.motifStage, {
      size: { width: 100, height: 100 },
      holdUntil: audioDone
    });

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

  // Hilfe-Funktion: zeigt (statt verrät per Sprache) die richtige Antwort -
  // das Maskottchen fliegt von der Kopfzeile zum passenden Element (Options-
  // Button oder, im Finden-Modus, die richtige Kachel; siehe Mascot.flyTo())
  // und zeigt dort drauf, das Element bekommt zusätzlich einen pulsierenden
  // Hint-Rahmen. Antippen muss das Kind trotzdem selbst - Hilfe wählt nichts
  // automatisch aus und hat keine Auswirkung auf Streak/totalCorrect (siehe
  // handleCorrect/handleWrong).
  showHelp() {
    if (!STATE.isPlaying || STATE.isPaused || !STATE.currentTask) return;

    const { mode, answer } = STATE.currentTask;
    const isFind = mode === 'lettersFind';
    const targetEl = isFind
      ? EL.motifStage.querySelector('.letter-tile[data-correct="true"]')
      : Array.from(EL.optionButtons).find(btn => String(btn.dataset.value) === String(answer));
    if (!targetEl) return;

    Mascot.flyTo(EL.mascotGame, this.mascotCharacter(), targetEl, { holdMs: 1300 });

    const hintClass = isFind ? 'letter-tile--hint' : 'option-btn--hint';
    targetEl.classList.add(hintClass);
    setTimeout(() => targetEl.classList.remove(hintClass), 2200);

    return TTS.speak([`fixed_help_hint_${this.mascotCharacter()}`]).catch(() => {});
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

    // Menu button (back to mode select of the current category)
    EL.btnMenu.addEventListener('click', () => {
      if (STATE.isPaused) this.togglePause();
      // Bricht eine evtl. noch laufende Richtig/Falsch-Flugsequenz ab -
      // sonst bliebe das Kopfzeilen-Maskottchen unsichtbar hängen, bis die
      // unterbrochene Animation irgendwann von selbst zu Ende läuft.
      Mascot.cancelFlight(EL.mascotGame);
      const isLetterMode = STATE.mode === 'lettersHear' || STATE.mode === 'lettersFind' || STATE.mode === 'lettersDraw';
      this.showScreen(isLetterMode ? 'letters-mode-select' : 'mode-select');
    });

    // Menu button auf dem Zeichnen-Screen (eigener Screen, nicht Teil von
    // screen-game) - Zeichnen gibt es sowohl unter Buchstaben als auch
    // unter Zahlen (siehe js/traceDraw.js), daher je nach STATE.mode zurück
    // zur passenden Moduswahl statt fest zur Buchstaben-Moduswahl.
    EL.btnDrawMenu.addEventListener('click', () => {
      Mascot.cancelFlight(EL.mascotDraw);
      this.showScreen(STATE.mode === 'numbersDraw' ? 'mode-select' : 'letters-mode-select');
    });

    // Repeat button - sperrt sich selbst während der eigenen Ansage, sonst
    // würde ein Doppel-Tap dieselbe Sequenz zweimal überlappend abspielen
    // (siehe js/tts.js: jede Wiedergabe bekommt zwar ein frisches Audio-
    // Element, aber zwei gleichzeitige Ansagen wären trotzdem ein hörbares
    // Durcheinander statt einer sauberen Wiederholung).
    EL.btnRepeat.addEventListener('click', () => {
      if (EL.btnRepeat.disabled) return;
      EL.btnRepeat.disabled = true;
      Promise.resolve(this.speakQuestion()).finally(() => { EL.btnRepeat.disabled = false; });
    });

    // Help button - gleiche Selbstsperre wie beim Repeat-Button, siehe oben.
    EL.btnHelp.addEventListener('click', () => {
      if (EL.btnHelp.disabled) return;
      EL.btnHelp.disabled = true;
      Promise.resolve(this.showHelp()).finally(() => { EL.btnHelp.disabled = false; });
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

    // Pausiert automatisch, wenn der Tab in den Hintergrund gerät (z.B.
    // App-Wechsel). Bewusst KEIN Auto-Resume beim Zurückkommen: das
    // Pause-Menü bleibt offen, bis das Kind/die Aufsichtsperson explizit
    // "Weiterspielen" tippt - ein Spiel, das beim Zurückwechseln in den Tab
    // sofort und unangekündigt weiterläuft, wäre hier eher überraschend als
    // hilfreich.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.pauseGame();
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
    // Bewusst eine neue Aufgabe statt die pausierte fortzusetzen: nach einer
    // Unterbrechung (evtl. lange her) lieber frisch starten, als eine
    // Aufgabe zu zeigen, an die sich das Kind vielleicht nicht mehr erinnert.
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
    RewardSystem.resetRound();
    Mascot.cancelFlight(EL.mascotGame);
    this.saveState();
    this.updateUI();
    this.resumeGame();
  }
};
