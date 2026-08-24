/* ----------------------------
   Maskottchen (Buchstabino & Zahlofant)
   ---------------------------- */
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
    const targetLeft = align === 'center'
      ? targetRect.left + targetRect.width / 2 - w / 2
      : targetRect.left + targetRect.width / 2 - w * handXFraction;
    const targetTop = vAlign === 'center'
      ? targetRect.top + targetRect.height / 2 - h / 2
      : targetRect.bottom + gap;

    requestAnimationFrame(() => {
      if (!stillCurrent()) return;
      flyer.style.left = `${targetLeft}px`;
      flyer.style.top = `${targetTop}px`;
    });

    // "Große Feier" (Richtig/Falsch-Center-Stage, siehe Game.handleCorrect()/
    // handleWrong()/LetterDraw) erkennbar an align+vAlign beide 'center' -
    // im Unterschied zur Hilfe-Funktion (align 'hand', vAlign 'below'), die
    // nur auf ein Element zeigt und den Hintergrund nicht abdunkeln soll.
    // Nur für diesen Fall blendet sich beim Ankommen ein Hintergrund-Scrim
    // ein, der das Maskottchen optisch nach vorne holt (siehe
    // _showBackdrop()/_hideBackdrop()), und beim Rückflug wieder aus.
    const isCelebration = align === 'center' && vAlign === 'center';

    const flyBack = () => {
      if (!stillCurrent()) return;
      if (isCelebration) this._hideBackdrop();
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
      if (isCelebration) this._showBackdrop();
      if (onArrive) onArrive();

      const minHold = new Promise(resolve => setTimeout(resolve, holdMs));
      const settled = holdUntil ? Promise.all([minHold, holdUntil.then(() => {}, () => {})]) : minHold;
      // Sicherheitsnetz: falls holdUntil aus irgendeinem Grund nie
      // auflöst, trotzdem spätestens nach holdMs+4000 zurückfliegen -
      // sonst bliebe das Maskottchen für immer auf der Bühne stehen.
      Promise.race([settled, new Promise(resolve => setTimeout(resolve, holdMs + 4000))]).then(flyBack);
    }, flightMs);
  },

  // Lazy erzeugtes, geteiltes Abdunkel-Element hinter dem Flyer (unter
  // #mascot-flyer im z-index, siehe style.css) - holt die Center-Stage-
  // Feier optisch nach vorne, statt dass Maskottchen/Konfetti/Herzen einfach
  // auf dem normalen (hellen) Spielhintergrund schweben.
  _ensureBackdrop() {
    let bd = document.getElementById('mascot-backdrop');
    if (bd) return bd;
    bd = document.createElement('div');
    bd.id = 'mascot-backdrop';
    bd.className = 'mascot-backdrop';
    bd.hidden = true;
    bd.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bd);
    return bd;
  },

  _showBackdrop() {
    const bd = this._ensureBackdrop();
    bd.hidden = false;
    bd.getBoundingClientRect(); // Reflow erzwingen, sonst greift die Transition nicht
    bd.classList.add('mascot-backdrop--visible');
  },

  _hideBackdrop() {
    const bd = document.getElementById('mascot-backdrop');
    if (!bd) return;
    bd.classList.remove('mascot-backdrop--visible');
    setTimeout(() => { bd.hidden = true; }, 350);
  },

  // Bricht eine laufende flyTo()-Animation für `sourceImgEl` sofort ab und
  // stellt den Ausgangszustand wieder her (Flyer weg, Kopfzeilen-Bild
  // wieder sichtbar) - für Navigations-Punkte wie den Menü-Button, damit
  // beim Verlassen eines Minispiels mitten in einer Feier kein "hängender"
  // Zustand entsteht (Kopfzeilen-Maskottchen bliebe sonst unsichtbar, bis
  // die unterbrochene Animation irgendwann von selbst zu Ende läuft).
  cancelFlight(sourceImgEl) {
    if (!sourceImgEl) return;
    this._flightGen.set(sourceImgEl, (this._flightGen.get(sourceImgEl) || 0) + 1);
    sourceImgEl.style.visibility = '';
    const flyer = document.getElementById('mascot-flyer');
    if (flyer) flyer.hidden = true;
    // Falls die abgebrochene Animation eine Center-Stage-Feier war, sonst
    // bliebe der Hintergrund-Scrim (siehe _showBackdrop()) dauerhaft dunkel
    // hängen, obwohl kein Maskottchen mehr sichtbar ist.
    this._hideBackdrop();
  }
};
