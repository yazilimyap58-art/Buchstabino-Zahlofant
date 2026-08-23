/* ----------------------------
   Audio / TTS
   ----------------------------
   Spricht nicht mehr live über die Web-Speech-API, sondern spielt
   vorgenerierte ElevenLabs-Audiodateien (audio/<key>.mp3, siehe
   scripts/generate-tts.mjs + scripts/tts-texts.mjs) ab. Ein "Satz" ist
   hier eine ARRAY von Bausteinnamen ("sequence"), die hintereinander
   abgespielt werden - z.B. ['num_6', 'motif_apfel_pl', 'glue_plus', ...].
   Das erlaubt, kombinatorische Sätze (Rechenaufgaben: Zahl+Motiv+Operator)
   aus wenigen aufgenommenen Bausteinen zusammenzusetzen, statt jede
   mögliche Kombination einzeln aufnehmen zu müssen (bei Rechenaufgaben
   allein wären das ~1600 Sätze). */

// Reine Textdaten (kein Node-spezifischer Code) - dasselbe Modul, das
// scripts/generate-tts.mjs zum Erzeugen der mp3s benutzt, dient hier als
// Textquelle für den Sprachausgabe-Fallback (siehe speechSynthesisFallback()).
import { TTS_TEXTS } from '../scripts/tts-texts.mjs';

const AUDIO_DIR = 'audio';
// Kleine Pause zwischen zwei Bausteinen, damit zusammengesetzte Sätze nicht
// wie aneinandergeklebte Wörter klingen, aber auch nicht auseinanderfallen.
const GAP_MS = 90;

// Bewusst KEIN wiederverwendetes <audio>-Element pro Key: ein gemeinsames,
// mutables Element hätte bei überlappender Wiedergabe desselben Keys
// (z.B. zweimal schnell auf "Wiederholen" tippen) currentTime mitten in der
// laufenden Wiedergabe zurückgesetzt und sie hörbar unterbrochen/neu
// gestartet. Jede Wiedergabe bekommt stattdessen ein frisches Audio-Objekt;
// der Browser-HTTP-Cache (bzw. der Service-Worker-Cache offline) verhindert
// trotzdem einen erneuten Netzwerk-Request. Zusätzlich sperren die
// "Wiederholen"/"Hilfe"-Buttons sich selbst während der eigenen Ansage
// (siehe game.js/letterDraw.js bindEvents/init) - das verhindert den
// häufigsten Auslöser (Doppel-Tap) von vornherein, statt nur die Folgen
// (Audio-Korruption) zu vermeiden.
//
// Trotzdem kann mehr als eine TTS.speak()-Sequenz gleichzeitig laufen (z.B.
// eine Begrüßung, die noch läuft, während bereits eine Aufgabe angesagt
// wird) - ohne Gegenmaßnahme würden sich die Audios hörbar überlagern.
// _speakGen (gleiches Zähler-Muster wie Mascot._gen/LetterDraw.helpToken)
// macht speak() global "last call wins": jeder neue Aufruf stoppt sofort
// die noch laufende Wiedergabe und markiert alle älteren Sequenzen als
// veraltet, sodass sie sich an ihrem nächsten Prüfpunkt selbst beenden statt
// weiterzuspielen.
let _speakGen = 0;
let _currentAudio = null;

function stopCurrentAudio() {
  if (_currentAudio) {
    _currentAudio.pause();
    _currentAudio.currentTime = 0;
    _currentAudio = null;
  }
}

