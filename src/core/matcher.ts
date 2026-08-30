/**
 * Matcher: decide que campo del perfil es cada input de la pagina.
 *
 * Cascada de mas confiable a menos, se corta en el primer acierto (§5):
 *   1. mapping aprendido para ese hostname  -> gana siempre
 *   2. atributo `autocomplete`              -> el unico estandar
 *   3. `<label>` asociado
 *   4. `name` / `id` / `aria-label` / `placeholder`
 *   5. texto cercano en el DOM
 */

import { FIELDS, type FieldKey } from './fields';
import { normalize, tokenize, containsTokenSequence } from './normalize';
import type { FieldSignature, MatchSource } from '../types';

export type Fillable = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/** Tipos de input que no se tocan nunca. */
const IGNORED_INPUT_TYPES = new Set([
  'hidden', 'submit', 'button', 'reset', 'image', 'file', 'password', 'checkbox',
  'search', 'range', 'color',
]);

export interface DetectedField {
  el: Fillable;
  /** Para radios: todos los inputs del grupo. */
  group?: HTMLInputElement[];
  signature: FieldSignature;
  label: string;
  key: FieldKey | null;
  via: MatchSource | null;
}

/* --------------------------- indices del diccionario --------------------------- */

/**
 * token -> campos que lo usan en algun alias.
 *
 * Sirve para saber si un alias de una sola palabra es distintivo. `linkedin`
 * lo usa un solo campo, asi que alcanza con que aparezca. `name` lo usan
 * cuatro, asi que solo cuenta si el texto entero es exactamente `name`.
 */
const TOKEN_OWNERS: Map<string, Set<FieldKey>> = (() => {
  const map = new Map<string, Set<FieldKey>>();
  for (const field of FIELDS) {
    for (const alias of field.aliases) {
      for (const token of tokenize(alias)) {
        let owners = map.get(token);
        if (!owners) map.set(token, (owners = new Set()));
        owners.add(field.key);
      }
    }
  }
  return map;
})();

/**
 * valor de `autocomplete` -> campos que lo declaran.
 *
 * `url` lo declaran linkedin, github, portfolio y otherUrl: cuando un valor
 * tiene mas de un dueno no dice nada y hay que seguir bajando en la cascada.
 */
const AUTOCOMPLETE_OWNERS: Map<string, FieldKey[]> = (() => {
  const map = new Map<string, FieldKey[]>();
  for (const field of FIELDS) {
    for (const value of field.autocomplete ?? []) {
      const owners = map.get(value) ?? [];
      owners.push(field.key);
      map.set(value, owners);
    }
  }
  return map;
})();

/** Aliases pre-tokenizados, en orden de declaracion de FIELDS. */
const ALIAS_INDEX = FIELDS.flatMap((field) =>
  field.aliases.map((alias) => ({
    key: field.key,
    normalized: normalize(alias),
    tokens: tokenize(alias),
  })),
).filter((entry) => entry.tokens.length > 0);

/* ------------------------------- match por texto ------------------------------- */

interface AliasHit {
  key: FieldKey;
  score: number;
}

/**
 * Mejor campo para un texto suelto (un label, un `name`, lo que sea).
 *
 * Un alias de varias palabras cuenta si aparece como secuencia contigua de
 * tokens. Uno de una sola palabra cuenta entero solo si es distintivo; si no,
 * exige que el texto sea exactamente ese.
 */
export function matchText(text: string): AliasHit | null {
  const normalized = normalize(text);
  if (!normalized) return null;
  const tokens = normalized.split(' ');

  let best: AliasHit | null = null;
  for (const alias of ALIAS_INDEX) {
    let score = 0;

    if (alias.normalized === normalized) {
      score = 1000 + alias.tokens.length;
    } else if (alias.tokens.length > 1) {
      if (containsTokenSequence(tokens, alias.tokens)) {
        score = 600 + alias.tokens.length * 10;
      }
    } else {
      const token = alias.tokens[0]!;
      const distinctive = TOKEN_OWNERS.get(token)?.size === 1;
      if (distinctive && tokens.includes(token)) score = 400;
    }

    // Empate: gana el que aparece primero en FIELDS. ALIAS_INDEX conserva ese
    // orden, asi que alcanza con exigir score estrictamente mayor.
    if (score > 0 && (best === null || score > best.score)) {
      best = { key: alias.key, score };
    }
  }
  return best;
}

