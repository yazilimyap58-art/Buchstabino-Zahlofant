/* ----------------------------
   Audio / TTS
   ---------------------------- */
export const TTS = {
  // SpeechSynthesis utterance wrapper
  speak(text, lang = 'de-DE', opts = {}) {
    return new Promise((resolve, reject) => {
      if (!('speechSynthesis' in window)) {
        reject('SpeechSynthesis not supported');
        return;
      }
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = lang;
      utter.rate = opts.rate || 0.9;
      utter.pitch = opts.pitch || 1.0;
      utter.volume = opts.volume || 1.0;
      utter.onend = () => resolve();
      utter.onerror = (err) => reject(err);
      window.speechSynthesis.speak(utter);
    });
  },

  // Play spoken feedback for a correct/wrong answer. Returns a promise that
  // resolves once the speech has finished playing. `value` ist bei
  // Zahlen-Modi eine Zahl, bei Buchstaben-Modi ein einzelner Buchstabe -
  // deshalb eigene Formulierung statt "Es sind X" (klingt bei Buchstaben falsch).
  playEffect(type, value, isLetter = false) {
    // Kein Punkt direkt nach der Zahl: sonst liest die Sprachausgabe sie als Ordinalzahl ("dritter" statt "drei")
    let text;
    if (isLetter) {
      text = type === 'correct' ? `Richtig! Das ist ${value}` : `Falsch! Das ist nicht ${value}`;
    } else {
      text = type === 'correct' ? `Richtig! Es sind ${value}` : `Falsch! Es sind nicht ${value}`;
    }
    return this.speak(text, 'de-DE', {rate: 0.85}).catch(() => {});
  }
};
