/* ----------------------------
   Maskottchen (Buchstabino & Zahlofant)
   ---------------------------- */
const MASCOT_BASE = 'assets/mascots/buchstabino_zahlofant_assets/svg/';

export const Mascot = {
  // Setzt eine Pose auf einem Maskottchen-<img>. Weitere Posen (z.B.
  // "retry") lassen sich einfach ergänzen: SVG-Datei als
  // <character>_<pose>.svg ablegen und set()/greet()/celebrate() damit
  // aufrufen - keine weiteren Codeänderungen nötig. Die Pose-Animation
  // kommt automatisch aus dem [data-pose]-Selektor in style.css.
  set(imgEl, character, pose) {
    if (!imgEl) return;
    imgEl.src = `${MASCOT_BASE}${character}_${pose}.svg`;
    imgEl.dataset.pose = pose;
  },

  // Begrüßung: kurz winken, danach zurück zu idle.
  greet(imgEl, character, holdMs = 1400) {
    this.set(imgEl, character, 'waving');
    setTimeout(() => this.set(imgEl, character, 'idle'), holdMs);
  },

  // Kurzes Feiern nach einer richtigen Antwort, danach zurück zu idle.
  celebrate(imgEl, character, holdMs = 1500) {
    this.set(imgEl, character, 'celebrating');
    setTimeout(() => this.set(imgEl, character, 'idle'), holdMs);
  }
};
