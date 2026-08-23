/* ----------------------------
   Confetti Effect (simple)
   ---------------------------- */
export const Confetti = {
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

    // Rückwärts iterieren statt forEach+splice: splice() während einer
    // forEach-Iteration lässt das nachrückende Element für diesen Frame
    // aus (das Array verschiebt sich unter dem laufenden Index) - rückwärts
    // verschiebt splice() nur bereits besuchte Indizes, nie noch offene.
    for (let idx = this.particles.length - 1; idx >= 0; idx--) {
      const p = this.particles[idx];

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
        continue;
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
    }

    requestAnimationFrame(() => this.update());
  }
};