/** Mejor match probando varios textos; devuelve el de mayor score. */
function matchAny(texts: (string | null | undefined)[]): AliasHit | null {
  let best: AliasHit | null = null;
  for (const text of texts) {
    if (!text) continue;
    const hit = matchText(text);
    if (hit && (best === null || hit.score > best.score)) best = hit;
  }
  return best;
}

/* ---------------------------- lectura del elemento ---------------------------- */

/** El texto del label asociado, por `for=`, por label ancestro o por aria. */
export function labelFor(el: Fillable): string {
  const labels = (el as HTMLInputElement).labels;
  if (labels && labels.length > 0) {
    const text = Array.from(labels)
      .map((l) => l.textContent ?? '')
      .join(' ')
      .trim();
    if (text) return clean(text);
  }

  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => el.ownerDocument.getElementById(id)?.textContent ?? '')
      .join(' ')
      .trim();
    if (text) return clean(text);
  }

  const ancestor = el.closest('label');
  if (ancestor?.textContent) return clean(ancestor.textContent);

  return '';
}

/**
 * Texto cercano, para inputs sin label.
 *
 * Sube por el DOM hasta cuatro niveles y se queda con el texto del contenedor
 * mas chico que diga algo, sacando lo que ya esta dentro de otros controles.
 */
export function nearbyText(el: Fillable): string {
  let node: HTMLElement | null = el.parentElement;
  for (let depth = 0; depth < 4 && node; depth++, node = node.parentElement) {
    const clone = node.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('input, textarea, select, button, option, svg').forEach((n) => n.remove());
    const text = clean(clone.textContent ?? '');
    if (text.length >= 2 && text.length <= 120) return text;
  }
  return '';
}

function clean(text: string): string {
  return text.replace(/[\s\u00a0]+/g, ' ').replace(/\*+$/, '').trim();
}

/**
 * Firma estable del campo: `name`, si no `id`, si no el label normalizado.
 * Es la clave con la que se guarda lo aprendido para ese hostname (§7).
 */
export function signatureOf(el: Fillable, label: string): FieldSignature {
  const name = el.getAttribute('name');
  if (name) return `name:${name}`;
  if (el.id) return `id:${el.id}`;
  const normalized = normalize(label);
  if (normalized) return `label:${normalized}`;
  return `tag:${el.tagName.toLowerCase()}:${el.getAttribute('type') ?? ''}`;
}

/* ------------------------------ recorrido del DOM ------------------------------ */

/** Junta inputs, textareas y selects, entrando tambien a los shadow roots. */
export function collectFillables(root: Document | ShadowRoot | Element): Fillable[] {
  const found: Fillable[] = [];

  const visit = (node: Document | ShadowRoot | Element) => {
    const candidates = node.querySelectorAll<Fillable>('input, textarea, select');
    for (const el of candidates) if (isFillable(el)) found.push(el);

    // Shadow DOM: Workday y varios design systems esconden los inputs adentro.
    const hosts = node.querySelectorAll<HTMLElement>('*');
    for (const host of hosts) if (host.shadowRoot) visit(host.shadowRoot);
  };

  visit(root);
  return found;
}

function isFillable(el: Fillable): boolean {
  if (el.disabled) return false;
  if ('readOnly' in el && el.readOnly) return false;
  if (el instanceof HTMLInputElement && IGNORED_INPUT_TYPES.has(el.type)) return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;
  // Un input invisible casi siempre es de un paso del formulario que no toca.
  const rects = el.getClientRects();
  if (rects.length === 0) return false;
  return true;
}

/* --------------------------------- la cascada --------------------------------- */

export interface DetectOptions {
  /** firma -> clave, lo aprendido para este hostname. */
  learned: Record<FieldSignature, FieldKey>;
}

/**
 * Corre la cascada sobre cada control de la pagina.
 *
 * Los radios se agrupan por `name`: el grupo entero es un solo campo, porque
 * "¿tenes permiso de trabajo?" son tres inputs y una sola pregunta.
 */
