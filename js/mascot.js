/* ----------------------------
   Maskottchen (Buchstabino & Zahlofant)
   ---------------------------- */
const MASCOT_BASE = 'assets/mascots/buchstabino_zahlofant_assets/svg/';

export const Mascot = {
  // Zählt pro Maskottchen-<img> hoch, wie oft set() aufgerufen wurde - Basis
  // für setIfCurrent() (siehe dort), damit ein verzögerter "zurück zu idle"-
  // Callback (nach TTS o.ä.) eine inzwischen neuer gesetzte Pose nicht
  // stumm überschreibt.
  _gen: new WeakMap(),

  // Zählt pro Quell-<img> hoch, wie oft flyTo() für dieses Element gestartet
  // wurde - lässt eine noch laufende Hinflug-/Rückflug-Animation abbrechen,
  // falls flyTo() erneut aufgerufen wird (z.B. Doppel-Tap auf Hilfe), statt
  // dass sich zwei Zeitpläne überlappen und den Flyer widersprüchlich
  // positionieren.
  _flightGen: new WeakMap(),

  // Setzt eine Pose auf einem Maskottchen-<img>. Weitere Posen (z.B.
  // "retry") lassen sich einfach ergänzen: SVG-Datei als
  // <character>_<pose>.svg ablegen und set()/greet()/celebrate() damit
  // aufrufen - keine weiteren Codeänderungen nötig. Die Pose-Animation
  // kommt automatisch aus dem [data-pose]-Selektor in style.css.
  // Gibt die neue Generation zurück (siehe setIfCurrent()).
  set(imgEl, character, pose) {
    if (!imgEl) return -1;
    const gen = (this._gen.get(imgEl) || 0) + 1;
    this._gen.set(imgEl, gen);
    imgEl.src = `${MASCOT_BASE}${character}_${pose}.svg`;
    imgEl.dataset.pose = pose;
    return gen;
  },

  // Wie set(), wird aber ignoriert, falls seit dem set()-Aufruf, der `gen`
  // geliefert hat, schon ein neuerer set()/greet()/celebrate()/flyTo()-Aufruf
  // für dasselbe Element stattgefunden hat. Für "nach Aktion X zurück zu
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

  // Kurzes Feiern nach einer richtigen Antwort, danach zurück zu idle.
  celebrate(imgEl, character, holdMs = 1500) {
    const gen = this.set(imgEl, character, 'celebrating');
    setTimeout(() => this.setIfCurrent(imgEl, character, 'idle', gen), holdMs);
  },

  // Hilfe-Funktion: `sourceImgEl` (das feste Kopfzeilen-Maskottchen) fliegt
  // sichtbar zu `target` (ein DOM-Element ODER ein bereits fertiges
  // {left, top, width, height}-Rechteck in Viewport-Koordinaten, z.B. für
  // den Zeichnen-Modus, der keinen Options-Button hat), zeigt dort in der
  // "pointing"-Pose, und fliegt danach zurück.
  //
  // Technik: `sourceImgEl` selbst bewegt sich NICHT - es bliebe sonst eine
  // Lücke im Kopfzeilen-Layout (position: fixed nimmt Elemente aus dem
  // normalen Fluss), und Nachbarelemente (Fortschrittsring, Streak-Anzeige)
  // würden nachrücken. Stattdessen wird `sourceImgEl` unsichtbar
  // (visibility: hidden, behält seinen Platz) und eine geteilte, bereits im
  // Body liegende Flyer-Kopie (#mascot-flyer) exakt darüber gelegt (FLIP:
  // erst ohne Transition an die Startposition, ein erzwungener Reflow,
  // danach Transition zur Zielposition) und wieder zurück animiert.
  flyTo(sourceImgEl, character, target, { holdMs = 1400, flightMs = 700 } = {}) {
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

    // set() (nicht nur ein direkter src-Wechsel) hält den Pose-Zustand von
    // sourceImgEl konsistent mit setIfCurrent()-Callbacks anderswo (z.B.
    // TTS' "thinking"->"idle"), obwohl sourceImgEl während des Flugs
    // unsichtbar ist - siehe setIfCurrent()-Kommentar oben.
    const poseGen = this.set(sourceImgEl, character, 'pointing');
    sourceImgEl.style.visibility = 'hidden';

    flyer.src = `${MASCOT_BASE}${character}_pointing.svg`;
    flyer.style.width = `${startRect.width}px`;
    flyer.style.height = `${startRect.height}px`;
    flyer.style.transition = 'none';
    flyer.style.left = `${startRect.left}px`;
    flyer.style.top = `${startRect.top}px`;
    flyer.hidden = false;
    flyer.getBoundingClientRect(); // Reflow erzwingen, bevor die Transition wieder greift
    flyer.style.transition = '';

    // Zielposition: UNTERHALB des Ziels (die erhobene Zeigehand im SVG
    // zeigt nach oben - siehe buchstabino_pointing.svg/zahlofant_pointing.svg,
    // "Finger"-<rect> in der rotierten Hand-<g>), mit etwas Abstand. Die
    // Hand sitzt dabei nicht in der Bildmitte, sondern deutlich rechts davon
    // (~82% der Bildbreite) - ohne Korrektur würde die Bildmitte über der
    // Antwort landen, aber die Hand selbst daneben zeigen. Das Bild wird
    // deshalb weiter nach links versetzt, als eine reine Mitten-Ausrichtung
    // es täte, damit die Hand die Antwort trifft.
    const handXFraction = 0.82;
    const gap = 10;
    const targetLeft = targetRect.left + targetRect.width / 2 - startRect.width * handXFraction;
    const targetTop = targetRect.bottom + gap;

    requestAnimationFrame(() => {
      if (!stillCurrent()) return;
      flyer.style.left = `${targetLeft}px`;
      flyer.style.top = `${targetTop}px`;
    });

    setTimeout(() => {
      if (!stillCurrent()) return;
      flyer.style.left = `${startRect.left}px`;
      flyer.style.top = `${startRect.top}px`;
      setTimeout(() => {
        if (!stillCurrent()) return;
        flyer.hidden = true;
        sourceImgEl.style.visibility = '';
        this.setIfCurrent(sourceImgEl, character, 'idle', poseGen);
      }, flightMs + 50);
    }, flightMs + holdMs);
  }
};
