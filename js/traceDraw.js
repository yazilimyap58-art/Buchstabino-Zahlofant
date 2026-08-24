import { EL } from './dom.js';
import { STATE } from './state.js';
import { TTS } from './tts.js';
import { Mascot } from './mascot.js';
import { withTimeout } from './utils.js';
import { Game } from './game.js';
import { RewardSystem } from './rewardSystem.js';
import { LETTER_PATHS, LETTER_PATH_BOX } from './letterPaths.js';
import { NUMBER_PATHS, NUMBER_PATH_BOX } from './numberPaths.js';

/* ----------------------------
   Nachfahren-Engine (Buchstaben + Zahlen, Nachfahren + Freihand)
   ----------------------------
   Generalisiert aus dem ursprünglichen, buchstaben-spezifischen
   js/letterDraw.js: die komplette Canvas-/Scoring-Logik (Pfad-
   Transformation, Bewertungs-Maske, Coverage/Overflow, Hilfe-Animation)
   hängt an keiner Stelle davon ab, ob ein Buchstabe oder eine Ziffer
   nachgefahren wird - nur die Pfaddaten, das Maskottchen und ein paar
   Texte/TTS-Keys unterscheiden sich. Diese Unterschiede stecken in
   MODE_CONFIGS; alles andere bleibt ein einziges, geteiltes Modul statt
   zwei fast identischer Kopien. */
const MODE_CONFIGS = {
  lettersDraw: {
    character: 'buchstabino',
    pathData: LETTER_PATHS,
    pathBox: LETTER_PATH_BOX,
    repeatAriaLabel: 'Buchstabe wiederholen',
    helpAriaLabel: 'Hilfe: Buchstabe vorzeichnen',
    // Zwei Fälle (Groß/Klein) pro Runde, wie im ursprünglichen letterDraw.js -
    // Fall wird bei jedem neuen Buchstaben neu gewürfelt.
    pickItem() {
      const letter = Game.pickRandomLetters(1)[0];
      const kase = Math.random() < 0.5 ? 'upper' : 'lower';
      return { key: letter[kase], display: letter[kase] };
    },
    traceQuestion: display => `Fahre den Buchstaben „${display}“ nach`,
    freehandQuestion: display => `Male den Buchstaben „${display}“ frei, ohne Hilfslinie`,
    speak: item => TTS.speak([TTS.letterKey(item.key), 'glue_wie', TTS.wordKey(item.key)]),
    messageKeys: {
      success: 'fixed_draw_success',
      retryOverflow: 'fixed_draw_retry_overflow',
      retryCoverage: 'fixed_draw_retry_coverage',
      freehandPass: 'fixed_draw_freehand_pass',
      freehandFail: 'fixed_draw_freehand_fail'
    }
  },
  numbersDraw: {
    character: 'zahlofant',
    pathData: NUMBER_PATHS,
    pathBox: NUMBER_PATH_BOX,
    repeatAriaLabel: 'Zahl wiederholen',
    helpAriaLabel: 'Hilfe: Zahl vorzeichnen',
    // Einstellige Zahlen (0-9), symmetrisch zu "ein Buchstabe" bei
    // lettersDraw - mehrstellige Zahlen bräuchten mehrere nebeneinander
    // positionierte Ziffern-Pfade und sind hier bewusst nicht abgedeckt.
    pickItem() {
      const digit = String(Math.floor(Math.random() * 10));
      return { key: digit, display: digit };
    },
    traceQuestion: display => `Fahre die Zahl „${display}“ nach`,
    freehandQuestion: display => `Male die Zahl „${display}“ frei, ohne Hilfslinie`,
    speak: item => TTS.speak([TTS.numberKey(Number(item.key))]),
    messageKeys: {
      success: 'fixed_draw_success_zahlofant',
      retryOverflow: 'fixed_draw_retry_overflow_zahlofant',
      retryCoverage: 'fixed_draw_retry_coverage_zahlofant',
      freehandPass: 'fixed_draw_freehand_pass_zahlofant',
      freehandFail: 'fixed_draw_freehand_fail_zahlofant'
    }
  }
};