export function detectFields(
  root: Document | ShadowRoot,
  { learned }: DetectOptions,
): DetectedField[] {
  const elements = collectFillables(root);
  const seenRadioGroups = new Map<string, HTMLInputElement[]>();
  const detected: DetectedField[] = [];

  for (const el of elements) {
    if (el instanceof HTMLInputElement && el.type === 'radio') {
      const groupName = el.name || el.id;
      if (!groupName) continue;
      const existing = seenRadioGroups.get(groupName);
      if (existing) {
        existing.push(el);
        continue;
      }
      seenRadioGroups.set(groupName, [el]);
    }
    detected.push(describe(el, learned));
  }

  // Los radios se describen con el texto del fieldset, no el de cada opcion.
  for (const field of detected) {
    if (field.el instanceof HTMLInputElement && field.el.type === 'radio') {
      field.group = seenRadioGroups.get(field.el.name || field.el.id) ?? [field.el];
    }
  }

  return detected;
}

function describe(el: Fillable, learned: Record<FieldSignature, FieldKey>): DetectedField {
  const isRadio = el instanceof HTMLInputElement && el.type === 'radio';
  // Para un radio el label propio dice "Si"/"No"; la pregunta esta mas arriba.
  const ownLabel = isRadio ? groupQuestion(el) || labelFor(el) : labelFor(el);

  // El texto cercano clona ancestros, asi que se calcula una sola vez y solo
  // si hace falta. Es el paso 5 de la cascada y no tiene que colarse en el 3:
  // si el label asociado no existe, ese paso simplemente no corre.
  let nearbyCache: string | null = null;
  const nearby = (): string => (nearbyCache ??= nearbyText(el));

  const label = ownLabel || nearby();
  const signature = signatureOf(el, label);

  // 1. lo aprendido gana siempre
  const learnedKey = learned[signature];
  if (learnedKey) return { el, signature, label, key: learnedKey, via: 'learned' };

  // 2. autocomplete, solo cuando el valor tiene un unico dueno
  const autocompleteKey = fromAutocomplete(el);
  if (autocompleteKey) return { el, signature, label, key: autocompleteKey, via: 'autocomplete' };

  // 3. el label asociado
  if (ownLabel) {
    const hit = matchText(ownLabel);
    if (hit) return { el, signature, label, key: hit.key, via: 'label' };
  }

  // 4. name / id / aria-label / placeholder
  const fromAttributes = matchAny([
    el.getAttribute('name'),
    el.id,
    el.getAttribute('aria-label'),
    el.getAttribute('placeholder'),
    el.getAttribute('data-testid'),
  ]);
  if (fromAttributes) {
    return { el, signature, label, key: fromAttributes.key, via: 'attributes' };
  }

  // 5. texto cercano
  const surrounding = nearby();
  if (surrounding) {
    const hit = matchText(surrounding);
    if (hit) return { el, signature, label, key: hit.key, via: 'nearby-text' };
  }

  return { el, signature, label, key: null, via: null };
}

function fromAutocomplete(el: Fillable): FieldKey | null {
  const raw = el.getAttribute('autocomplete');
  if (!raw || raw === 'off' || raw === 'on') return null;

  // Ojo con el guion: los valores estandar lo llevan adentro (`given-name`) y
  // partirlos por ahi convierte `given-name` en `name`, que es el valor de
  // nombre completo. Se separa solo por espacios, que es como el estandar
  // encadena los prefijos: `section-blue shipping given-name`.
  const tokens = raw.toLowerCase().trim().split(/\s+/);

  // El nombre del campo va ultimo; los de adelante son prefijos de seccion.
  for (let i = tokens.length - 1; i >= 0; i--) {
    const owners = AUTOCOMPLETE_OWNERS.get(tokens[i]!);
    if (owners?.length === 1) return owners[0]!;
  }
  return null;
}

/** La pregunta que engloba a un grupo de radios: legend, fieldset o contenedor. */
function groupQuestion(el: HTMLInputElement): string {
  const fieldset = el.closest('fieldset');
  const legend = fieldset?.querySelector('legend');
  if (legend?.textContent) return clean(legend.textContent);

  const group = el.closest('[role="radiogroup"], [role="group"]');
  const groupLabel = group?.getAttribute('aria-label');
  if (groupLabel) return clean(groupLabel);

  const labelledBy = group?.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => el.ownerDocument.getElementById(id)?.textContent ?? '')
      .join(' ');
    if (text.trim()) return clean(text);
  }

  return nearbyText(el);
}
