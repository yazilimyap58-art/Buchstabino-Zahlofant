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
const ELEVENLABS_MODEL = 'eleven_multilingual_v2';

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
    return;
  }

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
      voice_settings: { stability: 0.5, similarity_boost: 0.75 }
    })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`ElevenLabs-Fehler ${res.status} für "${key}" ("${text}"): ${body}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  writeFileSync(outPath, buffer);
  console.log(`  ✓ ${key}.mp3 (${voice}, "${text}")`);
}

// Isolierte Einzelwörter/-buchstaben/-zahlen dürfen NICHT über diesen
// naiven Direkt-Synthese-Weg erzeugt werden - ohne Satzkontext spricht
// ElevenLabs sie oft englisch aus (siehe README, Abschnitt "Neugenerierung
// nach Plan-Wechsel"). Die brauchen stattdessen den with-timestamps-Workflow
// (aktuell: scripts/generate-anlaut-words-tts.mjs für word_*; letter_*/num_*
// wurden bisher manuell nach demselben Verfahren erzeugt). Wer sie hier
// trotzdem explizit als Argument nennt, bekommt eine klare Fehlermeldung
// statt eines still falsch ausgesprochenen Clips.
const ISOLATED_KEY_PREFIXES = ['letter_', 'word_', 'motif_', 'num_'];
const isIsolatedKey = key => ISOLATED_KEY_PREFIXES.some(prefix => key.startsWith(prefix));

async function main() {
  const requestedIsolated = onlyKeys.filter(isIsolatedKey);
  if (requestedIsolated.length > 0) {
    console.error(
      `Diese Keys sind isolierte Einzelwörter/-buchstaben/-zahlen und dürfen nicht über generate-tts.mjs erzeugt werden ` +
      `(siehe README "Neugenerierung nach Plan-Wechsel"): ${requestedIsolated.join(', ')}`
    );
    process.exit(1);
  }

  const entries = Object.entries(TTS_TEXTS).filter(([key]) => {
    if (isIsolatedKey(key)) return false;
    return onlyKeys.length === 0 || onlyKeys.includes(key);
  });
  console.log(`Erzeuge ${entries.length} Audio-Datei(en) in ${AUDIO_DIR}...\n`);

  const failures = [];
  // Sequenziell statt parallel: ElevenLabs' Free/Starter-Tarife haben ein
  // niedriges Concurrent-Request-Limit; parallele Requests würden mit 429
  // (Too Many Requests) scheitern statt Zeit zu sparen.
  for (const [key, entry] of entries) {
    try {
      await synthesize(key, entry);
    } catch (err) {
      console.error(`  ✗ ${key}: ${err.message}`);
      failures.push(key);
    }
  }

  console.log(`\nFertig. ${entries.length - failures.length}/${entries.length} erfolgreich.`);
  if (failures.length) {
    console.log(`Fehlgeschlagen: ${failures.join(', ')}`);
    process.exit(1);
  }
}

main();
