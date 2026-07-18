// Generates src/strings/<code>.js from the English dictionary using
// mistral-small running locally in Ollama - same approach as the Nexa app.
// English (en.js) is the source of truth; de.js is hand-written and skipped.
//
// Run from the project root:
//   node scripts/translate-locales.mjs [codes…] [--rework]
//
// Idempotent: existing translations are kept, only missing keys are translated
// (delete a locale file to redo it from scratch). Placeholders like {n}/{name}
// are validated; a batch that mangles them is retried, then falls back per-key.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const localesDir = join(here, '..', 'src', 'strings');

const EN = (await import('../src/strings/en.js')).default;

const LANGS = {
  fr: 'French', es: 'Spanish', it: 'Italian', pt: 'European Portuguese',
  nl: 'Dutch', pl: 'Polish', sv: 'Swedish', da: 'Danish', no: 'Norwegian (Bokmål)',
  fi: 'Finnish', cs: 'Czech', sk: 'Slovak', hu: 'Hungarian', ro: 'Romanian',
  el: 'Greek', bg: 'Bulgarian', hr: 'Croatian', uk: 'Ukrainian',
};

const OLLAMA = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL || 'mistral-small';
const BATCH = 16;

const placeholders = (s) => (s.match(/\{[a-zA-Z]+\}/g) ?? []).sort().join(',');

async function chat(messages) {
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages,
      stream: false,
      format: 'json',
      options: { temperature: 0.1, num_ctx: 4096, num_predict: 2048 },
    }),
  });
  if (!res.ok) throw new Error(`ollama ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.message?.content ?? '';
}

function prompt(code, language, entries) {
  return [
    {
      role: 'system',
      content:
        `You are a professional desktop-app localizer translating UI strings from English to ${language}. ` +
        'The app is a CAD file viewer. Reply with ONLY a JSON object mapping each given key to its translation. Rules: ' +
        '1) Keep placeholders like {n}, {name}, {ext} EXACTLY as they are. ' +
        '2) Never translate product/brand/format names: Cubory, CAD, DXF, STEP, IGES, STL, OBJ, 2D, 3D, Iso. ' +
        '3) Use the informal/familiar address where the language distinguishes (like German "du"). ' +
        '4) Keep translations short and natural for buttons, labels and tooltips of a desktop app. ' +
        '5) Keep the ellipsis character (…), middle dots (·) and punctuation style of the source. Do not add em-dashes.',
    },
    { role: 'user', content: JSON.stringify(entries) },
  ];
}

// reworkPrompt asks the model to review its own earlier output: each entry is
// {key: {en, current}} and the reply maps key → improved translation.
function reworkPrompt(code, language, pairs) {
  return [
    {
      role: 'system',
      content:
        `You are a senior ${language} app-localization reviewer for a CAD viewer desktop app. You get UI strings as ` +
        '{"key": {"en": "English source", "current": "current translation"}}. ' +
        `For EVERY key, reply with the best ${language} translation - keep the current one only if it is already natural and correct; otherwise rewrite it. ` +
        'Reply with ONLY a JSON object mapping each key to the final translation string. ' +
        'Keep placeholders like {n}, {name}, {ext} exactly; never translate Cubory, CAD, DXF, STEP, IGES, STL, OBJ, 2D, 3D, Iso; use the informal address; keep it short for desktop UI.',
    },
    { role: 'user', content: JSON.stringify(pairs) },
  ];
}

// Some models re-nest dotted keys ({"tool.fit": …} → {"tool": {"fit": …}});
// flatten any nesting back into dotted keys so they match the source keys.
function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out[key] = v;
    else if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
  }
  return out;
}

// Parse + validate a model reply for one batch; returns {key: translation}
// containing only the entries that pass (same placeholders, non-empty).
function accept(reply, entries) {
  let obj;
  try { obj = JSON.parse(reply); } catch { return {}; }
  if (typeof obj !== 'object' || obj === null) return {};
  obj = flatten(obj);
  const out = {};
  const values = Object.values(obj);
  const wanted = Object.keys(entries);
  for (const [k, en] of Object.entries(entries)) {
    let v = obj[k];
    if (v === undefined && wanted.length === 1 && values.length === 1 && typeof values[0] === 'string') v = values[0];
    if (typeof v !== 'string' || !v.trim()) continue;
    if (placeholders(v) !== placeholders(en)) continue;
    // A "translation" identical to a long English source usually means the
    // model echoed the input; short strings (Iso, Format, …) legitimately match.
    if (v === en && en.length > 12 && !/\{/.test(en)) continue;
    out[k] = v.trim();
  }
  return out;
}

function writeLocale(code, dict) {
  const keys = Object.keys(EN).filter((k) => k in dict); // EN key order, stable diffs
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
  const body = keys.map((k) => `  '${esc(k)}': '${esc(dict[k])}',`).join('\n');
  writeFileSync(
    join(localesDir, `${code}.js`),
    `// ${code} UI strings - GENERATED from English by scripts/translate-locales.mjs\n` +
    `// (mistral-small via Ollama). Do not edit by hand; missing keys fall back to en.\n` +
    `export default {\n${body}\n};\n`,
  );
}

