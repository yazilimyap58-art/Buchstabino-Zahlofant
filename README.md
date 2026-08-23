🧮 Buchstabino & Zahlofant
==========================

Kindgerechtes Mathe-Lernspiel für Kinder im Vorschulalter. Zählen, Addieren und Subtrahieren in spielerischer Form.

> **Projektstatus**: Dieses Projekt befindet sich aktuell in aktiver Entwicklung und ist noch nicht öffentlich live. Die Sprachausgabe wird über die ElevenLabs-API im **Free Plan** generiert (siehe Abschnitt "Sprachausgabe (ElevenLabs TTS)" weiter unten) — das ist für lokale Entwicklung/Tests in Ordnung, aber der Free Plan erlaubt laut ElevenLabs-AGB keine kommerzielle bzw. öffentliche Nutzung der generierten Audiodateien. Vor einem echten Deployment muss auf einen bezahlten Plan gewechselt und die Audiodateien neu generiert werden.

## Features

- **Maskottchen**: Buchstabino (Buchstaben-Bereich) & Zahlofant (Zahlen-Bereich) begleiten mit Idle-/Winke-/Denk-/Jubel-Posen
- **2 Bereiche** (Kategoriewahl): „Buchstaben" (Minispiele folgen) und „Zahlen" mit aktuell 2 Spielmodi: Zählen (1-5), Addieren/Subtrahieren (1-10, gemischt)
- **Zufällige Motive**: Schmetterlinge, Bienen, Äpfel, Birnen, Blumen, Sterne...
- **Sprachausgabe**: Jede Aufgabe wird vorgelesen
- **Visuelles Feedback**: ✅ Richtig = Konfetti + Stern
- **Fehlerkorrektur**: Falsche Antwort entfernt sich, Ton wird abgespielt
- **Offline-fähig**: PWA – funktioniert ohne Internet
- **Installierbar**: Auf dem Startbildschirm erscheinen wie eine App

## Spielregeln

1. Zähle die angezeigten Emojis
2. Wähle die richtige Antwortzahl aus 3 Optionen
3. Bei falscher Antwort wird die Option entfernt
4. Sammle Streakpunkte und steigere dein Level

## Technische Architektur

```
buchstabino-zahlofant/
├── index.html        ← Hauptseite
├── style.css         ← Design
├── app.js            ← Spiel-Logik
├── sw.js             ← Offline-Cache
├── manifest.json     ← PWA-Konfiguration
└── assets/
    ├── icons/        ← App-Icons
    └── mascots/      ← Buchstabino- & Zahlofant-Grafiken (SVG/PNG, je 4 Posen)
```

### Sprachausgabe (ElevenLabs TTS)