function playOne(key, gen) {
  return new Promise((resolve, reject) => {
    if (gen !== _speakGen) { resolve(); return; }
    const audio = new Audio(`${AUDIO_DIR}/${key}.mp3`);
    _currentAudio = audio;
    const clearIfCurrent = () => { if (_currentAudio === audio) _currentAudio = null; };
    audio.addEventListener('ended', () => { clearIfCurrent(); resolve(); }, { once: true });
    audio.addEventListener('error', () => { clearIfCurrent(); reject(new Error(`Audio fehlt/kaputt: ${key}.mp3`)); }, { once: true });
    audio.play().catch(() => { clearIfCurrent(); reject(new Error(`Audio fehlt/kaputt: ${key}.mp3`)); });
  });
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Fällt auf die Browser-Sprachausgabe zurück, falls eine mp3-Datei fehlt
// oder nicht geladen werden kann (z.B. Key-Tippfehler, Datei noch nicht
// generiert) - so bleibt das Spiel spielbar (mit weniger natürlicher
// Stimme) statt komplett stumm zu werden. Spricht den ECHTEN Text aus
// TTS_TEXTS (nicht die rohen Keys - "num_5" wäre für ein Kind unverständlich).
// `lang` wird bewusst NICHT gesetzt: der Browser wählt dann automatisch
// seine Standard-/Systemstimme, statt mit einer fest verdrahteten "de-DE"
// zu scheitern, falls auf dem Gerät keine deutsche Stimme installiert ist.
function speechSynthesisFallback(keys) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      resolve();
      return;
    }
    const text = keys.map(key => TTS_TEXTS[key]?.text).filter(Boolean).join(' ');
    if (!text) {
      resolve();
      return;
    }
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 0.9;
    utter.onend = resolve;
    utter.onerror = resolve;
    window.speechSynthesis.speak(utter);
  });
}

export const TTS = {
  // Spielt eine Sequenz von Audio-Bausteinen (Keys aus tts-texts.mjs)
  // nacheinander ab. Gibt ein Promise zurück, das nach dem letzten
  // Baustein aufgelöst wird (Aufrufer nutzen das wie vorher das alte
  // TTS.speak(), z.B. um erst danach die nächste Aufgabe zu generieren).
  async speak(sequence) {
    const keys = Array.isArray(sequence) ? sequence : [sequence];
    _speakGen += 1;
    const gen = _speakGen;
    stopCurrentAudio();
    for (let i = 0; i < keys.length; i++) {
      if (gen !== _speakGen) return; // von einem neueren TTS.speak()-Aufruf überholt
      try {
        await playOne(keys[i], gen);
      } catch (err) {
        if (gen !== _speakGen) return;
        // Nur den fehlgeschlagenen (und die noch folgenden) Bausteine per
        // Fallback vorlesen - bereits abgespielte Bausteine nicht erneut
        // aussprechen.
        console.warn(err.message);
        await speechSynthesisFallback(keys.slice(i));
        return;
      }
      if (gen !== _speakGen) return;
      if (i < keys.length - 1) await wait(GAP_MS);
    }
  },

  // Zahlwort-Key für n (0-20), siehe tts-texts.mjs NUMBER_WORDS.
  numberKey(n) {
    return `num_${n}`;
  },

  // Buchstaben-Key, unabhängig von Groß-/Kleinschreibung (gleicher Laut).
  letterKey(char) {
    return `letter_${String(char).toLowerCase()}`;
  },

  // Anlaut-Beispielwort-Key zum Buchstaben (z.B. "b" -> word_b -> "Ball").
  wordKey(char) {
    return `word_${String(char).toLowerCase()}`;
  },

  // Motiv-Name-Key, Singular ab count===1, sonst Plural.
  motifKey(motif, count) {
    return `motif_${motif.id}_${count === 1 ? 'sg' : 'pl'}`;
  },

  // Play spoken feedback for a correct/wrong answer. Returns a promise that
  // resolves once die Ansage fertig ist. `value` ist bei Zahlen-Modi eine
  // Zahl, bei Buchstaben-Modi ein einzelner Buchstabe - deshalb eigene
  // Formulierung statt "Es sind X" (klingt bei Buchstaben falsch). Bei
  // "wrong" ist `value` der vom Kind ANGEKLICKTE (falsche) Wert, nicht die
  // richtige Antwort. Bei Buchstaben ist "Das ist X" eine korrekte Aussage
  // (X benennt einfach den angeklickten Buchstaben). Bei Zahlen wäre "Das
  // sind X" dagegen eine falsche Tatsachenbehauptung (es sind ja gar nicht
  // X Objekte, sonst wäre X richtig gewesen) - deshalb dort weiterhin die
  // Verneinung "Es sind nicht X" (wahr: es sind tatsächlich nicht X Objekte).
  playEffect(type, value, isLetter = false) {
    let sequence;
    if (isLetter) {
      sequence = [
        type === 'correct' ? 'feedback_correct_letter_lead' : 'feedback_wrong_letter_lead',
        this.letterKey(value)
      ];
    } else {
      sequence = [
        type === 'correct' ? 'feedback_correct_number_lead' : 'feedback_wrong_number_lead',
        this.numberKey(value)
      ];
    }
    return this.speak(sequence).catch(() => {});
  }
};
