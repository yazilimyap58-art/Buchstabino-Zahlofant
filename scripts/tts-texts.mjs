// Inventar aller ElevenLabs-Audio-Bausteine für B&Z.
//
// Jeder Eintrag wird von scripts/generate-tts.mjs als EIGENE mp3-Datei unter
// audio/<key>.mp3 erzeugt. Zur Laufzeit reiht js/tts.js mehrere Keys zu
// gesprochenen Sätzen aneinander (siehe TTS.speak() in js/tts.js) - deshalb
// sind die Texte hier bewusst kurze Bausteine (Wörter/Satzfragmente), nicht
// fertige Sätze. `voice` wählt die ElevenLabs-Stimme (siehe .env.example):
// 'buchstabino' für alles rund um Buchstaben, 'zahlofant' für alles rund um
// Zahlen - deckt sich mit Game.mascotCharacter().
//
// Reihenfolge/Gruppierung ist rein zur Übersicht; die tatsächliche
// Zusammensetzung der Sätze passiert in js/tts.js (buildXyzSequence()-Helfer).
export const TTS_TEXTS = {};

const add = (key, text, voice) => {
  TTS_TEXTS[key] = { text, voice };
};

// --- Zahlwörter 0-20 (Zahlofant) ---------------------------------------
// Reichweite: Zählen-Modus (Antworten 0..5), Addieren (Summen bis 20),
// Subtrahieren (0..10) - siehe generateDistractors()-Aufrufe in game.js.
const NUMBER_WORDS = [
  'null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht',
  'neun', 'zehn', 'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn',
  'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn', 'zwanzig'
];
NUMBER_WORDS.forEach((word, n) => add(`num_${n}`, word, 'zahlofant'));

// --- Buchstabennamen a-z (Buchstabino) ----------------------------------
// Eine Aufnahme pro Buchstabe deckt Groß- und Kleinschreibung ab (gleicher
// Laut) - CONFIG.letters[].lower liefert den Schlüssel-Suffix.
//
// Versuch, ausgeschriebene deutsche Buchstabennamen ("Beeh", "Ieh" etc.) zu
// synthetisieren, um die Aussprache zu verdeutlichen, klang in der Praxis
// schlechter als der einfache Buchstabe - deshalb wieder zurückgebaut.
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');
LETTERS.forEach(l => add(`letter_${l}`, l.toUpperCase(), 'buchstabino'));

// --- Anlaut-Beispielwörter (Buchstabino), Reihenfolge = CONFIG.letters --
const ANLAUT_WORDS = [
  'Apfel', 'Ball', 'Clown', 'Drache', 'Elefant', 'Fisch', 'Giraffe', 'Hund',
  'Igel', 'Jojo', 'Katze', 'Löwe', 'Maus', 'Nashorn', 'Orange', 'Pinguin',
  'Qualle', 'Rakete', 'Sonne', 'Tiger', 'Uhu', 'Vogel', 'Wal', 'Xylophon',
  'Yacht', 'Zebra'
];
LETTERS.forEach((l, i) => add(`word_${l}`, ANLAUT_WORDS[i], 'buchstabino'));

// --- Motiv-Namen Singular/Plural (Zahlofant), siehe CONFIG.motifs -------
const MOTIFS = [
  { id: 'schmetterling', sg: 'Schmetterling', pl: 'Schmetterlinge' },
  { id: 'biene', sg: 'Biene', pl: 'Bienen' },
  { id: 'apfel', sg: 'Apfel', pl: 'Äpfel' },
  { id: 'birne', sg: 'Birne', pl: 'Birnen' },
  { id: 'blume', sg: 'Blume', pl: 'Blumen' },
  { id: 'stern', sg: 'Stern', pl: 'Sterne' },
  { id: 'herz', sg: 'Herz', pl: 'Herzen' },
  { id: 'auto', sg: 'Auto', pl: 'Autos' }
];
MOTIFS.forEach(m => {
  add(`motif_${m.id}_sg`, m.sg, 'zahlofant');
  add(`motif_${m.id}_pl`, m.pl, 'zahlofant');
});