function readLocale(code) {
  const p = join(localesDir, `${code}.js`);
  if (!existsSync(p)) return {};
  const src = readFileSync(p, 'utf8');
  const dict = {};
  const re = /^\s*'((?:[^'\\]|\\.)*)':\s*'((?:[^'\\]|\\.)*)',$/gm;
  let m;
  while ((m = re.exec(src))) {
    const un = (s) => s.replace(/\\n/g, '\n').replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    dict[un(m[1])] = un(m[2]);
  }
  return dict;
}

const args = process.argv.slice(2);
const rework = args.includes('--rework');
const only = args.filter((a) => a !== '--rework');
const targets = Object.keys(LANGS).filter((c) => only.length === 0 || only.includes(c));
const allKeys = Object.keys(EN);
console.log(`${allKeys.length} EN keys → ${targets.length} languages (model: ${MODEL}${rework ? ', rework' : ''})`);

for (const code of targets) {
  const language = LANGS[code];
  const dict = readLocale(code);
  const t0 = Date.now();

  let missing = allKeys.filter((k) => !(k in dict));
  if (missing.length) {
    console.log(`${code} (${language}): ${missing.length} to translate`);
    // Pass 1+2: batched. Pass 3: per-key for stragglers.
    for (let pass = 0; pass < 3 && missing.length; pass++) {
      const size = pass < 2 ? BATCH : 1;
      for (let i = 0; i < missing.length; i += size) {
        const entries = Object.fromEntries(missing.slice(i, i + size).map((k) => [k, EN[k]]));
        try {
          const got = accept(await chat(prompt(code, language, entries)), entries);
          Object.assign(dict, got);
        } catch (e) {
          console.error(`  ${code} batch failed: ${e.message}`);
        }
        process.stdout.write(`\r  pass ${pass + 1}: ${allKeys.length - missing.length + Math.min(i + size, missing.length)}/${allKeys.length}   `);
      }
      writeLocale(code, dict); // checkpoint after every pass
      missing = allKeys.filter((k) => !(k in dict));
      console.log(`\n  after pass ${pass + 1}: ${missing.length} missing`);
    }
    if (missing.length) console.warn(`  ${code}: ${missing.length} keys fall back to English: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}`);
  }

  // Rework: a review pass over every existing translation - the model sees the
  // English source next to its earlier output and rewrites what's awkward.
  if (rework) {
    const keys = allKeys.filter((k) => k in dict);
    console.log(`${code} (${language}): reworking ${keys.length}`);
    let changed = 0;
    for (let i = 0; i < keys.length; i += BATCH) {
      const slice = keys.slice(i, i + BATCH);
      const pairs = Object.fromEntries(slice.map((k) => [k, { en: EN[k], current: dict[k] }]));
      const entries = Object.fromEntries(slice.map((k) => [k, EN[k]]));
      try {
        const got = accept(await chat(reworkPrompt(code, language, pairs)), entries);
        for (const [k, v] of Object.entries(got)) {
          if (dict[k] !== v) { dict[k] = v; changed++; }
        }
      } catch (e) {
        console.error(`  ${code} rework batch failed: ${e.message}`);
      }
      process.stdout.write(`\r  rework: ${Math.min(i + BATCH, keys.length)}/${keys.length} (${changed} changed)   `);
    }
    writeLocale(code, dict);
    console.log(`\n  rework changed ${changed}`);
  }

  console.log(`  ${code} done in ${Math.round((Date.now() - t0) / 1000)}s`);
}
console.log('ALL DONE');
