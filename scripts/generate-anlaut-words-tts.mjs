#!/usr/bin/env node
// Einmaliges Dev-Tool: erzeugt NUR die 26 Anlaut-Wort-Keys (word_a...word_z)
// korrekt, indem es dem in README.md ("Neugenerierung nach Plan-Wechsel")
// dokumentierten Verfahren folgt statt der naiven Direkt-Synthese aus
// generate-tts.mjs. Grund: isolierte Einzelwörter ohne Satzkontext werden
// von ElevenLabs sonst oft englisch ausgesprochen (siehe README) - deshalb
// werden die Wörter hier eingebettet in einen deutschen Einleitungssatz an
// den /with-timestamps-Endpunkt geschickt und das Zielwort anhand der
// zurückgegebenen Zeichen-Zeitstempel per ffmpeg exakt herausgeschnitten.
//
// Buchstaben (letter_*) und Zahlen (num_*) fasst dieses Skript bewusst NICHT
// an - nur die Anlaut-Beispielwörter (word_*).
//
// Aufruf:
//   node scripts/generate-anlaut-words-tts.mjs            # alle 26 Wörter
//   node scripts/generate-anlaut-words-tts.mjs word_b word_t  # nur bestimmte Keys
//
// Benötigt ffmpeg im PATH (siehe README, winget install --id Gyan.FFmpeg -e).

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const AUDIO_DIR = path.join(ROOT, 'audio');
const TMP_DIR = path.join(ROOT, '.tts-tmp');

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
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID_BUCHSTABINO;
const MODEL_ID = process.env.ELEVENLABS_MODEL || 'eleven_v3';
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';

if (!API_KEY) {
  console.error('Fehlt: ELEVENLABS_API_KEY (siehe .env.example -> .env kopieren und ausfüllen)');
  process.exit(1);
}
if (!VOICE_ID) {
  console.error('Fehlt: ELEVENLABS_VOICE_ID_BUCHSTABINO in .env');
  process.exit(1);
}

// Reihenfolge/Wörter identisch zu ANLAUT_WORDS in scripts/tts-texts.mjs.
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');
const ANLAUT_WORDS = [
  'Apfel', 'Ball', 'Clown', 'Drache', 'Elefant', 'Fisch', 'Giraffe', 'Hund',
  'Igel', 'Jojo', 'Katze', 'Löwe', 'Maus', 'Nashorn', 'Orange', 'Pinguin',
  'Qualle', 'Rakete', 'Sonne', 'Tiger', 'Uhu', 'Vogel', 'Wal', 'Xylophon',
  'Yacht', 'Zebra'
];

// word_o (Orange) braucht einen unbestimmten Artikel davor, sonst wird eher
// die Farb- statt die Frucht-Lesart gesprochen (siehe README) - deshalb ein
// eigener Satz nur für dieses eine Wort, geschnitten wird nur "Orange".
const SPECIAL_SENTENCES = {
  o: { sentence: 'Ich sage jetzt ein paar Dinge zum Beispiel Obst: eine Orange.', word: 'Orange' }
};

const BATCH_SIZE = 8;

