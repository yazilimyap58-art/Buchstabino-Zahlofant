#!/usr/bin/env node
// Einmaliges Dev-Tool: erzeugt alle Audio-Bausteine aus tts-texts.mjs via
// ElevenLabs und legt sie unter audio/<key>.mp3 ab. Läuft NICHT im
// deployten Spiel mit - reines Build-Zeit-Skript, das der Entwickler lokal
// ausführt (node scripts/generate-tts.mjs). Absichtlich ohne npm-Abhängigkeiten
// (Projekt ist zero-build), nutzt nur Node-Bordmittel (fetch ab Node 18).
//
// Aufruf:
//   node scripts/generate-tts.mjs            # fehlende Dateien erzeugen
//   node scripts/generate-tts.mjs --force     # alle Dateien neu erzeugen
//   node scripts/generate-tts.mjs num_5 word_a  # nur bestimmte Keys (Re-Takes)

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { TTS_TEXTS } from './tts-texts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const AUDIO_DIR = path.join(ROOT, 'audio');
// Zwischen zwei Requests: Free-Plan-Rate-Limits (Requests/Minute) sind
// niedriger als bei bezahlten Tarifen - eine kleine Pause vermeidet 429er
// zuverlässiger als nur nachträglicher Retry.
const REQUEST_DELAY_MS = 400;
const MAX_RETRIES = 3;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnv();

const API_KEY = process.env.ELEVENLABS_API_KEY;
// Überschreibbar in .env, falls eleven_multilingual_v2 im aktuellen Plan
// gesperrt/eingeschränkt ist (siehe .env.example).
const ELEVENLABS_MODEL = process.env.ELEVENLABS_MODEL || 'eleven_v3';
// Kinder brauchen langsamer gesprochene Sätze als der API-Default (1.0);
// Wertebereich laut ElevenLabs ca. 0.7-1.2. Überschreibbar in .env.
const ELEVENLABS_SPEED = Number(process.env.ELEVENLABS_SPEED) || 0.85;
const VOICE_IDS = {
  buchstabino: process.env.ELEVENLABS_VOICE_ID_BUCHSTABINO,
  zahlofant: process.env.ELEVENLABS_VOICE_ID_ZAHLOFANT
};

if (!API_KEY) {
  console.error('Fehlt: ELEVENLABS_API_KEY (siehe .env.example -> .env kopieren und ausfüllen)');
  process.exit(1);
}
if (!VOICE_IDS.buchstabino || !VOICE_IDS.zahlofant) {
  console.error('Fehlt: ELEVENLABS_VOICE_ID_BUCHSTABINO und/oder ELEVENLABS_VOICE_ID_ZAHLOFANT in .env');
  process.exit(1);
}

const args = process.argv.slice(2);
const force = args.includes('--force');
const onlyKeys = args.filter(a => !a.startsWith('--'));

mkdirSync(AUDIO_DIR, { recursive: true });

async function synthesize(key, { text, voice }) {
  const voiceId = VOICE_IDS[voice];
  const outPath = path.join(AUDIO_DIR, `${key}.mp3`);

  if (!force && existsSync(outPath)) {
    console.log(`  – ${key}.mp3 existiert schon, übersprungen`);
    return false;
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
      },
      body: JSON.stringify({
        text,
        model_id: ELEVENLABS_MODEL,
        voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: ELEVENLABS_SPEED }
      })
    });

    if (res.ok) {
      const buffer = Buffer.from(await res.arrayBuffer());
      writeFileSync(outPath, buffer);
      console.log(`  ✓ ${key}.mp3 (${voice}, "${text}")`);
      return true;
    }

    // 429 (Rate-Limit, häufig auf Free-Plänen) verdient einen Retry mit
    // steigender Wartezeit statt eines sofortigen Abbruchs.
    if (res.status === 429 && attempt < MAX_RETRIES) {
      const waitMs = REQUEST_DELAY_MS * 2 ** attempt;
      console.log(`  … ${key}: 429 (Rate-Limit), Versuch ${attempt}/${MAX_RETRIES}, warte ${waitMs}ms`);
      await sleep(waitMs);
      continue;
    }

    const body = await res.text().catch(() => '');
    throw new Error(`ElevenLabs-Fehler ${res.status} für "${key}" ("${text}"): ${body}`);
  }
}

async function main() {
  const entries = Object.entries(TTS_TEXTS).filter(([key]) => onlyKeys.length === 0 || onlyKeys.includes(key));
  console.log(`Erzeuge ${entries.length} Audio-Datei(en) in ${AUDIO_DIR}...\n`);

  const failures = [];
  let charsUsed = 0;
  // Sequenziell statt parallel: ElevenLabs' Free/Starter-Tarife haben ein
  // niedriges Concurrent-Request-Limit; parallele Requests würden mit 429
  // (Too Many Requests) scheitern statt Zeit zu sparen. REQUEST_DELAY_MS
  // zwischen echten Calls (nicht bei übersprungenen) schont zusätzlich das
  // Requests/Minute-Limit des Free-Plans.
  for (const [key, entry] of entries) {
    try {
      const requested = await synthesize(key, entry);
      if (requested) {
        charsUsed += entry.text.length;
        await sleep(REQUEST_DELAY_MS);
      }
    } catch (err) {
      console.error(`  ✗ ${key}: ${err.message}`);
      failures.push(key);
    }
  }

  console.log(`\nFertig. ${entries.length - failures.length}/${entries.length} erfolgreich.`);
  console.log(`Verbrauchte Zeichen in diesem Lauf: ${charsUsed} (Modell: ${ELEVENLABS_MODEL})`);
  if (failures.length) {
    console.log(`Fehlgeschlagen: ${failures.join(', ')}`);
    process.exit(1);
  }
}

main();