// --- Satzbausteine Rechnen (Zahlofant) -----------------------------------
add('glue_plus', 'plus', 'zahlofant');
add('glue_add_tail', 'Wie viele sind das zusammen?', 'zahlofant');
add('glue_sub_lead', 'Es gibt', 'zahlofant');
add('glue_sub_mid', 'Wie viele bleiben übrig, wenn du', 'zahlofant');
add('glue_sub_tail', 'wegnimmst?', 'zahlofant');

// --- Satzbausteine Buchstaben (Buchstabino) ------------------------------
add('glue_wie', 'wie', 'buchstabino');
add('glue_find_lead', 'Wo ist der Buchstabe', 'buchstabino'); // als offene Frage einsprechen (Betonung trägt nach vorne, kein "?" im Text nötig)

// --- Feedback-Anmoderationen (Zahlen: Zahlofant, Buchstaben: Buchstabino) -
add('feedback_correct_number_lead', 'Richtig! Es sind', 'zahlofant');
add('feedback_wrong_number_lead', 'Falsche Antwort! Es sind nicht', 'zahlofant');
add('feedback_correct_letter_lead', 'Richtig! Das ist', 'buchstabino');
add('feedback_wrong_letter_lead', 'Falsche Antwort! Das ist', 'buchstabino');

// --- Feste Einzelsätze ----------------------------------------------------
add('fixed_count_question', 'Wie viele siehst du?', 'zahlofant');
// Hilfe-Button existiert auf beiden Spiel-Screens (screen-game deckt Zahlen-
// UND Buchstaben-Modi ab) - deshalb zwei Stimmvarianten, ausgewählt über
// Game.mascotCharacter() (siehe js/tts.js buildHelpHintSequence()).
add('fixed_help_hint_buchstabino', 'Schau mal genau hin!', 'buchstabino');
add('fixed_help_hint_zahlofant', 'Schau mal genau hin!', 'zahlofant');

// --- Zeichnen-Modus (Buchstabino: Buchstaben, Zahlofant: Zahlen) -----------
add('fixed_draw_success', 'Super gemacht!', 'buchstabino');
add('fixed_draw_retry_overflow', 'Achte darauf, auf der Linie zu bleiben, und fahr sie weiter nach!', 'buchstabino');
add('fixed_draw_retry_coverage', 'Noch nicht ganz. Fahr die Linie weiter nach!', 'buchstabino');
add('fixed_draw_freehand_pass', 'Toll gemalt!', 'buchstabino');
add('fixed_draw_freehand_fail', 'Guter Versuch! Versuch dich beim nächsten Mal genau an die Form zu erinnern.', 'buchstabino');
add('fixed_draw_success_zahlofant', 'Super gemacht!', 'zahlofant');
add('fixed_draw_retry_overflow_zahlofant', 'Achte darauf, auf der Linie zu bleiben, und fahr sie weiter nach!', 'zahlofant');
add('fixed_draw_retry_coverage_zahlofant', 'Noch nicht ganz. Fahr die Linie weiter nach!', 'zahlofant');
add('fixed_draw_freehand_pass_zahlofant', 'Toll gemalt!', 'zahlofant');
add('fixed_draw_freehand_fail_zahlofant', 'Guter Versuch! Versuch dich beim nächsten Mal genau an die Form zu erinnern.', 'zahlofant');

// --- Begrüßung Kategorie-Auswahl -------------------------------------------
add('greet_buchstabino', 'Hallo, ich bin Buchstabino! Lass uns gemeinsam die Buchstaben lernen.', 'buchstabino');
add('greet_zahlofant', 'Hallo, ich bin Zahlofant! Zahlen sind mein Spezialgebiet.', 'zahlofant');
