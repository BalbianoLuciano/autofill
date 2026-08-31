/**
 * Almacenamiento.
 *
 * Todo vive en `chrome.storage.local`: ~10MB, persistente y local. `storage.sync`
 * queda descartado porque tiene 8KB por item y estos son datos personales que no
 * tienen por que viajar a los servidores de Google.
 *
 * El perfil real nunca esta en el codigo. Vive aca y solo aca.
 */

import { browser } from 'wxt/browser';
import { FIELDS, FIELD_BY_KEY, kindOf, type FieldKey } from './fields';
import { similarity } from './normalize';
import { upsertQuestion } from './questions';
import type {
  Currency, CustomQuestion, FieldSignature, Mappings, Profile, ProfileValue,
  RegionCode, SalaryEntry, Settings, Store,
} from '../types';

const KEY = 'autofill.store';
const VERSION = 2;

export const DEFAULT_SETTINGS: Settings = {
  fillSensitive: false,
  overwriteFilled: false,
  language: 'auto',
  // Apagado por defecto y a proposito: enviar no se puede deshacer.
  autoApply: false,
  autoApplyDelay: 5,
  attachCv: true,
};

const EMPTY_STORE: Store = {
  profile: {},
  mappings: {},
  settings: DEFAULT_SETTINGS,
  questions: [],
};

interface Persisted extends Store {
  version: number;
}

const VALID_KEYS = new Set<string>(FIELDS.map((f) => f.key));

export async function getStore(): Promise<Store> {
  const raw = await browser.storage.local.get(KEY);
  const stored = raw[KEY] as Partial<Persisted> | undefined;
  if (!stored) return structuredClone(EMPTY_STORE);

  return {
    // La v1 guardaba texto plano por campo. Se convierte al vuelo para no
    // perder un perfil que ya estaba cargado.
    profile: (stored.version ?? 1) < 2
      ? migrateFromV1(stored.profile as unknown as Record<string, string>)
      : sanitizeProfile(stored.profile),
    mappings: stored.mappings ?? {},
    settings: { ...DEFAULT_SETTINGS, ...stored.settings },
    questions: Array.isArray(stored.questions) ? stored.questions : [],
  };
}

async function setStore(store: Store): Promise<void> {
  const persisted: Persisted = { ...store, version: VERSION };
  await browser.storage.local.set({ [KEY]: persisted });
}

export async function getProfile(): Promise<Profile> {
  return (await getStore()).profile;
}

export async function saveProfile(profile: Profile): Promise<void> {
  const store = await getStore();
  await setStore({ ...store, profile: sanitizeProfile(profile) });
}

/* ------------------------- preguntas propias ------------------------- */

export async function getQuestions(): Promise<CustomQuestion[]> {
  return (await getStore()).questions;
}

export async function saveQuestions(questions: CustomQuestion[]): Promise<void> {
  const store = await getStore();
  await setStore({ ...store, questions });
}

/**
 * Guarda una respuesta escrita en el overlay. Si ya habia una pregunta
 * equivalente, se actualiza en vez de duplicarse.
 */
export async function rememberAnswer(
  question: string,
  answer: string,
  hostname?: string,
): Promise<void> {
  const store = await getStore();
  await setStore({
    ...store,
    questions: upsertQuestion(store.questions, question, answer, hostname),
  });
}

export async function deleteQuestion(id: string): Promise<void> {
  const store = await getStore();
  await setStore({ ...store, questions: store.questions.filter((q) => q.id !== id) });
}

export async function getSettings(): Promise<Settings> {
  return (await getStore()).settings;
}

export async function saveSettings(settings: Partial<Settings>): Promise<void> {
  const store = await getStore();
  await setStore({ ...store, settings: { ...store.settings, ...settings } });
}

/* -------------------------------- limpieza -------------------------------- */

/** Descarta lo que no tenga forma valida en vez de dejar que rompa el motor. */
export function sanitizeProfile(profile: Profile | undefined): Profile {
  const clean: Profile = {};
  for (const [key, value] of Object.entries(profile ?? {})) {
    if (!VALID_KEYS.has(key) || !value || typeof value !== 'object') continue;
    const sanitized = sanitizeValue(key as FieldKey, adapt(key as FieldKey, value as ProfileValue));
    if (sanitized) clean[key as FieldKey] = sanitized;
  }
  return clean;
}

/**
 * Un valor guardado con un tipo que despues cambio.
 *
 * `yearsExperience` era texto plano y paso a ser una matriz de tecnologias. El
 * numero que ya estaba cargado se conserva como total general.
 */
