/* ----------------------------
   Konstanten & Konfiguration
   ---------------------------- */
export const CONFIG = {
  // Spielmodi: werden im Moduswahl-Screen ausgewählt
  modes: {
    count: {
      id: 'count',
      name: 'Zählen',
      icon: '🔢',
      max: 5,
      prompt: 'Wie viele siehst du?'
    },
    arithmetic: {
      id: 'arithmetic',
      name: 'Addieren/Subtrahieren',
      icon: '➕➖',
      max: 10,
      addPrompt: 'Wie viele sind es zusammen?',
      subPrompt: 'Wie viele bleiben übrig?'
    },
    lettersHear: {
      id: 'lettersHear',
      name: 'Hören',
      icon: '👂',
      prompt: 'Welcher Buchstabe wurde genannt?'
    },
    lettersFind: {
      id: 'lettersFind',
      name: 'Finden',
      icon: '🔍',
      tileCount: 6
    },
    lettersDraw: {
      id: 'lettersDraw',
      name: 'Zeichnen',
      icon: '✏️'
    }
  },
  // Buchstaben mit Beispielwort für "Hören"/"Finden" (Anlaut-Motiv)
  letters: [
    { upper: 'A', lower: 'a', word: 'Apfel', emoji: '🍎' },
    { upper: 'B', lower: 'b', word: 'Ball', emoji: '⚽' },
    { upper: 'C', lower: 'c', word: 'Clown', emoji: '🤡' },
    { upper: 'D', lower: 'd', word: 'Drache', emoji: '🐉' },
    { upper: 'E', lower: 'e', word: 'Elefant', emoji: '🐘' },
    { upper: 'F', lower: 'f', word: 'Fisch', emoji: '🐟' },
    { upper: 'G', lower: 'g', word: 'Giraffe', emoji: '🦒' },
    { upper: 'H', lower: 'h', word: 'Hund', emoji: '🐶' },
    { upper: 'I', lower: 'i', word: 'Igel', emoji: '🦔' },
    { upper: 'J', lower: 'j', word: 'Jojo', emoji: '🪀' },
    { upper: 'K', lower: 'k', word: 'Katze', emoji: '🐱' },
    { upper: 'L', lower: 'l', word: 'Löwe', emoji: '🦁' },
    { upper: 'M', lower: 'm', word: 'Maus', emoji: '🐭' },
    { upper: 'N', lower: 'n', word: 'Nashorn', emoji: '🦏' },
    { upper: 'O', lower: 'o', word: 'Orange', emoji: '🍊' },
    { upper: 'P', lower: 'p', word: 'Pinguin', emoji: '🐧' },
    { upper: 'Q', lower: 'q', word: 'Qualle', emoji: '🪼' },
    { upper: 'R', lower: 'r', word: 'Rakete', emoji: '🚀' },
    { upper: 'S', lower: 's', word: 'Sonne', emoji: '☀️' },
    { upper: 'T', lower: 't', word: 'Tiger', emoji: '🐯' },
    { upper: 'U', lower: 'u', word: 'Uhu', emoji: '🦉' },
    { upper: 'V', lower: 'v', word: 'Vogel', emoji: '🐦' },
    { upper: 'W', lower: 'w', word: 'Wal', emoji: '🐋' },
    { upper: 'X', lower: 'x', word: 'Xylophon', emoji: '🎹' },
    { upper: 'Y', lower: 'y', word: 'Yacht', emoji: '⛵' },
    { upper: 'Z', lower: 'z', word: 'Zebra', emoji: '🦓' }
  ],
  // Emoji motifs (can be extended)
  motifs: [
    { name: 'Schmetterling', plural: 'Schmetterlinge', emoji: '🦋', category: 'tier' },
    { name: 'Biene', plural: 'Bienen', emoji: '🐝', category: 'tier' },
    { name: 'Apfel', plural: 'Äpfel', emoji: '🍎', category: 'obst' },
    { name: 'Birne', plural: 'Birnen', emoji: '🍐', category: 'obst' },
    { name: 'Blume', plural: 'Blumen', emoji: '🌸', category: 'pflanze' },
    { name: 'Stern', plural: 'Sterne', emoji: '⭐', category: 'himmel' },
    { name: 'Herz', plural: 'Herzen', emoji: '❤️', category: 'symbol' },
    { name: 'Auto', plural: 'Autos', emoji: '🚗', category: 'verkehr' }
  ]
};
