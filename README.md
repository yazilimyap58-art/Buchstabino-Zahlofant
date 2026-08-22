🧮 Buchstabino & Zahlofant
==========================

Kindgerechtes Mathe-Lernspiel für Kinder im Vorschulalter. Zählen, Addieren und Subtrahieren in spielerischer Form.

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

### Web Speech API für Sprachausgabe

Standardmäßig nutzt das Spiel die Web Speech API, um Aufgaben und Feedback vorzulesen. Alternativ können MP3-Dateien im Ordner `assets/audio/` abgelegt werden.

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