export const TraceDraw = {
  guideCtx: null,
  inkCtx: null,
  maskCanvas: null, // unsichtbares Offscreen-Canvas: enthält das Linienband für die Bewertung
  maskCtx: null,
  width: 0,
  height: 0,
  isDrawing: false,
  lastPoint: null,
  modeId: null,
  modeConfig: null,
  currentItem: null, // { key, display } - key indiziert MODE_CONFIGS[...].pathData, display ist der Anzeige-/Sprachtext
  phase: 'guided', // 'guided' | 'freehand'
  // Sperrt Zeichenfläche + "Fertig"/"Weiter", solange die Erfolgs-Feier
  // (Maskottchen-Animation + Sprachausgabe) nach einem bestandenen Versuch
  // noch läuft - verhindert, dass ein zweiter Tap eine zweite, überlappende
  // Feier auslöst. Der Hilfe-Button prüft dieses Flag NICHT (bleibt immer
  // sofort bedienbar, nutzt nur seine eigene helpToken-Logik).
  inputLocked: false,

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
    // Selbstsperre während der eigenen Ansage - siehe game.js bindEvents()
    // btnRepeat für dieselbe Begründung (Doppel-Tap würde sonst dieselbe
    // Ansage überlappend zweimal abspielen).
    EL.btnDrawRepeat.addEventListener('click', () => {
      if (EL.btnDrawRepeat.disabled) return;
      EL.btnDrawRepeat.disabled = true;
      this.speakItem().finally(() => { EL.btnDrawRepeat.disabled = false; });
    });
    EL.btnDrawHelp.addEventListener('click', () => this.showHelp());
    EL.btnDrawNext.addEventListener('click', () => this.handleNext());
  },

  resize() {
    const rect = EL.drawInkCanvas.parentElement.getBoundingClientRect();
    if (rect.width === 0) return; // Screen gerade nicht sichtbar
    this.cancelHelp(); // Koordinaten einer laufenden Hilfe-Animation würden sonst nicht mehr zur neuen Größe passen
    this.width = rect.width;
    this.height = rect.height;
    [EL.drawGuideCanvas, EL.drawInkCanvas, this.maskCanvas].forEach(canvas => {
      canvas.width = rect.width * devicePixelRatio;
      canvas.height = rect.height * devicePixelRatio;
    });
    this.guideCtx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    this.inkCtx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    this.maskCtx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    if (this.currentItem) {
      this.drawMask();
      if (this.phase === 'guided') this.drawGuide();
    }
  },

  // modeId: 'lettersDraw' | 'numbersDraw' - wählt die MODE_CONFIGS-Konfiguration
  // (Pfaddaten, Maskottchen-Charakter, Texte/TTS-Keys) für die ganze Runde.
  start(modeId) {
    this.modeId = modeId;
    this.modeConfig = MODE_CONFIGS[modeId];
    // Ein evtl. noch gesetztes currentItem stammt vom vorigen Modus (z.B.
    // eine Ziffer aus numbersDraw) und existiert nicht in den Pfaddaten des
    // neuen Modus - resize() (unten) würde sonst sofort drawMask()/
    // buildItemPath() mit einem ungültigen Key aufrufen und crashen, bevor
    // pickNewItem() überhaupt ein neues, gültiges currentItem gesetzt hat.
    this.currentItem = null;
    this.inputLocked = false; // neue Runde darf nie gesperrt starten
    EL.btnDrawRepeat.setAttribute('aria-label', this.modeConfig.repeatAriaLabel);
    EL.btnDrawHelp.setAttribute('aria-label', this.modeConfig.helpAriaLabel);
    this.resize();
    this.pickNewItem();
  },

  pickNewItem() {
    this.currentItem = this.modeConfig.pickItem();
    this.beginGuidedPhase();
  },

  beginGuidedPhase() {
    this.cancelHelp();
    this.phase = 'guided';
    EL.drawGuideCanvas.hidden = false;
    EL.drawStars.hidden = true;
    EL.btnDrawNext.textContent = 'Fertig ✓';
    EL.drawQuestion.textContent = this.modeConfig.traceQuestion(this.currentItem.display);
    this.clearInk();
    this.drawMask();
    this.drawGuide();
    this.speakItem();
  },

  beginFreehandPhase() {
    this.cancelHelp();
    this.phase = 'freehand';
    EL.drawGuideCanvas.hidden = true;
    EL.drawStars.hidden = true;
    EL.btnDrawNext.textContent = 'Weiter ▶';
    EL.drawQuestion.textContent = this.modeConfig.freehandQuestion(this.currentItem.display);
    this.clearInk();
  },

  // Skaliert/zentriert die feste Koordinatenbox der aktiven Pfaddaten
  // (modeConfig.pathBox - LETTER_PATH_BOX oder NUMBER_PATH_BOX) gleichmäßig
  // in die verfügbare Zeichenfläche - dieselbe Transformation wird für
  // Guide, Bewertungs-Maske und (indirekt) für die Pfeilspitzen benutzt,
  // damit immer alles exakt übereinander liegt.
  pathTransform() {
    const marginFactor = 0.78;
    const box = this.modeConfig.pathBox;
    const scale = Math.min(
      (this.width * marginFactor) / box.width,
      (this.height * marginFactor) / box.height
    );
    const offsetX = (this.width - box.width * scale) / 2;
    const offsetY = (this.height - box.height * scale) / 2;
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

  // Baut aus den Pfaddaten des aktuellen Zeichens (Buchstabe oder Ziffer,
  // siehe modeConfig.pathData) ein Path2D in Bildschirmkoordinaten, plus
  // für jeden Strich Start- und Endpunkt der letzten Teilstrecke (für die
  // Pfeilspitze, siehe drawArrowhead()). Wird sowohl für den sichtbaren
  // Guide als auch für die unsichtbare Bewertungs-Maske benutzt, damit
  // beide exakt übereinstimmen.
  buildItemPath() {
    const data = this.modeConfig.pathData[this.currentItem.key];
    const t = this.pathTransform();
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

  // Läuft für die Hilfe-Marker-Animation (showHelp()): Punkte entlang aller
  // Striche des aktuellen Zeichens sampeln, als diskrete Punktfolge statt
  // Path2D (Path2D erlaubt keine Positions-Abfrage entlang des Pfads) -
  // dieselben M/L/Q-Segmente wie buildItemPath(), nur feiner aufgelöst.
  sampleStrokePoints(stepsPerSegment = 18) {
    const data = this.modeConfig.pathData[this.currentItem.key];
    const t = this.pathTransform();
    const strokesPoints = [];

    for (const stroke of data.strokes) {
      const points = [];
      let current = null;
      stroke.forEach(cmd => {
        const [type, ...args] = cmd;
        if (type === 'M') {
          current = this.toCanvas(args[0], args[1], t);
          points.push(current);
        } else if (type === 'L') {
          const to = this.toCanvas(args[0], args[1], t);
          points.push(to);
          current = to;
        } else if (type === 'Q') {
          const control = this.toCanvas(args[0], args[1], t);
          const to = this.toCanvas(args[2], args[3], t);
          for (let i = 1; i <= stepsPerSegment; i++) {
            const s = i / stepsPerSegment;
            points.push({
              x: (1 - s) * (1 - s) * current.x + 2 * (1 - s) * s * control.x + s * s * to.x,
              y: (1 - s) * (1 - s) * current.y + 2 * (1 - s) * s * control.y + s * s * to.y
            });
          }
          current = to;
        }
      });
      if (points.length > 1) strokesPoints.push(points);
    }
    return strokesPoints;
  },

  // Marker-Position für einen Fortschritt 0..1 über ALLE Striche hinweg,
  // proportional zur Punktzahl je Strich (nicht zur geometrischen Länge) -
  // für die kurze Hilfe-Animation ausreichend genau, kein Aufwand für
  // Bogenlängen-Parametrisierung nötig.
  pointAtProgress(strokesPoints, progress) {
    const totalPoints = strokesPoints.reduce((sum, pts) => sum + pts.length, 0);
    let target = progress * totalPoints;
    for (const pts of strokesPoints) {
      if (target < pts.length) {
        return pts[Math.min(pts.length - 1, Math.floor(target))];
      }
      target -= pts.length;
    }
    const lastStroke = strokesPoints[strokesPoints.length - 1];
    return lastStroke[lastStroke.length - 1];
  },

  // Hilfe-Funktion: das Maskottchen fliegt von der Kopfzeile zum Startpunkt
  // des Zeichen-Pfads (siehe Mascot.flyTo() - dort gibt es keinen echten
  // Options-Button wie in den anderen Modi, daher ein kleines Ziel-Rechteck
  // statt eines DOM-Elements) und ein Punkt fährt einmal den Pfad ab
  // (dieselben Daten wie der Guide - siehe sampleStrokePoints()). Zeigt
  // nichts, was der Guide nicht schon zeigt, nur langsam und explizit
  // vorgeführt, für Kinder, die trotz Linie/Pfeilen nicht wissen, wo/wie
  // sie anfangen sollen.
  showHelp() {
    if (STATE.isPaused || !this.currentItem) return;

    // Token statt reiner Boolean-Flag: eine laufende Animation muss sich
    // selbst abbrechen können, sobald pickNewItem()/beginGuidedPhase()/
    // beginFreehandPhase() (via cancelHelp()) oder ein erneuter Hilfe-Klick
    // sie ungültig gemacht hat - sonst würde eine alte rAF-Schleife nach
    // einem Zeichenwechsel weiterlaufen und den Marker falsch positionieren.
    this.helpToken = (this.helpToken || 0) + 1;
    const token = this.helpToken;

    const strokesPoints = this.sampleStrokePoints();
    if (strokesPoints.length === 0) return;

    // Noch etwas langsamer als die vorige Version (totalPoints * 18,
    // max 6000ms) - wirkte Kindern gegenüber immer noch zu zügig.
    const totalPoints = strokesPoints.reduce((sum, pts) => sum + pts.length, 0);
    const durationMs = Math.min(7000, Math.max(2600, totalPoints * 24));

    const canvasRect = EL.drawInkCanvas.getBoundingClientRect();
    const firstPoint = strokesPoints[0][0];
    const startTargetRect = {
      left: canvasRect.left + firstPoint.x - 20,
      top: canvasRect.top + firstPoint.y - 20,
      width: 40,
      height: 40
    };
    // align:'point' statt des Standards ('hand'/'below'): der Startpunkt
    // kann irgendwo auf der Zeichenfläche liegen (nicht wie bei einem
    // Options-Button immer oberhalb eines festen Platzes) - das Maskottchen
    // soll LINKS DANEBEN erscheinen und mit der ausgestreckten Zeigehand
    // (rechts am Körper) genau auf den Startpixel deuten, statt darunter zu
    // schweben und den Punkt zu verdecken.
    //
    // flightMs wird hier explizit mitgegeben (statt Mascot.flyTo()s eigenen
    // Default zu übernehmen), weil derselbe Wert unten auch den Start der
    // Punkt-Animation verzögert - das Maskottchen soll bereits am Startpixel
    // angekommen sein, BEVOR sich der Punkt in Bewegung setzt, statt beide
    // gleichzeitig loslaufen zu lassen (wirkte davor so, als würde der Punkt
    // dem noch ankommenden Maskottchen davonrennen).
    const flightMs = 700;
    Mascot.flyTo(EL.mascotDraw, this.modeConfig.character, startTargetRect, { holdMs: durationMs, align: 'point', flightMs });
    EL.drawHelpMarker.hidden = false;
    // Punkt schon sichtbar auf den Startpixel setzen, aber noch nicht
    // bewegen (startTime bleibt null, bis der verzögerte Loop unten
    // anläuft) - so steht er bereits sichtbar bereit, während das
    // Maskottchen noch heranfliegt.
    EL.drawHelpMarker.style.left = `${firstPoint.x}px`;
    EL.drawHelpMarker.style.top = `${firstPoint.y}px`;
    let startTime = null;

    const step = (now) => {
      if (token !== this.helpToken) return;
      if (startTime === null) startTime = now;
      const progress = Math.min(1, (now - startTime) / durationMs);
      const point = this.pointAtProgress(strokesPoints, progress);
      EL.drawHelpMarker.style.left = `${point.x}px`;
      EL.drawHelpMarker.style.top = `${point.y}px`;
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        EL.drawHelpMarker.hidden = true;
      }
    };
    setTimeout(() => {
      if (token !== this.helpToken) return;
      requestAnimationFrame(step);
    }, flightMs);
  },

  // Bricht eine laufende Hilfe-Marker-Animation ab (neues Zeichen, neue
  // Phase, Resize) - siehe Token-Erklärung in showHelp().
  cancelHelp() {
    this.helpToken = (this.helpToken || 0) + 1;
    EL.drawHelpMarker.hidden = true;
  },

  drawArrowhead(ctx, from, to) {
    const t = this.pathTransform();
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
  // Schreibrichtung zeigt. Kein Systemschrift-Umriss (siehe Gotchas in
  // CLAUDE.md) - die Pfaddaten aus letterPaths.js/numberPaths.js sind eine
  // vereinfachte "Handschrift-Mittellinie" durch das Zeichen.
  drawGuide() {
    const ctx = this.guideCtx;
    const { path, arrows } = this.buildItemPath();
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([14, 10]);
    ctx.lineWidth = Math.max(4, this.pathTransform().scale * 2.2);
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
  // desselben Zeichens erhalten, siehe beginFreehandPhase().
  drawMask() {
    const ctx = this.maskCtx;
    const { path } = this.buildItemPath();
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = this.maskBandWidth(this.pathTransform());
    ctx.strokeStyle = '#000';
    ctx.stroke(path);
    ctx.restore();
  },

  clearInk() {
    this.inkCtx.clearRect(0, 0, this.width, this.height);
  },

  speakItem() {
    // setIfCurrent() statt set(): falls währenddessen Hilfe getippt wurde
    // (Mascot.flyTo()), soll dieser verzögerte Callback die neuere Pose
    // nicht überschreiben (siehe Mascot.setIfCurrent()).
    const character = this.modeConfig.character;
    const thinkingGen = Mascot.set(EL.mascotDraw, character, 'thinking');
    const resetIdle = () => Mascot.setIfCurrent(EL.mascotDraw, character, 'idle', thinkingGen);
    return this.modeConfig.speak(this.currentItem).then(resetIdle, resetIdle);
  },

  getPoint(event) {
    const rect = EL.drawInkCanvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  },

  handlePointerDown(event) {
    if (STATE.isPaused || this.inputLocked) return;
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
    ctx.lineWidth = this.inkWidth(this.pathTransform());
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
    if (STATE.isPaused || this.inputLocked) return;
    const character = this.modeConfig.character;
    const messageKeys = this.modeConfig.messageKeys;

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
        // Wie bei Game.handleCorrect(): RewardSystem entscheidet, ob dieser
        // Streak einen Meilenstein trifft, danach GENAU EIN Maskottchen-
        // Auftritt (cheer() oder gesteigert celebrate(level)).
        this.inputLocked = true;
        const audioDone = withTimeout(TTS.speak([messageKeys.success]), 3000);
        const result = RewardSystem.recordCorrect(this.modeId);
        const effectsDone = result.milestoneLevel
          ? Mascot.celebrate(result.milestoneLevel, EL.mascotDraw, character, EL.drawInkCanvas, {
              size: { width: 110, height: 110 },
              holdUntil: audioDone
            })
          : Mascot.cheer(EL.mascotDraw, character, EL.drawInkCanvas, {
              size: { width: 110, height: 110 },
              holdUntil: audioDone
            });
        Promise.all([effectsDone, audioDone]).then(() => {
          this.inputLocked = false;
          this.beginFreehandPhase();
        });
      } else {
        // Hartes "erneut versuchen" statt Weiterschalten: unter 75%
        // nachgefahrener Linie (oder zu viel Tinte ausserhalb des Bands)
        // gilt "Fertig" nicht. Die Zeichnung bleibt erhalten, damit einfach
        // weiter nachgefahren werden kann, statt von vorne anfangen zu müssen.
        const thinkingGen = Mascot.set(EL.mascotDraw, character, 'thinking');
        const messageKey = overflowRatio > this.maxOverflowRatio
          ? messageKeys.retryOverflow
          : messageKeys.retryCoverage;
        const backToIdle = () => Mascot.setIfCurrent(EL.mascotDraw, character, 'idle', thinkingGen);
        TTS.speak([messageKey]).then(backToIdle, backToIdle);
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
        TTS.speak([passed ? messageKeys.freehandPass : messageKeys.freehandFail]),
        3000
      );

      if (passed) {
        // Wie beim Nachfahren (siehe oben): Fortschritt nur bei einer
        // tatsächlich validierten Leistung, hier ebenso gültig für die
        // Freihand-Phase - vorher fehlte das hier, sodass ein bestandener
        // Freihand-Durchgang nicht zu Streak/totalCorrect zählte.
        this.inputLocked = true;
        STATE.streak++;
        STATE.totalCorrect++;
        Game.saveState();
        const result = RewardSystem.recordCorrect(this.modeId);
        const effectsDone = result.milestoneLevel
          ? Mascot.celebrate(result.milestoneLevel, EL.mascotDraw, character, EL.drawInkCanvas, {
              size: { width: 110, height: 110 },
              holdUntil: audioDone
            })
          : Mascot.cheer(EL.mascotDraw, character, EL.drawInkCanvas, {
              size: { width: 110, height: 110 },
              holdUntil: audioDone
            });
        Promise.all([effectsDone, audioDone]).then(() => {
          this.inputLocked = false;
          this.pickNewItem();
        });
      } else {
        // encourage() - es gibt keine eigene "traurige" Pose (siehe
        // CLAUDE.md). Bewusst KEIN RewardSystem.recordWrong() hier: die
        // Freihand-Phase blockiert schon heute nicht hart und gibt nur
        // ehrliches Feedback statt eines echten Richtig/Falsch-Binärs -
        // ein Fehlschlag hier soll den Reward-Streak nicht zurücksetzen.
        // holdUntil: die "Guter Versuch..."-Nachricht ist deutlich länger
        // als die anderen Feedback-Sätze, ohne das würde das Maskottchen
        // oft schon wegfliegen, bevor sie zu Ende ist.
        this.inputLocked = true;
        const effectsDone = Mascot.encourage(EL.mascotDraw, character, EL.drawInkCanvas, {
          size: { width: 95, height: 95 },
          holdUntil: audioDone
        });
        Promise.all([effectsDone, audioDone]).then(() => {
          this.inputLocked = false;
          this.pickNewItem();
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

    // Set-Lookup statt verschachteltem cells.some()-Scan (O(n*m)): bei
    // größerer Zeichenfläche/vielen gefüllten Zellen sonst spürbar
    // trödelig, weil scoreDrawing() synchron im Klick-Handler von
    // "Fertig" läuft. ±toleranceCells Nachbarn werden direkt per Key
    // nachgeschlagen statt die komplette andere Zellliste zu durchsuchen.
    const cellKey = (c, r) => `${c},${r}`;
    const hasNeighbor = (cellSet, cell) => {
      for (let dc = -toleranceCells; dc <= toleranceCells; dc++) {
        for (let dr = -toleranceCells; dr <= toleranceCells; dr++) {
          if (cellSet.has(cellKey(cell[0] + dc, cell[1] + dr))) return true;
        }
      }
      return false;
    };
    const interiorSet = new Set(interiorCells.map(([c, r]) => cellKey(c, r)));
    const inkSet = new Set(inkCells.map(([c, r]) => cellKey(c, r)));

    const coverage = interiorCells.filter(cell => hasNeighbor(inkSet, cell)).length / interiorCells.length;
    const inkInsideCount = inkCells.filter(cell => hasNeighbor(interiorSet, cell)).length;
    const overflowRatio = 1 - inkInsideCount / inkCells.length;

    return { coverage, overflowRatio };
  }
};
