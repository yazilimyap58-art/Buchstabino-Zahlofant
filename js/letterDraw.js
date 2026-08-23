import { EL } from './dom.js';
import { STATE } from './state.js';
import { TTS } from './tts.js';
import { Mascot } from './mascot.js';
import { Confetti } from './confetti.js';
import { withTimeout } from './utils.js';
import { Game } from './game.js';

/* ----------------------------
   Buchstaben zeichnen (Nachfahren + Freihand)
   ---------------------------- */
export const LetterDraw = {
  guideCtx: null,
  inkCtx: null,
  maskCanvas: null, // unsichtbares Offscreen-Canvas: enthält die volle Buchstaben-Innenfläche für die Bewertung
  maskCtx: null,
  width: 0,
  height: 0,
  isDrawing: false,
  lastPoint: null,
  currentLetter: null,
  currentCase: 'upper',
  phase: 'guided', // 'guided' | 'freehand'
  inkLineWidth: 16,

  // Nachfahren: harte Schwelle - unter 90% Ausfüllung der Buchstaben-Innenfläche
  // gilt "Fertig" nicht, es muss weiter/erneut ausgemalt werden.
  fillPassScore: 0.9,
  // Freihand: ohne sichtbare Vorlage ist eine so hohe Trefferquote unrealistisch,
  // daher niedrigere (weiche) Schwelle - siehe handleNext() für die Begründung,
  // warum hier trotzdem immer weitergegangen wird statt hart zu blockieren.
  freehandFillPassScore: 0.35,
  // Anteil der Tinte, der AUSSERHALB der Buchstaben-Innenfläche liegen darf,
  // bevor der Versuch trotz hoher Coverage abgelehnt wird - verhindert, dass
  // schlicht die gesamte Fläche vollgemalt wird ("Coverage geschenkt").
  maxOverflowRatio: 0.55,

  init() {
    this.guideCtx = EL.drawGuideCanvas.getContext('2d');
    this.inkCtx = EL.drawInkCanvas.getContext('2d', { willReadFrequently: true });
    this.maskCanvas = document.createElement('canvas');
    this.maskCtx = this.maskCanvas.getContext('2d', { willReadFrequently: true });
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
    [EL.drawGuideCanvas, EL.drawInkCanvas, this.maskCanvas].forEach(canvas => {
      canvas.width = rect.width * devicePixelRatio;
      canvas.height = rect.height * devicePixelRatio;
    });
    this.guideCtx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    this.inkCtx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    this.maskCtx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    if (this.currentLetter) {
      this.drawMask();
      if (this.phase === 'guided') this.drawGuide();
    }
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
    EL.drawQuestion.textContent = `Mal den Buchstaben „${this.currentLetter[this.currentCase]}“ komplett aus`;
    this.clearInk();
    this.drawMask();
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

  // Gemeinsame Font-/Positionsangaben für Anzeige-Guide und (unsichtbare)
  // Bewertungs-Maske - müssen exakt übereinstimmen, sonst sieht das Kind
  // eine andere Fläche als die, die tatsächlich geprüft wird.
  glyphSpec() {
    return {
      font: `bold ${Math.floor(this.height * 0.72)}px system-ui, sans-serif`,
      x: this.width / 2,
      y: this.height / 2 + this.height * 0.02
    };
  },

  // Anzeige: großer Buchstabe aus Systemschrift statt handgepflegter
  // Pfaddaten pro Buchstabe (kein Content-Aufwand für Strichrichtung/Pfeile).
  // Leichte Füllung + Umrandung wie in einem Ausmalbild - macht sichtbar,
  // dass die ganze Fläche ausgemalt werden soll, nicht nur eine Linie
  // nachgefahren wird (siehe drawMask()/scoreDrawing() für die Bewertung,
  // die auf einer separaten, unsichtbaren Voll-Füllung basiert).
  drawGuide() {
    const ctx = this.guideCtx;
    const { font, x, y } = this.glyphSpec();
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(100, 116, 139, 0.16)';
    ctx.fillText(this.currentLetter[this.currentCase], x, y);
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.6)';
    ctx.strokeText(this.currentLetter[this.currentCase], x, y);
    ctx.restore();
  },

  // Bewertungs-Maske: dieselbe Buchstabenfläche voll (nicht nur als Umriss)
  // gefüllt, aber auf einem unsichtbaren Offscreen-Canvas - das ist die
  // Grundlage für "wie viel % der Buchstabenfläche wurden ausgemalt?" in
  // scoreDrawing(). Bleibt für beide Phasen (Nachfahren + Freihand)
  // desselben Buchstabens erhalten, siehe beginFreehandPhase().
  drawMask() {
    const ctx = this.maskCtx;
    const { font, x, y } = this.glyphSpec();
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000';
    ctx.fillText(this.currentLetter[this.currentCase], x, y);
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
      const { coverage, overflowRatio } = this.scoreDrawing();
      const passed = coverage >= this.fillPassScore && overflowRatio <= this.maxOverflowRatio;
      this.showStars(coverage);

      if (passed) {
        // Erst hier zählt der Versuch als abgeschlossen - Fortschritt wird
        // nur bei einer tatsächlich validierten Leistung fortgeschrieben.
        STATE.streak++;
        STATE.totalCorrect++;
        Game.saveState();
        Mascot.celebrate(EL.mascotDraw, 'buchstabino');
        const confettiDone = withTimeout(Confetti.trigger(), 2500);
        const audioDone = withTimeout(TTS.speak('Super gemacht!', 'de-DE', {rate: 0.9}), 3000);
        Promise.all([confettiDone, audioDone]).then(() => this.beginFreehandPhase());
      } else {
        // Hartes "erneut versuchen" statt Weiterschalten: unter 90%
        // ausgemalter Fläche (oder zu viel Tinte ausserhalb des Buchstabens)
        // gilt "Fertig" nicht. Die Zeichnung bleibt erhalten, damit einfach
        // weiter ausgemalt werden kann, statt von vorne anfangen zu müssen.
        Mascot.set(EL.mascotDraw, 'buchstabino', 'thinking');
        const message = overflowRatio > this.maxOverflowRatio
          ? 'Achte darauf, innerhalb des Buchstabens zu bleiben, und mal weiter aus!'
          : 'Noch nicht ganz - mal den Buchstaben weiter aus!';
        TTS.speak(message, 'de-DE', {rate: 0.9}).then(
          () => Mascot.set(EL.mascotDraw, 'buchstabino', 'idle'),
          () => Mascot.set(EL.mascotDraw, 'buchstabino', 'idle')
        );
      }
    } else {
      // Freihand hat keine sichtbare Vorlage, die (unsichtbare) Maske vom
      // Nachfahren bleibt aber bestehen (siehe drawMask()/beginFreehandPhase())
      // und wird hier für eine deutlich grosszügigere, aber echte Prüfung
      // wiederverwendet - ohne das würde diese Phase JEDE Eingabe (auch eine
      // leere Fläche) unterschiedslos als "Toll gemalt!" feiern. Anders als
      // beim Nachfahren wird hier trotzdem immer weitergegangen: ohne
      // sichtbare Linie ist ein hartes Blockieren nicht fair, das Kind soll
      // nur ehrliches statt beliebiges Feedback bekommen.
      const { coverage, overflowRatio } = this.scoreDrawing();
      const passed = coverage >= this.freehandFillPassScore && overflowRatio <= this.maxOverflowRatio + 0.1;
      const audioDone = withTimeout(
        TTS.speak(passed ? 'Toll gemalt!' : 'Guter Versuch! Versuch dich beim nächsten Mal genau an die Form zu erinnern.', 'de-DE', {rate: 0.9}),
        3000
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

  showStars(coverage) {
    const starCount = coverage >= this.fillPassScore ? 3 : coverage >= 0.5 ? 2 : 1; // nie 0 Sterne: sanftes Feedback statt harter Fehlermeldung
    EL.drawStars.textContent = '⭐'.repeat(starCount) + '☆'.repeat(3 - starCount);
    EL.drawStars.hidden = false;
  },

  // Trefferanalyse per Grid-Sampling statt exaktem Pixelvergleich: prüft,
  // wie viel Prozent der Buchstaben-INNENFLÄCHE (drawMask(), voll gefüllt,
  // nicht nur ein Umriss) mit Tinte bedeckt wurde (Coverage), und welcher
  // Anteil der Tinte ausserhalb dieser Fläche liegt (overflowRatio) - eine
  // einzelne Linie oder ein Kritzel über den ganzen Canvas fällt so
  // zuverlässig durch, ohne dass pixelgenaues Zeichnen nötig wäre.
  scoreDrawing() {
    const gridStep = 6;
    const toleranceCells = 1; // ±1 Zelle (~6px) Toleranz für zittrige Kinderhände, nicht mehr
    const dpr = window.devicePixelRatio || 1;
    const maskData = this.maskCtx.getImageData(0, 0, this.maskCanvas.width, this.maskCanvas.height);
    const inkData = this.inkCtx.getImageData(0, 0, EL.drawInkCanvas.width, EL.drawInkCanvas.height);
    const cols = Math.floor(this.width / gridStep);
    const rows = Math.floor(this.height / gridStep);

    const alphaAt = (imageData, x, y) => {
      const px = Math.floor(x * dpr);
      const py = Math.floor(y * dpr);
      if (px < 0 || py < 0 || px >= imageData.width || py >= imageData.height) return 0;
      return imageData.data[(py * imageData.width + px) * 4 + 3];
    };

    const interiorCells = [];
    const inkCells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * gridStep + gridStep / 2;
        const y = r * gridStep + gridStep / 2;
        if (alphaAt(maskData, x, y) > 40) interiorCells.push([c, r]);
        if (alphaAt(inkData, x, y) > 40) inkCells.push([c, r]);
      }
    }

    if (interiorCells.length === 0 || inkCells.length === 0) return { coverage: 0, overflowRatio: 0 };

    const hasNeighbor = (cells, cell) =>
      cells.some(([c, r]) => Math.abs(c - cell[0]) <= toleranceCells && Math.abs(r - cell[1]) <= toleranceCells);

    const coverage = interiorCells.filter(cell => hasNeighbor(inkCells, cell)).length / interiorCells.length;
    const inkInsideCount = inkCells.filter(cell => hasNeighbor(interiorCells, cell)).length;
    const overflowRatio = 1 - inkInsideCount / inkCells.length;

    return { coverage, overflowRatio };
  }
};
