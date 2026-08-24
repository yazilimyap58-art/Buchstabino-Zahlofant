/* ----------------------------
   Herz-Feier: blockierendes Overlay + Herz-Schwarm
   ----------------------------
   Rein visuell, kennt keinen Spielzustand (wie js/confetti.js) - wird von
   Mascot.celebrate() beim Erreichen einer Streak-Stufe aufgerufen.
   Canvas statt einzelner DOM-Herzen aus demselben Grund wie Confetti:
   viele animierte Partikel sind auf Canvas GPU-günstiger als ebenso viele
   layoutete DOM-Knoten, und das Promise-basierte Lebenszyklus-Muster lässt
   sich 1:1 von Confetti.trigger() übernehmen. */
import { celebrateTier, prefersReducedMotion } from './timings.js';

const overlay = document.getElementById('celebration-overlay');
const canvas = document.getElementById('hearts-canvas');

// Herzanzahl pro Stufe - Herzen fliegen bewusst häufiger/dichter als das
// bestehende Konfetti, siehe CLAUDE.md-Auftrag ("Herzen sollen öfter
// ausgelöst werden"). Bei prefers-reduced-motion deutlich reduziert.
function heartCountFor(level, reduced) {
  const full = level >= 10 ? 42 : level === 5 ? 26 : 14;
  return reduced ? Math.max(4, Math.round(full / 3)) : full;
}

export const Celebration = {
  ctx: null,
  width: 0,
  height: 0,
  particles: [],
  _gen: 0,
  _rafId: null,

  init() {
    if (!canvas) return;
    this.ctx = canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
  },

  resize() {
    if (!canvas || !this.ctx) return;
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    canvas.width = this.width * devicePixelRatio;
    canvas.height = this.height * devicePixelRatio;
    this.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  },

  // Zeigt das blockierende Overlay + Herz-Schwarm für Streak-Stufe `level`
  // (3|5|10 - jede weitere 5er-Stufe nutzt Stufe 10, siehe timings.js).
  // Gibt ein Promise zurück, das aufgelöst wird, sobald alle Herzen
  // verblasst sind und das Overlay wieder entfernt ist.
  showHearts(level) {
    if (!overlay || !canvas || !this.ctx) return Promise.resolve();

    const myGen = ++this._gen;
    const reduced = prefersReducedMotion();
    const tier = celebrateTier(level);
    const durationMs = reduced ? Math.round(tier.heartsMs * 0.55) : tier.heartsMs;
    const count = heartCountFor(level, reduced);

    overlay.hidden = false;
    overlay.getBoundingClientRect(); // Reflow erzwingen, damit die opacity-Transition greift
    overlay.classList.add('is-visible');

    this.particles = [];
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: Math.random() * this.width,
        y: this.height + 20 + Math.random() * 120,
        size: (reduced ? 20 : 30) + Math.random() * (reduced ? 12 : 34),
        drift: (Math.random() - 0.5) * (reduced ? 0.4 : 1.5),
        speed: (reduced ? 0.35 : 0.55) + Math.random() * (reduced ? 0.3 : 0.6),
        rotation: (Math.random() - 0.5) * 0.5,
        delayMs: Math.random() * durationMs * 0.5
      });
    }

    const startTime = performance.now();
    return new Promise(resolve => {
      const step = (now) => {
        // Durch cancel() oder eine neuere showHearts() ungültig geworden -
        // gleiches Wächter-Muster wie Mascot._flightGen.
        if (myGen !== this._gen) return;

        const elapsed = now - startTime;
        this.ctx.clearRect(0, 0, this.width, this.height);

        let stillAlive = false;
        for (const p of this.particles) {
          if (elapsed < p.delayMs) { stillAlive = true; continue; }
          const life = elapsed - p.delayMs;
          const lifeRatio = life / durationMs;
          if (lifeRatio >= 1) continue;
          stillAlive = true;
          const opacity = lifeRatio < 0.15 ? lifeRatio / 0.15 : Math.max(0, 1 - (lifeRatio - 0.15) / 0.85);
          const y = p.y - p.speed * life;
          const x = p.x + p.drift * (life / 16);
          this.drawHeart(x, y, p.size, p.rotation, opacity);
        }

        if (stillAlive) {
          this._rafId = requestAnimationFrame(step);
        } else {
          this._finish(myGen, resolve);
        }
      };
      this._rafId = requestAnimationFrame(step);
    });
  },

  drawHeart(x, y, size, rotation, opacity) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.globalAlpha = opacity;
    ctx.font = `${size}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('❤️', 0, 0);
    ctx.restore();
  },

  _finish(gen, resolve) {
    if (gen !== this._gen) return;
    this.ctx.clearRect(0, 0, this.width, this.height);
    overlay.classList.remove('is-visible');
    setTimeout(() => {
      if (gen !== this._gen) return; // eine neue Feier hat inzwischen begonnen
      overlay.hidden = true;
    }, 220);
    resolve();
  },

  // Bricht eine laufende Feier sofort ab und räumt das Overlay restlos auf
  // - aufgerufen von Mascot.cancelFlight() (Menü verlassen mitten in einer
  // Feier), sonst bliebe das blockierende Overlay dauerhaft über dem neuen
  // Screen liegen (kein DOM-Leak, aber ein permanenter Eingabe-Stopper).
  cancel() {
    this._gen++;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = null;
    this.particles = [];
    if (this.ctx) this.ctx.clearRect(0, 0, this.width, this.height);
    if (overlay) {
      overlay.classList.remove('is-visible');
      overlay.hidden = true;
    }
  }
};