Die Sprachausgabe läuft über vorgenerierte Audioclips von [ElevenLabs](https://elevenlabs.io), nicht live über die Web Speech API. `js/tts.js` reiht zur Laufzeit mehrere kurze Clips aus `audio/` zu Sätzen zusammen (siehe `scripts/tts-texts.mjs` für das Text-Inventar). Nur falls ein Clip nicht lädt, greift als Fallback die browsereigene Web Speech API.

Zum (Neu-)Erzeugen der Audiodateien:

1. `.env.example` nach `.env` kopieren und mit ElevenLabs-API-Key und Voice-IDs ausfüllen (siehe Kommentare in der Datei).
2. `node scripts/generate-tts.mjs` ausführen (erzeugt fehlende Dateien; `--force` erzwingt Neugenerierung, einzelne Keys als Argumente möglich).

**Lizenz-Hinweis**: Der ElevenLabs Free-Plan erlaubt laut deren AGB keine kommerzielle bzw. öffentliche Nutzung der generierten Audiodateien. Für ein öffentlich erreichbares Deployment (z.B. Vercel) muss vorher auf einen bezahlten ElevenLabs-Plan gewechselt und die Audiodateien neu generiert werden — die aktuellen Bedingungen sind direkt bei ElevenLabs zu prüfen.

#### Neugenerierung nach Plan-Wechsel (Free → bezahlt)

Die "einfachen" Satz-Keys (`glue_*`, `feedback_*`, `fixed_*`, `greet_*` — 21 Stück) lassen sich problemlos über `node scripts/generate-tts.mjs --force` neu erzeugen (Standardmodell ist jetzt `eleven_v3`, Speed `0.85` — beides per `.env` überschreibbar, siehe `.env.example`). Diese Keys sind volle Sätze mit ausreichend Kontext, damit die Aussprache stimmt.

**Ausnahme, unbedingt beachten**: Alle **einzeln stehenden Wörter/Buchstaben/Zahlen** (`letter_a`…`letter_z`, `word_a`…`word_z`, `motif_*_sg`/`_pl`, `num_0`…`num_20`) dürfen *nicht* über `generate-tts.mjs` erzeugt werden — `generate-tts.mjs` weigert sich seit der `ISOLATED_KEY_PREFIXES`-Absicherung auch aktiv, sie neu zu erzeugen. Grund: isolierte Einzelwörter/-buchstaben/-zahlen ohne Satzkontext werden von der TTS sonst zuverlässig englisch ausgesprochen (z.B. "I" wie "eye", "Tiger" wie im Englischen) — das passiert unabhängig vom Modell oder von Schreibweisen-Tricks (z.B. "Ih"/"Ieh" für I), einzige zuverlässige Lösung war echter Satzkontext + gezieltes Herausschneiden. Ein einfacher `--force`-Lauf über `generate-tts.mjs` würde diese Keys ohne Kontext neu erzeugen und die Aussprache-Fixes zunichtemachen.

Für `word_*` (die 26 Anlaut-Beispielwörter) gibt es dafür `node scripts/generate-anlaut-words-tts.mjs` — automatisiert genau das unten beschriebene Verfahren (Einleitungssatz, `/with-timestamps`, `ffmpeg`-Schnitt inkl. `word_o`-Sonderfall). Aufruf wie bei `generate-tts.mjs`: ohne Argumente alle 26 Wörter, oder einzelne Keys (`node scripts/generate-anlaut-words-tts.mjs word_b word_t`) für Re-Takes. `letter_*`/`num_*` haben (noch) kein eigenes Skript und wurden manuell nach demselben Verfahren erzeugt.

Verfahren (das `generate-anlaut-words-tts.mjs` für `word_*` automatisiert, für `letter_*`/`num_*` weiterhin manuell reproduzierbar):

1. Pro Stimme (Buchstabino/Zahlofant) einen deutschen Einleitungssatz + die Zielwörter/-buchstaben/-zahlen, getrennt durch Punkte, an `POST /v1/text-to-speech/{voice_id}/with-timestamps` schicken, `model_id: 'eleven_v3'`. Beispiele, die funktioniert haben:
   - Buchstaben: `"Ich sage jetzt die Buchstaben auf Deutsch: A B C D E F G H I J K L M N O P Q R S T U V W X Y Z"`
   - Zahlen: `"Ich sage jetzt die Zahlen auf Deutsch: null eins zwei ... zwanzig"`
   - Wörter (batchweise, z.B.): `"Ich sage jetzt einige deutsche Wörter: Apfel. Ball. Drache. ..."`
   - Sonderfall `word_o` (Orange): brauchte zusätzlich einen unbestimmten Artikel, um die Frucht- statt die Farb-Lesart zu erzwingen: `"...zum Beispiel Obst: eine Orange."`, geschnitten wird dabei nur der Wortteil "Orange" (nicht "eine").
2. Aus der Response `alignment.character_start_times_seconds`/`character_end_times_seconds` die Start-/End-Zeit des Zielworts anhand seiner Zeichen-Position im gesendeten Text ablesen.
3. Mit `ffmpeg -ss <start> -t <dauer> -acodec copy` das Segment aus dem Antwort-Audio herausschneiden (kleine Vor-/Nachlauf-Polsterung, ca. 0.08s/0.15s, hat sich bewährt).

`ffmpeg` ist dafür lokal per `winget install --id Gyan.FFmpeg -e` installiert (Chocolatey scheiterte hier an fehlenden Admin-Rechten).

## Lokale Entwicklung

Einfach im Browser öffnen:

```bash
# Python
python -m http.server

# Node.js (falls verfügbar)
npx http-server
```

Dann im Browser öffnen: [http://localhost:8000](http://localhost:8000)

## Deployment

Einfach alle Dateien auf einen Webserver hochladen. Keine Abhängigkeiten nötig!

### GitHub + Vercel (empfohlen)

1. Repo auf GitHub erstellen und Code pushen:
   ```bash
   git remote add origin https://github.com/<dein-user>/<repo-name>.git
   git branch -M main
   git push -u origin main
   ```
2. Auf [vercel.com](https://vercel.com) einloggen (z.B. mit dem GitHub-Account) → **Add New → Project** → das Repo auswählen → **Deploy**.
   Vercel erkennt das Projekt automatisch als statische Seite (kein Build-Command/Framework nötig, Output-Directory = Projekt-Root).
3. Nach jedem `git push` auf `main` deployt Vercel automatisch neu.

Alternativ mit der Vercel-CLI (`npm i -g vercel`, dann `vercel login` und `vercel --prod` im Projektordner).

## PWA-Installieren

Auf dem Smartphone:
1. Website im Browser öffnen
2. Teilen → "Zum Startbildschirm hinzufügen"
3. App erscheint als Symbol – startet im Vollbildmodus

## Kompatibilität

- **iOS Safari**: Getestet ab iOS 14+
- **Android Chrome**: Getestet ab Android 9+
- **Desktop Browser**: Chrome, Safari, Firefox (mit Einschränkungen bei Text-to-Speech)

## Lizenz

Dieses Projekt steht unter MIT-Lizenz. Sie sind freiwillig, es zu verwenden, zu modifizieren und zu verbessern.