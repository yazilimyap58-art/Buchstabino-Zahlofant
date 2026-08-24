/* ----------------------------
   Maskottchen (Buchstabino & Zahlofant)
   ---------------------------- */
import { Confetti } from './confetti.js';
import { Celebration } from './celebration.js';
import { withTimeout } from './utils.js';
import { TIMINGS, celebrateTier } from './timings.js';

const MASCOT_BASE = 'assets/mascots/buchstabino_zahlofant_assets/svg/';
// Für set()'s alt-Text-Update: manche <img>-Elemente (z.B. #mascot-game,
// #mascot-draw) zeigen je nach Modus/Charakter mal Buchstabino, mal
// Zahlofant - ohne diese Aktualisierung bliebe das im HTML fest verdrahtete
// alt-Attribut (z.B. "Zahlofant") stehen, obwohl das Bild längst zu
// Buchstabino gewechselt hat (Screenreader würden dann den falschen
// Charakter ansagen).
const DISPLAY_NAME = { buchstabino: 'Buchstabino', zahlofant: 'Zahlofant' };

export const Mascot = {
  // Zählt pro Maskottchen-<img> hoch, wie oft set() aufgerufen wurde - Basis
  // für setIfCurrent() (siehe dort), damit ein verzögerter "zurück zu idle"-
  // Callback (nach TTS o.ä.) eine inzwischen neuer gesetzte Pose nicht
  // stumm überschreibt.
  _gen: new WeakMap(),

  // Zählt pro Quell-<img> hoch, wie oft flyTo() für dieses Element gestartet
  // wurde - lässt eine noch laufende Hinflug-/Rückflug-Animation abbrechen,
  // falls flyTo() erneut aufgerufen wird (z.B. Doppel-Tap auf Hilfe, oder
  // schnell hintereinander richtig/falsch), statt dass sich zwei Zeitpläne
  // überlappen und den Flyer widersprüchlich positionieren.
  _flightGen: new WeakMap(),

  // Setzt eine Pose auf einem Maskottchen-<img>. Weitere Posen (z.B.
  // "retry") lassen sich einfach ergänzen: SVG-Datei als
  // <character>_<pose>.svg ablegen und set()/greet()/flyTo() damit
  // aufrufen - keine weiteren Codeänderungen nötig. Die Pose-Animation
  // kommt automatisch aus dem [data-pose]-Selektor in style.css.
  // Gibt die neue Generation zurück (siehe setIfCurrent()).
  set(imgEl, character, pose) {
    if (!imgEl) return -1;
    const gen = (this._gen.get(imgEl) || 0) + 1;
    this._gen.set(imgEl, gen);
    imgEl.src = `${MASCOT_BASE}${character}_${pose}.svg`;
    imgEl.alt = DISPLAY_NAME[character] || imgEl.alt;
    imgEl.dataset.pose = pose;
    return gen;
  },

  // Wie set(), wird aber ignoriert, falls seit dem set()-Aufruf, der `gen`
  // geliefert hat, schon ein neuerer set()/greet()/flyTo()-Aufruf für
  // dasselbe Element stattgefunden hat. Für "nach Aktion X zurück zu
  // idle"-Callbacks (z.B. nach TTS): ohne das würde z.B. eine per Hilfe-
  // Button ausgelöste "pointing"-Pose von einem noch laufenden, älteren
  // "Frage vorlesen -> danach idle"-Callback überschrieben werden.
  setIfCurrent(imgEl, character, pose, gen) {
    if (!imgEl || this._gen.get(imgEl) !== gen) return;
    this.set(imgEl, character, pose);
  },

  // Begrüßung: kurz winken, danach zurück zu idle.
  greet(imgEl, character, holdMs = 1400) {
    const gen = this.set(imgEl, character, 'waving');
    setTimeout(() => this.setIfCurrent(imgEl, character, 'idle', gen), holdMs);
  },

  // `sourceImgEl` (das feste Kopfzeilen-Maskottchen) fliegt sichtbar zu
  // `target` (ein DOM-Element ODER ein bereits fertiges
  // {left, top, width, height}-Rechteck in Viewport-Koordinaten, z.B. für
  // den Zeichnen-Modus, der keinen Options-Button hat), nimmt dort `pose`
  // ein, und fliegt danach zurück. Zwei Anwendungsfälle:
  //  - Hilfe-Button: pose 'pointing', align 'hand' (siehe unten),
  //    vAlign 'below' - Maskottchen bleibt kopfzeilen-groß.
  //  - Richtig/Falsch-Feier: pose 'celebrating'/'thinking', align/vAlign
  //    'center', `size` deutlich größer als die Kopfzeile - Maskottchen
  //    "kommt herunter" auf die Bühne statt nur eine kleine Pose zu wechseln.
  //
  // Technik: `sourceImgEl` selbst bewegt sich NICHT - es bliebe sonst eine
  // Lücke im Kopfzeilen-Layout (position: fixed nimmt Elemente aus dem
  // normalen Fluss), und Nachbarelemente (Fortschrittsring, Streak-Anzeige)
  // würden nachrücken. Stattdessen wird `sourceImgEl` unsichtbar
  // (visibility: hidden, behält seinen Platz) und eine geteilte, bereits im
  // Body liegende Flyer-Kopie (#mascot-flyer) exakt darüber gelegt (FLIP:
  // erst ohne Transition an die Startposition, ein erzwungener Reflow,
  // danach Transition zur Zielposition) und wieder zurück animiert.
  flyTo(sourceImgEl, character, target, opts = {}) {
    const {
      // Mindest-Verweildauer am Ziel, BEVOR der Rückflug beginnt. Falls
      // `holdUntil` gesetzt ist, wird trotzdem gewartet, bis BEIDES erfüllt
      // ist (siehe dort) - `holdMs` ist dann nur eine Untergrenze, damit
      // das Maskottchen nicht "blitzartig" wieder verschwindet, falls die
      // Sprachausgabe außergewöhnlich kurz ist oder fehlschlägt.
      holdMs = 1400,
      flightMs = 700,
      // Optionales Promise (typischerweise ein laufendes TTS.speak()) -
      // der Rückflug wartet zusätzlich zu `holdMs` darauf, dass es sich
      // auflöst, damit das Maskottchen mindestens so lange bleibt, wie der
      // gesprochene Feedback-Text dauert, statt nach einer geschätzten
      // Festzeit zu verschwinden. Eine Ablehnung (z.B. TTS-Fehler) wird
      // wie eine Auflösung behandelt, kein Sicherheitsnetz nötig, da
      // `holdMs + 4000` als harte Obergrenze ohnehin greift (siehe unten).
      holdUntil = null,
      pose = 'pointing',
      // Größe des Flyers während des Flugs - null übernimmt die tatsächliche
      // Kopfzeilen-Größe (Hilfe-Button-Fall), ein {width,height}-Objekt
      // lässt das Maskottchen größer erscheinen (Richtig/Falsch-Feier).
      size = null,
      // 'hand': X-Position berücksichtigt, dass die erhobene Zeigehand im
      //   SVG rechts von der Bildmitte sitzt (siehe unten) - für die
      //   Hilfe-Funktion, die auf ein konkretes Element zeigen soll.
      // 'center': Bild schlicht mittig über/auf `target` - für die große
      //   Feier, wo nichts Bestimmtes angezeigt wird.
      // 'point': die Fingerspitze der Zeigehand landet EXAKT auf dem
      //   Mittelpunkt von `target` (beide Achsen, `vAlign` wird ignoriert)
      //   - für die Zeichnen-Hilfe, wo `target` ein konkreter Pixel auf der
      //   Zeichenfläche ist (nicht ein Button mit fester Höhe unterhalb),
      //   das Maskottchen also LINKS DANEBEN sitzen und mit der Hand
      //   hinüberzeigen soll statt darunter.
      align = 'hand',
      // 'below': unterhalb von `target` (Hilfe-Funktion).
      // 'center': mittig auf `target` (Feier, "kommt herunter auf die Bühne").
      vAlign = 'below',
      gap = 10,
      // Optionaler Callback, der genau dann feuert, wenn der Hinflug beim
      // Ziel ankommt (z.B. um Konfetti exakt beim Auftauchen des
      // Maskottchens statt zeitlich unabhängig davon zu starten).
      onArrive = null
    } = opts;
    if (!sourceImgEl || !target) return;
    const flyer = document.getElementById('mascot-flyer');
    if (!flyer) return;

    const myFlight = (this._flightGen.get(sourceImgEl) || 0) + 1;
    this._flightGen.set(sourceImgEl, myFlight);
    const stillCurrent = () => this._flightGen.get(sourceImgEl) === myFlight;

    const startRect = sourceImgEl.getBoundingClientRect();
    const targetRect = typeof target.getBoundingClientRect === 'function'
      ? target.getBoundingClientRect()
      : target;

    const w = size ? size.width : startRect.width;
    const h = size ? size.height : startRect.height;
    // Vom Mittelpunkt der Kopfzeilen-Position aus positionieren (nicht von
    // dessen Ecke) - sonst würde ein größerer Flyer (Feier-Fall) sichtbar
    // aus der oberen linken Ecke "herauswachsen" statt zentriert zu starten.
    const startCenterX = startRect.left + startRect.width / 2;
    const startCenterY = startRect.top + startRect.height / 2;

    // set() (nicht nur ein direkter src-Wechsel) hält den Pose-Zustand von
    // sourceImgEl konsistent mit setIfCurrent()-Callbacks anderswo (z.B.
    // TTS' "thinking"->"idle"), obwohl sourceImgEl während des Flugs
    // unsichtbar ist - siehe setIfCurrent()-Kommentar oben.
    const poseGen = this.set(sourceImgEl, character, pose);
    sourceImgEl.style.visibility = 'hidden';

    flyer.src = `${MASCOT_BASE}${character}_${pose}.svg`;
    flyer.style.width = `${w}px`;
    flyer.style.height = `${h}px`;
    flyer.style.transition = 'none';
    flyer.style.left = `${startCenterX - w / 2}px`;
    flyer.style.top = `${startCenterY - h / 2}px`;
    flyer.hidden = false;
    flyer.getBoundingClientRect(); // Reflow erzwingen, bevor die Transition wieder greift
    flyer.style.transition = '';

    // Zielposition. Im 'hand'-Modus (Hilfe-Funktion): UNTERHALB des Ziels
    // (die erhobene Zeigehand im SVG zeigt nach oben - siehe
    // buchstabino_pointing.svg/zahlofant_pointing.svg, "Finger"-<rect> in
    // der rotierten Hand-<g>), mit etwas Abstand. Die Hand sitzt dabei
    // nicht in der Bildmitte, sondern deutlich rechts davon (~82% der
    // Bildbreite) - ohne Korrektur würde die Bildmitte über der Antwort
    // landen, aber die Hand selbst daneben zeigen. Das Bild wird deshalb
    // weiter nach links versetzt, als eine reine Mitten-Ausrichtung es
    // täte, damit die Hand die Antwort trifft. Im 'center'-Modus (Feier)
    // ist nichts Bestimmtes anzuzeigen, daher schlicht mittig auf `target`.
    const handXFraction = 0.82;
    // Fingerspitze sitzt im 300x340-viewBox der pointing-SVGs bei etwa
    // x≈250-260/y≈70-90, also ungefähr (0.85, 0.24) der Bildgröße - für
    // align:'point' (siehe oben) wird das Bild so verschoben, dass genau
    // dieser Punkt auf `target` landet, statt die Bildmitte oder -kante.
    const handYFraction = 0.24;
    let targetLeft;
    let targetTop;
    if (align === 'point') {
      targetLeft = targetRect.left + targetRect.width / 2 - w * handXFraction;
      targetTop = targetRect.top + targetRect.height / 2 - h * handYFraction;
    } else {
      targetLeft = align === 'center'
        ? targetRect.left + targetRect.width / 2 - w / 2
        : targetRect.left + targetRect.width / 2 - w * handXFraction;
      targetTop = vAlign === 'center'
        ? targetRect.top + targetRect.height / 2 - h / 2
        : targetRect.bottom + gap;
    }

    // Sicherheitsabstand zum Viewport-Rand: bei align:'point' kann `target`
    // ein beliebiger Pixel sein (z.B. ein Buchstaben-Startpunkt nah am
    // linken Rand der Zeichenfläche) - ohne Klemmung würde das Bild dort
    // teilweise aus dem sichtbaren Bereich herausragen, weil der
    // Fingerspitzen-Versatz das Bild relativ weit nach links/oben schiebt.
    const edgeMargin = 8;
    targetLeft = Math.min(Math.max(targetLeft, edgeMargin), window.innerWidth - w - edgeMargin);
    targetTop = Math.min(Math.max(targetTop, edgeMargin), window.innerHeight - h - edgeMargin);

    requestAnimationFrame(() => {
      if (!stillCurrent()) return;
      flyer.style.left = `${targetLeft}px`;
      flyer.style.top = `${targetTop}px`;
    });

    const flyBack = () => {
      if (!stillCurrent()) return;
      flyer.style.left = `${startCenterX - w / 2}px`;
      flyer.style.top = `${startCenterY - h / 2}px`;
      setTimeout(() => {
        if (!stillCurrent()) return;
        flyer.hidden = true;
        sourceImgEl.style.visibility = '';
        this.setIfCurrent(sourceImgEl, character, 'idle', poseGen);
      }, flightMs + 50);
    };

    setTimeout(() => {
      if (!stillCurrent()) return;
      if (onArrive) onArrive();

      const minHold = new Promise(resolve => setTimeout(resolve, holdMs));
      const settled = holdUntil ? Promise.all([minHold, holdUntil.then(() => {}, () => {})]) : minHold;
      // Sicherheitsnetz: falls holdUntil aus irgendeinem Grund nie
      // auflöst, trotzdem spätestens nach holdMs+4000 zurückfliegen -
      // sonst bliebe das Maskottchen für immer auf der Bühne stehen.
      Promise.race([settled, new Promise(resolve => setTimeout(resolve, holdMs + 4000))]).then(flyBack);
    }, flightMs);
  },

  // Bricht eine laufende flyTo()-Animation für `sourceImgEl` sofort ab und
  // stellt den Ausgangszustand wieder her (Flyer weg, Kopfzeilen-Bild
  // wieder sichtbar) - für Navigations-Punkte wie den Menü-Button, damit
  // beim Verlassen eines Minispiels mitten in einer Feier kein "hängender"
  // Zustand entsteht (Kopfzeilen-Maskottchen bliebe sonst unsichtbar, bis
  // die unterbrochene Animation irgendwann von selbst zu Ende läuft).
  // Bricht ebenso eine laufende Herz-Feier ab (Celebration.cancel()) -
  // sonst bliebe das blockierende Overlay bei einem Rundenabbruch mitten
  // in einer Streak-Feier dauerhaft über dem neuen Screen liegen.
  cancelFlight(sourceImgEl) {
    if (!sourceImgEl) return;
    this._flightGen.set(sourceImgEl, (this._flightGen.get(sourceImgEl) || 0) + 1);
    sourceImgEl.style.visibility = '';
    const flyer = document.getElementById('mascot-flyer');
    if (flyer) flyer.hidden = true;
    Celebration.cancel();
  },

  // ----------------------------
  // Zustandsmaschine: cheer/celebrate/encourage/reward
  // ----------------------------
  // Bauen alle auf dem obigen flyTo()/set()/setIfCurrent() auf - diese
  // bleiben unverändert. Jede Antwort löst GENAU einen dieser Aufrufe aus,
  // nie flyTo() zusätzlich daneben (siehe CLAUDE.md-Auftrag "genau ein
  // Maskottchen-Auftritt pro Antwort").

  // Normale Richtig-Antwort-Feier - inhaltlich identisch mit dem
  // ursprünglichen, direkt in Game.handleCorrect() liegenden flyTo()-
  // Aufruf, hierher gezogen, damit alle Aufrufstellen (count/arithmetic/
  // lettersHear/lettersFind über Game.handleCorrect(), lettersDraw über
  // LetterDraw.handleNext()) dieselbe Logik statt eigener Kopien nutzen.
  cheer(sourceImgEl, character, target, opts = {}) {
    const { size = null, holdUntil = null } = opts;
    const t = TIMINGS.CHEER;
    return new Promise(resolve => {
      this.flyTo(sourceImgEl, character, target, {
        pose: 'celebrating',
        align: 'center',
        vAlign: 'center',
        size,
        holdMs: t.holdMs,
        flightMs: t.flightMs,
        holdUntil,
        onArrive: () => withTimeout(Confetti.trigger(), t.confettiTimeoutMs).then(resolve)
      });
    });
  },

  // Gesteigerter Auftritt bei einer Streak-Stufe (3|5|10, jede weitere
  // 5er-Stufe nutzt Stufe 10, siehe timings.js celebrateTier()): EIN
  // einziger flyTo()-Aufruf wie bei cheer() (kein zweiter Auftritt!),
  // onArrive löst Konfetti UND den Herz-Schwarm (Celebration.showHearts())
  // parallel aus.
  celebrate(level, sourceImgEl, character, target, opts = {}) {
    const { size = null, holdUntil = null } = opts;
    const t = celebrateTier(level);
    return new Promise(resolve => {
      this.flyTo(sourceImgEl, character, target, {
        pose: 'celebrating',
        align: 'center',
        vAlign: 'center',
        size,
        holdMs: t.holdMs,
        flightMs: t.flightMs,
        holdUntil,
        onArrive: () => {
          const confettiDone = withTimeout(Confetti.trigger(), t.confettiTimeoutMs);
          const heartsDone = withTimeout(Celebration.showHearts(level), t.heartsTimeoutMs);
          Promise.all([confettiDone, heartsDone]).then(resolve);
        }
      });
    });
  },

  // Falsch-Antwort-Auftritt - inhaltlich identisch mit dem ursprünglichen
  // Game.handleWrong()-flyTo()-Aufruf, nur zentralisiert.
  encourage(sourceImgEl, character, target, opts = {}) {
    const { size = null, holdUntil = null } = opts;
    const t = TIMINGS.ENCOURAGE;
    this.flyTo(sourceImgEl, character, target, {
      pose: 'thinking',
      align: 'center',
      vAlign: 'center',
      size,
      holdMs: t.holdMs,
      flightMs: t.flightMs,
      holdUntil
    });
  },

  // In-Place-Pose-Wechsel OHNE Flug (Sticker-Album/Eltern-Bereich-Reveals -
  // nicht an eine Antwort gebunden, daher kein Bühnenauftritt nötig).
  reward(imgEl, character, opts = {}) {
    const { holdMs = TIMINGS.REWARD_POSE_HOLD_MS } = opts;
    return new Promise(resolve => {
      const gen = this.set(imgEl, character, 'celebrating');
      setTimeout(() => {
        this.setIfCurrent(imgEl, character, 'idle', gen);
        resolve();
      }, holdMs);
    });
  }
};
