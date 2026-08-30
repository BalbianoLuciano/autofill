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
import { FIELDS, type FieldKey } from './fields';
import type { FieldSignature, Mappings, Profile, Settings, Store } from '../types';

const KEY = 'autofill.store';
const VERSION = 1;

export const DEFAULT_SETTINGS: Settings = { fillSensitive: false, overwriteFilled: false };

const EMPTY_STORE: Store = { profile: {}, mappings: {}, settings: DEFAULT_SETTINGS };

interface Persisted extends Store {
  version: number;
}

export async function getStore(): Promise<Store> {
  const raw = await browser.storage.local.get(KEY);
  const stored = raw[KEY] as Partial<Persisted> | undefined;
  if (!stored) return structuredClone(EMPTY_STORE);
  return {
    profile: stored.profile ?? {},
    mappings: stored.mappings ?? {},
    settings: { ...DEFAULT_SETTINGS, ...stored.settings },
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
  // Un campo vacio se borra en vez de guardarse como '': asi el motor sabe
  // distinguir "no tengo el dato" de "el dato es cadena vacia".
  const cleaned: Profile = {};
  for (const [key, value] of Object.entries(profile) as [FieldKey, string][]) {
    const trimmed = value?.trim();
    if (trimmed) cleaned[key] = trimmed;
  }
  await setStore({ ...store, profile: cleaned });
}

export async function getSettings(): Promise<Settings> {
  return (await getStore()).settings;
}

export async function saveSettings(settings: Partial<Settings>): Promise<void> {
  const store = await getStore();
  await setStore({ ...store, settings: { ...store.settings, ...settings } });
}

/* --------------------------------- mappings --------------------------------- */

export async function getMappings(hostname: string): Promise<Record<FieldSignature, FieldKey>> {
  const store = await getStore();
  return store.mappings[hostname] ?? {};
}

/**
 * Guarda lo aprendido: en este sitio, este campo es esta clave del perfil.
 * Es el paso 7 del orden de trabajo y lo que hace que la extension mejore sola.
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
 * Los datos no quedan atrapados en el navegador (§7). El JSON que sale de aca
 * entra tal cual en `importJson`.
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

  const validKeys = new Set<string>(FIELDS.map((f) => f.key));
  const profile: Profile = {};
  for (const [key, value] of Object.entries(candidate.profile ?? {})) {
    if (validKeys.has(key) && typeof value === 'string' && value.trim()) {
      profile[key as FieldKey] = value.trim();
    }
  }

  const mappings: Mappings = {};
  for (const [hostname, entries] of Object.entries(candidate.mappings ?? {})) {
    if (typeof entries !== 'object' || entries === null) continue;
    const forHost: Record<FieldSignature, FieldKey> = {};
    for (const [signature, key] of Object.entries(entries)) {
      if (typeof key === 'string' && validKeys.has(key)) forHost[signature] = key as FieldKey;
    }
    if (Object.keys(forHost).length > 0) mappings[hostname] = forHost;
  }

  const store: Store = {
    profile,
    mappings,
    settings: { ...DEFAULT_SETTINGS, ...candidate.settings },
  };
  await setStore(store);
  return store;
}

/** Borra todo. El popup lo pide dos veces antes de llamarlo. */
export async function clearAll(): Promise<void> {
  await browser.storage.local.remove(KEY);
}