function adapt(key: FieldKey, value: ProfileValue): ProfileValue {
  if (kindOf(key) !== 'skills' || value.kind !== 'text') return value;
  const years = Number((value.es ?? value.en ?? '').replace(/[^\d.]/g, ''));
  return {
    kind: 'skills',
    totalYears: Number.isFinite(years) ? years : 0,
    entries: [],
  };
}

function sanitizeValue(key: FieldKey, value: ProfileValue): ProfileValue | null {
  switch (value.kind) {
    case 'text': {
      const es = value.es?.trim();
      const en = value.en?.trim();
      // Un campo vacio se borra en vez de guardarse como '': asi el motor sabe
      // distinguir "no tengo el dato" de "el dato es cadena vacia".
      if (!es && !en) return null;
      return { kind: 'text', ...(es ? { es } : {}), ...(en ? { en } : {}) };
    }
    case 'choice': {
      const exists = FIELD_BY_KEY.get(key)?.options?.some((o) => o.code === value.code);
      return exists ? { kind: 'choice', code: value.code } : null;
    }
    case 'salary': {
      const entries = (value.entries ?? []).filter(
        (e) => Number.isFinite(e.amount) && e.amount > 0,
      );
      if (entries.length === 0) return null;
      const hours = Number.isFinite(value.hoursPerMonth) && value.hoursPerMonth > 0
        ? value.hoursPerMonth
        : 160;
      return { kind: 'salary', entries, hoursPerMonth: hours };
    }
    case 'regions': {
      const codes = (value.codes ?? []).filter((c) => c in REGION_WORDS);
      return codes.length > 0 ? { kind: 'regions', codes } : null;
    }
    case 'skills': {
      const entries = (value.entries ?? [])
        .filter((e) => e?.name?.trim() && Number.isFinite(e.years) && e.years >= 0)
        .map((e) => ({ name: e.name.trim(), years: e.years }));
      const total = Number.isFinite(value.totalYears) ? value.totalYears : 0;
      if (total <= 0 && entries.length === 0) return null;
      return { kind: 'skills', totalYears: total, entries };
    }
    default:
      return null;
  }
}

/* ------------------------------- migracion ------------------------------- */

const REGION_WORDS: Record<RegionCode, string[]> = {
  AR: ['argentina', 'argentino', 'argentine'],
  ES: ['espana', 'españa', 'spain', 'spanish', 'espanola'],
  EU: ['union europea', 'unión europea', 'european union', 'europa', 'europe', 'ue', 'eu'],
  US: ['estados unidos', 'united states', 'usa', 'eeuu'],
  UK: ['reino unido', 'united kingdom', 'uk'],
  CA: ['canada', 'canadá'],
  MX: ['mexico', 'méxico'],
  BR: ['brasil', 'brazil'],
};

/**
 * Convierte un perfil de la v1, donde todo era texto plano.
 *
 * Es mejor esfuerzo: adivina la opcion, la moneda y las regiones a partir de
 * lo que la persona habia escrito a mano. Lo que no se pueda interpretar se
 * pierde, asi que el popup se abre igual para revisar.
 */
export function migrateFromV1(old: Record<string, string> | undefined): Profile {
  const profile: Profile = {};
  if (!old) return profile;

  for (const [rawKey, rawValue] of Object.entries(old)) {
    if (!VALID_KEYS.has(rawKey) || typeof rawValue !== 'string') continue;
    const key = rawKey as FieldKey;
    const text = rawValue.trim();
    if (!text) continue;

    switch (kindOf(key)) {
      case 'text':
        profile[key] = { kind: 'text', es: text };
        break;

      case 'choice': {
        const code = guessChoice(key, text);
        if (code) profile[key] = { kind: 'choice', code };
        break;
      }

      case 'salary': {
        const entries = parseSalary(text);
        if (entries.length > 0) profile[key] = { kind: 'salary', entries, hoursPerMonth: 160 };
        break;
      }

      case 'skills': {
        const years = Number(text.replace(/[^\d.]/g, ''));
        if (Number.isFinite(years) && years > 0) {
          profile[key] = { kind: 'skills', totalYears: years, entries: [] };
        }
        break;
      }

      case 'regions': {
        const codes = parseRegions(text);
        if (codes.length > 0) profile[key] = { kind: 'regions', codes };
        break;
      }
    }
  }

  return profile;
}

function guessChoice(key: FieldKey, text: string): string | null {
  const options = FIELD_BY_KEY.get(key)?.options ?? [];
  let best: { code: string; score: number } | null = null;

  for (const option of options) {
    for (const candidate of [option.es, option.en, ...(option.match ?? [])]) {
      const score = similarity(candidate, text);
      if (best === null || score > best.score) best = { code: option.code, score };
    }
  }

  return best && best.score >= 0.6 ? best.code : null;
}

