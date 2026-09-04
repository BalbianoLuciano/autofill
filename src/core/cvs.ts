/**
 * El pool de CVs.
 *
 * Viven en `chrome.storage.local` como base64 y no en IndexedDB, porque un
 * content script corre en el origen de la pagina: ve `chrome.storage`, pero no
 * ve el IndexedDB de la extension. El archivo tiene que poder viajar por
 * mensaje hasta la pagina, y para eso tiene que ser serializable.
 */

import { browser } from 'wxt/browser';
import { normalize } from './normalize';
import type { CvBlob, CvMeta, CvRole, Lang } from '../types';

const META_KEY = 'autofill.cvs';
const BLOB_PREFIX = 'autofill.cv.';

/** 5MB por archivo: un CV que pesa mas que eso tiene otro problema. */
export const MAX_CV_BYTES = 5 * 1024 * 1024;

export async function listCvs(): Promise<CvMeta[]> {
  const raw = await browser.storage.local.get(META_KEY);
  return (raw[META_KEY] as CvMeta[] | undefined) ?? [];
}

export async function saveCv(
  file: File,
  label: string,
  lang: Lang,
  role: CvRole,
  filename?: string,
): Promise<CvMeta> {
  if (file.size > MAX_CV_BYTES) throw new Error('El archivo supera los 5 MB.');

  const meta: CvMeta = {
    id: crypto.randomUUID(),
    // Con el que se sube al formulario, no el que tiene en tu disco: es lo
    // primero que ve quien abre la aplicacion.
    filename: cleanFilename(filename, file.name),
    label,
    lang,
    role,
    mime: file.type || 'application/pdf',
    size: file.size,
  };

  const blob: CvBlob = { id: meta.id, base64: await toBase64(file) };
  const metas = [...(await listCvs()), meta];

  await browser.storage.local.set({
    [META_KEY]: metas,
    [BLOB_PREFIX + meta.id]: blob,
  });

  return meta;
}

/** Lo que se puede corregir de un CV ya cargado. El archivo nunca se toca. */
export type CvPatch = Partial<Pick<CvMeta, 'filename' | 'label' | 'lang' | 'role'>>;

/**
 * Corrige los metadatos de un CV ya cargado, sin volver a subirlo.
 *
 * Existe porque `pickCv` puntua por `lang` y por `role`: si cuatro CVs quedan
 * marcados con el mismo par, el selector no puede distinguirlos y siempre
 * elige el mismo. Equivocarse al cargar es facil, y borrar y volver a subir
 * para arreglar una etiqueta es una penitencia sin sentido.
 */
export async function updateCv(id: string, patch: CvPatch): Promise<CvMeta[]> {
  const metas = (await listCvs()).map((m) => {
    if (m.id !== id) return m;
    return {
      ...m,
      ...patch,
      // El filename pasa por el saneador aunque venga del patch: es el unico
      // campo que sale de la extension y viaja a un formulario ajeno.
      filename: patch.filename === undefined
        ? m.filename
        : cleanFilename(patch.filename, m.filename),
    };
  });
  await browser.storage.local.set({ [META_KEY]: metas });
  return metas;
}

/** Sin barras ni caracteres que rompan una descarga, y siempre con extension. */
function cleanFilename(wanted: string | undefined, fallback: string): string {
  const base = (wanted ?? '').trim() || fallback;
  const safe = base.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
  if (!safe) return fallback;

  const originalExt = fallback.match(/\.[^.]+$/)?.[0] ?? '.pdf';
  return /\.[a-z0-9]{2,5}$/i.test(safe) ? safe : safe + originalExt;
}

export async function deleteCv(id: string): Promise<void> {
  const metas = (await listCvs()).filter((m) => m.id !== id);
  await browser.storage.local.set({ [META_KEY]: metas });
  await browser.storage.local.remove(BLOB_PREFIX + id);
}

export async function readCv(id: string): Promise<(CvMeta & CvBlob) | null> {
  const meta = (await listCvs()).find((m) => m.id === id);
  if (!meta) return null;

  const raw = await browser.storage.local.get(BLOB_PREFIX + id);
  const blob = raw[BLOB_PREFIX + id] as CvBlob | undefined;
  return blob ? { ...meta, ...blob } : null;
}

/* -------------------------------- eleccion -------------------------------- */

const LEAD_WORDS = [
  'lead', 'leader', 'manager', 'head', 'principal', 'staff', 'director',
  'management', 'lider', 'jefe', 'responsable',
];

/**
 * Elige el CV por el idioma del formulario y por el puesto que anuncia la
 * pagina. Es una preferencia, no una certeza: el popup muestra cual eligio y
 * se puede cambiar antes de enviar.
 */
export function pickCv(
  cvs: CvMeta[],
  lang: Lang,
  pageTitle: string,
  preferredId?: string,
): CvMeta | null {
  if (cvs.length === 0) return null;

  const pinned = preferredId && cvs.find((c) => c.id === preferredId);
  if (pinned) return pinned;

  const tokens = new Set(normalize(pageTitle).split(' '));
  const wantsLead = LEAD_WORDS.some((word) => tokens.has(word));
  const wantedRole: CvRole = wantsLead ? 'lead' : 'ai';

  const score = (cv: CvMeta) =>
    (cv.lang === lang ? 2 : 0) + (cv.role === wantedRole ? 2 : cv.role === 'any' ? 1 : 0);

  return [...cvs].sort((a, b) => score(b) - score(a))[0] ?? null;
}

/* -------------------------------- adjuntar -------------------------------- */

/**
 * Mete el archivo en un `<input type="file">`.
 *
 * `input.files` es de solo lectura por seguridad, pero acepta un `FileList`
 * construido con `DataTransfer`. Es el unico camino y esta soportado; sin esto
 * no hay forma de adjuntar nada desde una extension.
 */
export function attachCv(input: HTMLInputElement, cv: CvMeta & CvBlob): boolean {
  try {
    const file = new File([fromBase64(cv.base64)], cv.filename, { type: cv.mime });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return input.files.length === 1;
  } catch {
    return false;
  }
}

/** Los inputs de archivo que piden un CV, no una foto ni un portfolio. */
export function findCvInputs(root: Document | ShadowRoot): HTMLInputElement[] {
  const inputs = Array.from(root.querySelectorAll<HTMLInputElement>('input[type="file"]'));
  return inputs.filter((input) => {
    if (input.disabled) return false;
    const accept = input.accept.toLowerCase();
    // Si declara que quiere imagenes, es una foto de perfil.
    if (accept && /image\//.test(accept) && !/pdf|doc/.test(accept)) return false;
    return true;
  });
}

/* -------------------------------- base64 -------------------------------- */

async function toBase64(file: File): Promise<string> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  // De a pedazos: pasarle un array enorme a fromCharCode revienta la pila.
  for (let i = 0; i < buffer.length; i += 8192) {
    binary += String.fromCharCode(...buffer.subarray(i, i + 8192));
  }
  return btoa(binary);
}

export function fromBase64(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  // Con el ArrayBuffer explicito: si no, TS lo tipa como ArrayBufferLike y no
  // lo acepta como BlobPart.
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
