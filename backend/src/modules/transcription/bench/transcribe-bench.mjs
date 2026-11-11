#!/usr/bin/env node
// Бенчмарк транскрибации голосового через OpenRouter.
// Запуск:  node bench/transcribe-bench.mjs [файл] [--models=a/b,c/d] [--timeout=180] [--lang=ru] [--raw]
// Результат: bench/results/<model>-<filename>.md

import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
// bench/ → transcription/ → modules/ → src/ → backend/
const BACKEND_ROOT = resolve(__dirname, '../../../..');

const USAGE = `Бенчмарк транскрибации голосового через OpenRouter.

Использование:
  node bench/transcribe-bench.mjs [файл] [--models=a/b,c/d] [--timeout=180] [--lang=ru] [--raw]

  файл         аудиозапись (по умолчанию bench/voice-492965.ogg)
  --models     модели через запятую (по умолчанию — весь список DEFAULT_MODELS)
  --timeout    таймаут одного запроса в секундах (по умолчанию 180)
  --lang       язык для STT-эндпоинтов (по умолчанию ru)
  --raw        сохранить сырой ответ STT-эндпоинта рядом с результатом

Ключ берётся из OPENROUTER_API_KEY (backend/.env или окружение).
Если формат файла не принят, запрос повторяется с mp3 через ffmpeg.
Результаты: bench/results/<model>-<файл>.md`;

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(USAGE);
  process.exit(0);
}

const DEFAULT_MODELS = [
  'google/gemini-2.5-flash',
  'google/gemini-2.5-flash-lite',
  'google/gemini-2.5-pro',
  'google/gemini-3-flash-preview',
  'google/gemini-3.1-flash-lite',
  'google/gemini-3.5-flash',
  'openai/gpt-audio-mini',
  'openai/gpt-audio',
  'mistralai/voxtral-small-24b-2507',
  'xiaomi/mimo-v2.5',
  'qwen/qwen3.8-omni-flash',
  'assemblyai/universal-3-6-pro', // STT-эндпоинт /audio/transcriptions, с диаризацией
];

// Модели, которые вызываются через /audio/transcriptions, а не /chat/completions
const isStt = (model) => /^(assemblyai|elevenlabs|deepgram)\//.test(model);

const PROMPT =
  'Транскрибируй это голосовое сообщение дословно, на языке оригинала. ' +
  'Верни только текст расшифровки, без комментариев, пояснений и markdown-оформления.';

// ---------- env ----------
function loadEnv(path) {
  const env = {};
  if (!existsSync(path)) return env;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return env;
}

const env = { ...loadEnv(join(BACKEND_ROOT, '.env')), ...process.env };
const API_KEY = env.OPENROUTER_API_KEY;
const BASE_URL = (env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
if (!API_KEY) {
  console.error('✗ OPENROUTER_API_KEY не найден в backend/.env');
  process.exit(1);
}

// ---------- args ----------
const args = process.argv.slice(2);
const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const filePath = resolve(args.find((a) => !a.startsWith('--')) ?? join(__dirname, 'voice-492965.ogg'));
const models = opt('models')?.split(',').map((s) => s.trim()).filter(Boolean) ?? DEFAULT_MODELS;
const timeoutMs = Number(opt('timeout') ?? 180) * 1000;

const outDir = join(__dirname, 'results');
mkdirSync(outDir, { recursive: true });
const fileName = basename(filePath, extname(filePath));

// ---------- audio ----------
const origFormat = extname(filePath).slice(1).toLowerCase();
const origBase64 = readFileSync(filePath).toString('base64');
let mp3Base64 = null;
function getMp3() {
  if (mp3Base64) return mp3Base64;
  const tmp = join(tmpdir(), `bench-${process.pid}.mp3`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', filePath, '-ac', '1', '-ar', '16000', tmp]);
  mp3Base64 = readFileSync(tmp).toString('base64');
  unlinkSync(tmp);
  return mp3Base64;
}

// ---------- request ----------
async function callModel(model, data, format) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: PROMPT },
              { type: 'input_audio', input_audio: { data, format } },
            ],
          },
        ],
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error) {
      const msg = body.error?.message ?? `HTTP ${res.status}`;
      throw new Error(`${msg}${body.error?.metadata?.raw ? ` | ${String(body.error.metadata.raw).slice(0, 300)}` : ''}`);
    }
    const content = body.choices?.[0]?.message?.content;
    const text = Array.isArray(content) ? content.map((p) => p.text ?? '').join('') : content;
    if (!text?.trim()) throw new Error('пустой ответ');
    return { text: text.trim(), usage: body.usage };
  } finally {
    clearTimeout(timer);
  }
}