/** Saca los montos de algo escrito a mano: "2500 usd o 3500000". */
export function parseSalary(text: string): SalaryEntry[] {
  const entries: SalaryEntry[] = [];
  const seen = new Set<Currency>();

  // Se parte primero por los separadores y se lee cada parte sola. Mirar hacia
  // atras desde el numero no sirve: en "2500 usd o 3500000", el segundo monto
  // se lleva el `usd` del primero y termina descartado por duplicado.
  const chunks = text.toLowerCase().split(/\s+(?:o|or|y|and)\s+|[/|,;]+/);

  for (const chunk of chunks) {
    const found = chunk.match(/\d[\d.\s]*\d|\d/);
    if (!found) continue;

    const amount = Number(found[0].replace(/[.,\s]/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) continue;

    let currency: Currency;
    if (/usd|u\$s|dolar|dollar/.test(chunk)) currency = 'USD';
    else if (/eur|€/.test(chunk)) currency = 'EUR';
    else if (/ars|peso/.test(chunk)) currency = 'ARS';
    // Sin moneda declarada decide la magnitud: nadie pide 3.500.000 dolares
    // por mes ni 2.500 pesos.
    else currency = amount >= 100_000 ? 'ARS' : 'USD';

    if (seen.has(currency)) continue;
    seen.add(currency);

    const period = /hora|hour|\/h/.test(chunk)
      ? 'hour'
      : /anual|annual|ano|year/.test(chunk)
        ? 'year'
        : 'month';

    entries.push({ amount, currency, period });
  }

  return entries;
}

export function parseRegions(text: string): RegionCode[] {
  const lower = ` ${text.toLowerCase()} `;
  const codes: RegionCode[] = [];
  for (const [code, words] of Object.entries(REGION_WORDS) as [RegionCode, string[]][]) {
    if (words.some((word) => lower.includes(` ${word} `) || lower.includes(`${word},`))) {
      codes.push(code);
    }
  }
  return codes;
}

/* --------------------------------- mappings --------------------------------- */

export async function getMappings(hostname: string): Promise<Record<FieldSignature, FieldKey>> {
  const store = await getStore();
  return store.mappings[hostname] ?? {};
}

/**
 * Guarda lo aprendido: en este sitio, este campo es esta clave del perfil.
 * Es lo que hace que la extension mejore sola.
 */
export async function learnMapping(
  hostname: string,
  signature: FieldSignature,
  key: FieldKey,
): Promise<void> {
  const store = await getStore();
  const forHost = { ...(store.mappings[hostname] ?? {}), [signature]: key };
  await setStore({ ...store, mappings: { ...store.mappings, [hostname]: forHost } });
}

export async function forgetMapping(
  hostname: string,
  signature: FieldSignature,
): Promise<void> {
  const store = await getStore();
  const forHost = { ...(store.mappings[hostname] ?? {}) };
  delete forHost[signature];
  const mappings: Mappings = { ...store.mappings };
  if (Object.keys(forHost).length === 0) delete mappings[hostname];
  else mappings[hostname] = forHost;
  await setStore({ ...store, mappings });
}

/* ----------------------------- export / import ----------------------------- */

/**
 * Los datos no quedan atrapados en el navegador. El JSON que sale de aca entra
 * tal cual en `importJson`.
 */
export async function exportJson(): Promise<string> {
  const store = await getStore();
  return JSON.stringify({ version: VERSION, ...store }, null, 2);
}

export async function importJson(json: string): Promise<Store> {
  const parsed: unknown = JSON.parse(json);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('El archivo no tiene la forma esperada.');
  }
  const candidate = parsed as Partial<Persisted>;

  const profile = (candidate.version ?? 1) < 2
    ? migrateFromV1(candidate.profile as unknown as Record<string, string>)
    : sanitizeProfile(candidate.profile);

  const mappings: Mappings = {};
  for (const [hostname, entries] of Object.entries(candidate.mappings ?? {})) {
    if (typeof entries !== 'object' || entries === null) continue;
    const forHost: Record<FieldSignature, FieldKey> = {};
    for (const [signature, key] of Object.entries(entries)) {
      if (typeof key === 'string' && VALID_KEYS.has(key)) forHost[signature] = key as FieldKey;
    }
    if (Object.keys(forHost).length > 0) mappings[hostname] = forHost;
  }

  const store: Store = {
    profile,
    mappings,
    settings: { ...DEFAULT_SETTINGS, ...candidate.settings },
    questions: Array.isArray(candidate.questions) ? candidate.questions : [],
  };
  await setStore(store);
  return store;
}

/** Borra todo. El popup lo pide dos veces antes de llamarlo. */
export async function clearAll(): Promise<void> {
  await browser.storage.local.remove(KEY);
}
