/* ----------------------------
   Schwebende Header-/Footer-Leisten: reale Höhe messen statt raten
   ----------------------------
   style.css reserviert über --header-h/--footer-h Platz für die
   schwebenden "Pillen"-Leisten (.game-header/.game-footer/.draw-header/
   .draw-footer/.mode-select__header), damit Bühneninhalt nie darunter
   verschwindet (siehe CLAUDE.md "Layout & visuelles Design"). Ein fest
   verdrahteter Schätzwert (--chrome-height, 64px) reicht dafür NICHT:
   auf echten Geräten kann z.B. der Footer mit 4 Buttons bei bestimmten
   Breiten/Schriftgrößen/Sprachen auf zwei Zeilen umbrechen und dadurch
   deutlich höher werden als angenommen - Web-Fonts (Baloo 2/Nunito/
   Chewy), Dynamic-Type-Einstellungen und Browser-UI-Eigenheiten (z.B.
   iOS Safari) verändern die tatsächliche Breite/Höhe zusätzlich. Dieses
   Modul misst deshalb die ECHTE gerenderte Höhe der aktuell sichtbaren
   Leisten und schreibt sie als CSS-Variablen auf :root - style.css nutzt
   --chrome-height nur noch als Fallback für den allerersten Render,
   bevor JS überhaupt gelaufen ist.

   Bewusst SYNCHRON, kein requestAnimationFrame/Debounce: ein erster
   Versuch verzögerte die Messung per doppeltem rAF, um sicherzugehen,
   dass Inhalte, die derselbe Aufrufer direkt nach dem Screen-Wechsel noch
   synchron setzt (z.B. selectMode()'s updateUI()), schon eingerechnet
   sind. Das erwies sich als Bug-Quelle: in Kontexten, in denen rAF nicht
   zuverlässig/zeitnah feuert (u.a. beobachtet in automatisierter
   Browser-Steuerung mit unfokussiertem Tab), blieb die Messung an einem
   Zwischenstand hängen. getBoundingClientRect() erzwingt bei Bedarf
   SELBST synchron ein Layout und liefert dabei immer den aktuellen DOM-/
   CSS-Zustand - kein Grund, auf einen Frame zu warten. Header-/
   Footer-Höhe hängen zudem nicht von dynamisch gesetzten Textinhalten ab
   (Footer-Button-Beschriftungen sind statisch; Header-Höhe wird von den
   festen Mascot-/Badge-Bildgrößen dominiert, nicht von Textbreite), daher
   ist ein synchroner Aufruf direkt nach dem `hidden`-Attribut-Wechsel in
   Game.showScreen() bereits korrekt.
*/

// .mode-select__header ist NUR auf dem Kategoriewahl-Screen (Startbildschirm)
// noch schwebend (siehe style.css) - auf den Moduswahl-Screens ist sie
// normaler Fließinhalt und darf hier NICHT mitgemessen werden, sonst würde
// zu viel Platz für den (dort viel kleineren) .btn-back-category-Button
// reserviert.
const TOP_CHROME_SELECTOR = '.game-header, .draw-header, .category-select .mode-select__header, .btn-back-category';
const BOTTOM_CHROME_SELECTOR = '.game-footer, .draw-footer';

function tallest(els) {
  let max = 0;
  els.forEach((el) => {
    const h = el.getBoundingClientRect().height;
    if (h > max) max = h;
  });
  return max;
}

export function measureLayoutChrome() {
  const screen = document.querySelector('.screen:not([hidden])');
  if (!screen) return;

  const headerH = tallest(screen.querySelectorAll(TOP_CHROME_SELECTOR));
  const footerH = tallest(screen.querySelectorAll(BOTTOM_CHROME_SELECTOR));

  const root = document.documentElement.style;
  // 0px ist ein gültiges, bewusstes Ergebnis (z.B. screen-category-select
  // hat keinen Footer) - nicht mit "noch nicht gemessen" verwechseln,
  // daher immer explizit setzen statt nur bei > 0.
  root.setProperty('--header-h', `${headerH}px`);
  root.setProperty('--footer-h', `${footerH}px`);
}

export function initLayoutChrome() {
  measureLayoutChrome();

  // Sicherheitsnetze für Größenänderungen, die kein Game.showScreen()-
  // Aufruf auslöst: echtes Fenster-Resize/Rotation, und ein Web-Font, der
  // erst nach dem ersten Layout eintrifft und dadurch den Zeilenumbruch
  // der Footer-Buttons nachträglich verändert.
  window.addEventListener('resize', measureLayoutChrome);
  window.addEventListener('orientationchange', measureLayoutChrome);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(measureLayoutChrome).catch(() => {});
  }
}
