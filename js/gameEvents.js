/* ----------------------------
   Minimaler Event-Bus (Belohnungssystem)
   ----------------------------
   Entkoppelt rewardSystem.js von rewardUI.js: Minispiele/RewardSystem
   müssen nichts über das Album/die Pflanzen-Anzeige wissen, die einfach
   nur zuhören. */
const listeners = new Map();

export const GameEvents = {
  on(event, handler) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(handler);
    return () => this.off(event, handler);
  },

  off(event, handler) {
    listeners.get(event)?.delete(handler);
  },

  // Ein fehlerhafter Listener darf nicht die anderen (oder den Aufrufer,
  // meist mitten in der Spiellogik) mit hochreißen.
  emit(event, payload) {
    const set = listeners.get(event);
    if (!set) return;
    set.forEach(handler => {
      try {
        handler(payload);
      } catch (e) {
        console.error(`GameEvents: Listener für "${event}" fehlgeschlagen`, e);
      }
    });
  }
};