// STT-эндпоинт: возвращает текст, при наличии спикеров — разметку «Спикер N»
async function callStt(model, data, format) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const post = async (extra) => {
    const res = await fetch(`${BASE_URL}/audio/transcriptions`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input_audio: { data, format }, language: opt('lang') ?? 'ru', ...extra }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error) throw new Error(body.error?.message ?? `HTTP ${res.status}`);
    return body;
  };
  try {
    let body;
    try {
      body = await post({ response_format: 'verbose_json', diarize: true });
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      console.log(`   ⚠ diarize не прошёл (${e.message.slice(0, 150)}), пробую без диаризации`);
      body = await post({});
    }
    // Метки спикеров лежат в words[] (segments у некоторых провайдеров — один блок без спикера),
    // поэтому сначала собираем по словам, потом по сегментам, иначе — просто текст.
    const fmt = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    const group = (items, getText) => {
      const lines = [];
      for (const it of items) {
        const label = it.speaker_label ?? it.speaker;
        const last = lines[lines.length - 1];
        if (last && last.label === label) last.text += ` ${getText(it)}`;
        else lines.push({ label, start: it.start, text: getText(it) });
      }
      return lines.map((l) => `**[${fmt(l.start ?? 0)}] ${String(l.label).replace(/^speaker_/, 'Спикер ')}:** ${l.text.trim()}`).join('\n\n');
    };
    const hasSpk = (a) => a?.length && a.some((x) => x.speaker_label != null || x.speaker != null);
    let text;
    if (hasSpk(body.words)) text = group(body.words, (w) => w.word);
    else if (hasSpk(body.segments)) text = group(body.segments, (s) => s.text);
    else text = body.text?.trim();
    if (hasSpk(body.words) || hasSpk(body.segments)) {
      const n = new Set((body.words ?? body.segments).map((x) => x.speaker_label ?? x.speaker)).size;
      console.log(`   спикеров найдено: ${n}`);
    }
    if (opt('raw')) {
      writeFileSync(join(outDir, `${model.replace(/[/:]/g, '_')}-${fileName}.raw.json`), JSON.stringify(body, null, 1));
    }
    if (!text) throw new Error('пустой ответ');
    return { text, usage: body.usage };
  } finally {
    clearTimeout(timer);
  }
}

// ---------- main ----------
console.log(`Файл:   ${filePath}`);
console.log(`Модели: ${models.length}  |  endpoint: ${BASE_URL}\n`);

const summary = [];
for (const [i, model] of models.entries()) {
  const tag = `[${i + 1}/${models.length}] ${model}`;
  const started = Date.now();
  let sent = origFormat;
  const call = isStt(model) ? callStt : callModel;
  console.log(`${tag} → отправляю (${origFormat})...`);
  try {
    let r;
    try {
      r = await call(model, origBase64, origFormat);
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      console.log(`${tag}   ⚠ ${e.message.slice(0, 200)}\n${tag}   ↻ повтор с mp3 (ffmpeg)...`);
      sent = 'mp3';
      r = await call(model, getMp3(), 'mp3');
    }
    const sec = ((Date.now() - started) / 1000).toFixed(1);
    const outFile = join(outDir, `${model.replace(/[/:]/g, '_')}-${fileName}.md`);
    writeFileSync(
      outFile,
      `# ${model}\n\n- Файл: \`${basename(filePath)}\`\n- Формат отправки: ${sent}\n- Время: ${sec}s\n` +
        `- Токены: ${JSON.stringify(r.usage ?? {})}\n\n---\n\n${r.text}\n`,
    );
    console.log(`${tag} ✓ ${sec}s, ${r.text.length} симв. → ${basename(outFile)}`);
    console.log(`   «${r.text.slice(0, 120).replace(/\n/g, ' ')}${r.text.length > 120 ? '…' : ''}»\n`);
    summary.push({ model, ok: true, sec, chars: r.text.length });
  } catch (e) {
    const msg = e.name === 'AbortError' ? `таймаут ${timeoutMs / 1000}s` : e.message;
    console.log(`${tag} ✗ ${msg.slice(0, 300)}\n`);
    summary.push({ model, ok: false, err: msg });
  }
}

console.log('===== ИТОГ =====');
for (const s of summary) {
  console.log(s.ok ? `✓ ${s.model.padEnd(45)} ${s.sec}s  ${s.chars} симв.` : `✗ ${s.model.padEnd(45)} ${s.err.slice(0, 100)}`);
}
console.log(`\nРезультаты: ${outDir}`);
