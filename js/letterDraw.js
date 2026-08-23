import { EL } from './dom.js';
import { STATE } from './state.js';
import { TTS } from './tts.js';
import { Mascot } from './mascot.js';
import { Confetti } from './confetti.js';
import { withTimeout } from './utils.js';
import { Game } from './game.js';
import { LETTER_PATHS, LETTER_PATH_BOX } from './letterPaths.js';

/* ----------------------------
   Buchstaben zeichnen (Nachfahren + Freihand)
   ---------------------------- */
export const LetterDraw = {
  guideCtx: null,
  inkCtx: null,
  maskCanvas: null, // unsichtbares Offscreen-Canvas: enthält das Linienband für die Bewertung
  maskCtx: null,
  width: 0,
  height: 0,
  isDrawing: false,
  lastPoint: null,
  currentLetter: null,
  currentCase: 'upper',
  phase: 'guided', // 'guided' | 'freehand'

  // Nachfahren: harte Schwelle - unter 75% Abdeckung des Linienbands (siehe
  // maskBandWidth()/drawMask()) gilt "Fertig" nicht. Nicht höher, weil
  // selbst ein exaktes, zentriertes Nachfahren nie 100% des Bands erreicht
  // (siehe scoreDrawing()) - 0.75 lässt Puffer für zittrige Kinderhände.
  guidedPassScore: 0.75,
  // Freihand: ohne sichtbare Vorlage ist eine so hohe Trefferquote unrealistisch,
  // daher niedrigere (weiche) Schwelle - siehe handleNext() für die Begründung,
  // warum hier trotzdem immer weitergegangen wird statt hart zu blockieren.
  freehandPassScore: 0.4,
  // Anteil der Tinte, der AUSSERHALB des Linienbands liegen darf, bevor der
  // Versuch trotz ausreichender Coverage abgelehnt wird - verhindert, dass
  // querfeldein gekritzelt wird, solange nur genug vom Band getroffen wird.
  maxOverflowRatio: 0.45,

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
    EL.drawQuestion.textContent = `Fahre den Buchstaben „${this.currentLetter[this.currentCase]}“ nach`;
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

  // Skaliert/zentriert die feste Koordinatenbox aus letterPaths.js
  // (LETTER_PATH_BOX) gleichmäßig in die verfügbare Zeichenfläche - dieselbe
  // Transformation wird für Guide, Bewertungs-Maske und (indirekt) für die
  // Pfeilspitzen benutzt, damit immer alles exakt übereinander liegt.
  letterTransform() {
    const marginFactor = 0.78;
    const scale = Math.min(
      (this.width * marginFactor) / LETTER_PATH_BOX.width,
      (this.height * marginFactor) / LETTER_PATH_BOX.height
    );
    const offsetX = (this.width - LETTER_PATH_BOX.width * scale) / 2;
    const offsetY = (this.height - LETTER_PATH_BOX.height * scale) / 2;
    return { scale, offsetX, offsetY };
  },

  toCanvas(x, y, t) {
    return { x: t.offsetX + x * t.scale, y: t.offsetY + y * t.scale };
  },

  // Breite des Linienbands, das nachgefahren werden soll, und des
  // Tinten-Pinsels dazu - der Pinsel ist bewusst der Großteil der
  // Bandbreite (nicht nur ein dünner Strich), sonst kann selbst ein exakt
  // zentrierter Strich das Band nie ausreichend abdecken, egal wie
  // sorgfältig nachgefahren wird (siehe Gotchas in CLAUDE.md).
  maskBandWidth(t) {
    return Math.max(22, 11 * t.scale);
  },
  inkWidth(t) {
    return this.maskBandWidth(t) * 0.8;
  },

  // Baut aus den Pfaddaten des aktuellen Buchstabens (letterPaths.js) ein
  // Path2D in Bildschirmkoordinaten, plus für jeden Strich Start- und
  // Endpunkt der letzten Teilstrecke (für die Pfeilspitze, siehe
  // drawArrowhead()). Wird sowohl für den sichtbaren Guide als auch für
  // die unsichtbare Bewertungs-Maske benutzt, damit beide exakt übereinstimmen.
  buildLetterPath() {
    const letterKey = this.currentLetter[this.currentCase];
    const data = LETTER_PATHS[letterKey];
    const t = this.letterTransform();
    const path = new Path2D();
    const arrows = [];

    for (const stroke of data.strokes) {
      let from = null;
      let to = null;
      stroke.forEach(cmd => {
        const [type, ...args] = cmd;
        if (type === 'M') {
          to = this.toCanvas(args[0], args[1], t);
          path.moveTo(to.x, to.y);
          from = to;
        } else if (type === 'L') {
          from = to;
          to = this.toCanvas(args[0], args[1], t);
          path.lineTo(to.x, to.y);
        } else if (type === 'Q') {
          const control = this.toCanvas(args[0], args[1], t);
          from = control;
          to = this.toCanvas(args[2], args[3], t);
          path.quadraticCurveTo(control.x, control.y, to.x, to.y);
        }
      });
      // Nur einen Pfeil zeichnen, wenn der Strich lang genug ist - ein
      // Punkt-Strich (i-Punkt, j-Punkt) hätte sonst eine bedeutungslose
      // Zufallsrichtung.
      if (from && to && Math.hypot(to.x - from.x, to.y - from.y) > 4) {
        arrows.push({ from, to });
      }
    }

    return { path, arrows };
  },

  drawArrowhead(ctx, from, to) {
    const t = this.letterTransform();
    const size = Math.max(8, t.scale * 4.5);
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    ctx.save();
    ctx.translate(to.x, to.y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-size, size * 0.55);
    ctx.lineTo(-size * 0.6, 0);
    ctx.lineTo(-size, -size * 0.55);
    ctx.closePath();
    ctx.fillStyle = 'rgba(74, 144, 226, 0.9)';
    ctx.fill();
    ctx.restore();
  },

  // Anzeige: strichlierte Linie entlang des Pfads, den das Kind nachfahren
  // soll, plus eine Pfeilspitze am Ende jedes Strichs, die die
  // Schreibrichtung zeigt. Kein Systemschrift-Umriss mehr (siehe Gotchas in
  // CLAUDE.md) - die Pfaddaten aus letterPaths.js sind eine vereinfachte
  // "Handschrift-Mittellinie" durch den Buchstaben.
  drawGuide() {
    const ctx = this.guideCtx;
    const { path, arrows } = this.buildLetterPath();
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([14, 10]);
    ctx.lineWidth = Math.max(4, this.letterTransform().scale * 2.2);
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.75)';
    ctx.stroke(path);
    ctx.setLineDash([]);
    arrows.forEach(({ from, to }) => this.drawArrowhead(ctx, from, to));
    ctx.restore();
  },

  // Bewertungs-Maske: derselbe Pfad wie drawGuide(), aber als breiteres
  // Band (maskBandWidth()) auf einem unsichtbaren Offscreen-Canvas - das
  // ist die Grundlage für "wie viel % der Linie wurde nachgefahren?" in
  // scoreDrawing(). Bleibt für beide Phasen (Nachfahren + Freihand)
  // desselben Buchstabens erhalten, siehe beginFreehandPhase().
  drawMask() {
    const ctx = this.maskCtx;
    const { path } = this.buildLetterPath();
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = this.maskBandWidth(this.letterTransform());
    ctx.strokeStyle = '#000';
    ctx.stroke(path);
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
    ctx.lineWidth = this.inkWidth(this.letterTransform());
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
      const passed = coverage >= this.guidedPassScore && overflowRatio <= this.maxOverflowRatio;
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
        // Hartes "erneut versuchen" statt Weiterschalten: unter 75%
        // nachgefahrener Linie (oder zu viel Tinte ausserhalb des Bands)
        // gilt "Fertig" nicht. Die Zeichnung bleibt erhalten, damit einfach
        // weiter nachgefahren werden kann, statt von vorne anfangen zu müssen.
        Mascot.set(EL.mascotDraw, 'buchstabino', 'thinking');
        const message = overflowRatio > this.maxOverflowRatio
          ? 'Achte darauf, auf der Linie zu bleiben, und fahr sie weiter nach!'
          : 'Noch nicht ganz - fahr die Linie weiter nach!';
        TTS.speak(message, 'de-DE', {rate: 0.9}).then(
          () => Mascot.set(EL.mascotDraw, 'buchstabino', 'idle'),
          () => Mascot.set(EL.mascotDraw, 'buchstabino', 'idle')
        );
      }
    } else {
      // Freihand hat keine sichtbare Vorlage, die (unsichtbare) Band-Maske
      // vom Nachfahren bleibt aber bestehen (siehe drawMask()/
      // beginFreehandPhase()) und wird hier mit einer niedrigeren Schwelle
      // wiederverwendet - ohne das würde diese Phase JEDE Eingabe (auch
      // eine leere Fläche oder ein beliebiges Gekritzel) unterschiedslos
      // feiern. Anders als beim Nachfahren wird hier trotzdem immer
      // weitergegangen: ohne sichtbare Linie ist ein hartes Blockieren
      // nicht fair, das Kind soll nur ehrliches statt beliebiges Feedback
      // bekommen.
      const { coverage, overflowRatio } = this.scoreDrawing();
      const passed = coverage >= this.freehandPassScore && overflowRatio <= this.maxOverflowRatio + 0.1;
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
    const starCount = coverage >= this.guidedPassScore ? 3 : coverage >= 0.5 ? 2 : 1; // nie 0 Sterne: sanftes Feedback statt harter Fehlermeldung
    EL.drawStars.textContent = '⭐'.repeat(starCount) + '☆'.repeat(3 - starCount);
    EL.drawStars.hidden = false;
  },

  // Trefferanalyse per Grid-Sampling statt exaktem Pixelvergleich: prüft,
  // wie viel Prozent des Linienbands (drawMask(), siehe maskBandWidth())
  // mit Tinte bedeckt wurde (Coverage), und welcher Anteil der Tinte
  // ausserhalb dieses Bands liegt (overflowRatio) - ein Kritzel quer über
  // den ganzen Canvas trifft nur einen Bruchteil des schmalen Bands und
  // hat gleichzeitig hohen Overflow, fällt also zuverlässig durch, während
  // tatsächliches Nachfahren der Linie mit zittriger Kinderhand besteht.
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