function buildEntries(onlyKeys) {
  const entries = LETTERS.map((l, i) => ({ letter: l, key: `word_${l}`, word: ANLAUT_WORDS[i] }));
  if (onlyKeys.length === 0) return entries;
  return entries.filter(e => onlyKeys.includes(e.key));
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function callWithTimestamps(sentence) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/with-timestamps`, {
    method: 'POST',
    headers: {
      'xi-api-key': API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      text: sentence,
      model_id: MODEL_ID,
      voice_settings: { stability: 0.5, similarity_boost: 0.75 }
    })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`ElevenLabs-Fehler ${res.status} für Satz "${sentence}": ${body}`);
  }

  return res.json();
}

// Findet Start/End-Zeit eines Zielworts anhand der von ElevenLabs
// zurückgegebenen Zeichenliste (nicht des Original-Eingabetexts - die
// Normalisierung kann leicht abweichen). `fromIndex` verhindert, dass ein
// späteres, aber textgleiches Wort das falsche (frühere) Vorkommen matcht.
function findWordTiming(alignment, word, fromIndex) {
  const chars = alignment.characters;
  const joined = chars.join('');
  const idx = joined.indexOf(word, fromIndex);
  if (idx === -1) {
    throw new Error(`Wort "${word}" nicht im Alignment-Text gefunden (ab Index ${fromIndex})`);
  }
  const startTime = alignment.character_start_times_seconds[idx];
  const endTime = alignment.character_end_times_seconds[idx + word.length - 1];
  return { startTime, endTime, nextIndex: idx + word.length };
}

async function cutSegment(sourceMp3, startTime, endTime, outPath) {
  const padStart = 0.08;
  const padEnd = 0.15;
  const start = Math.max(0, startTime - padStart);
  const duration = (endTime - startTime) + padStart + padEnd;
  await execFileAsync(FFMPEG, [
    '-y',
    '-ss', start.toFixed(3),
    '-t', duration.toFixed(3),
    '-i', sourceMp3,
    '-acodec', 'copy',
    outPath
  ]);
}

async function processBatch(entries, label) {
  const sentence = `Ich sage jetzt einige deutsche Wörter: ${entries.map(e => `${e.word}.`).join(' ')}`;
  console.log(`\n${label}: "${sentence}"`);

  const data = await callWithTimestamps(sentence);
  const audioBuffer = Buffer.from(data.audio_base64, 'base64');
  const sourcePath = path.join(TMP_DIR, `${label.replace(/[^a-zA-Z0-9]+/g, '_')}.mp3`);
  writeFileSync(sourcePath, audioBuffer);

  let cursor = 0;
  for (const entry of entries) {
    const { startTime, endTime, nextIndex } = findWordTiming(data.alignment, entry.word, cursor);
    cursor = nextIndex;
    const outPath = path.join(AUDIO_DIR, `${entry.key}.mp3`);
    await cutSegment(sourcePath, startTime, endTime, outPath);
    console.log(`  ✓ ${entry.key}.mp3 ("${entry.word}", ${startTime.toFixed(2)}s-${endTime.toFixed(2)}s)`);
  }
}

async function processSpecial(entry) {
  const special = SPECIAL_SENTENCES[entry.letter];
  console.log(`\nSonderfall ${entry.key}: "${special.sentence}"`);

  const data = await callWithTimestamps(special.sentence);
  const audioBuffer = Buffer.from(data.audio_base64, 'base64');
  const sourcePath = path.join(TMP_DIR, `${entry.key}.mp3`);
  writeFileSync(sourcePath, audioBuffer);

  const { startTime, endTime } = findWordTiming(data.alignment, special.word, 0);
  const outPath = path.join(AUDIO_DIR, `${entry.key}.mp3`);
  await cutSegment(sourcePath, startTime, endTime, outPath);
  console.log(`  ✓ ${entry.key}.mp3 ("${special.word}", ${startTime.toFixed(2)}s-${endTime.toFixed(2)}s)`);
}

async function main() {
  const args = process.argv.slice(2);
  const entries = buildEntries(args);

  if (entries.length === 0) {
    console.error('Keine passenden word_*-Keys gefunden für: ' + args.join(', '));
    process.exit(1);
  }

  mkdirSync(AUDIO_DIR, { recursive: true });
  mkdirSync(TMP_DIR, { recursive: true });

  const specialEntries = entries.filter(e => SPECIAL_SENTENCES[e.letter]);
  const normalEntries = entries.filter(e => !SPECIAL_SENTENCES[e.letter]);
  const batches = chunk(normalEntries, BATCH_SIZE);

  const failures = [];

  for (let i = 0; i < batches.length; i++) {
    try {
      await processBatch(batches[i], `Batch ${i + 1}/${batches.length}`);
    } catch (err) {
      console.error(`  ✗ Batch ${i + 1} fehlgeschlagen: ${err.message}`);
      failures.push(...batches[i].map(e => e.key));
    }
  }

  for (const entry of specialEntries) {
    try {
      await processSpecial(entry);
    } catch (err) {
      console.error(`  ✗ ${entry.key} fehlgeschlagen: ${err.message}`);
      failures.push(entry.key);
    }
  }

  rmSync(TMP_DIR, { recursive: true, force: true });

  console.log(`\nFertig. ${entries.length - failures.length}/${entries.length} erfolgreich.`);
  if (failures.length) {
    console.log(`Fehlgeschlagen: ${failures.join(', ')}`);
    process.exit(1);
  }
}

main();
