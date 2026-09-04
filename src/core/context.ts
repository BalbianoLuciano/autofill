/**
 * Lo que se lee de la pagina, no del perfil.
 *
 * Un formulario no pide "salario": pide *expected annual salary (USD)*. Y no
 * pregunta "permiso de trabajo": pregunta *are you authorized to work in the
 * EU?*. Esas precisiones estan en el label y cambian cual es la respuesta
 * correcta, asi que hay que leerlas antes de resolver nada.
 */

import { normalize } from './normalize';
import type { Currency, Lang, Period, Qualifiers, RegionCode, SalaryBasis } from '../types';

/* -------------------------------- idioma -------------------------------- */

// Palabras funcionales: son las que mas se repiten y las que menos se
// comparten entre los dos idiomas.
const ES_STOPWORDS = [
  'de', 'la', 'el', 'los', 'las', 'del', 'una', 'para', 'con', 'tu', 'tus',
  'que', 'por', 'como', 'sobre', 'tambien', 'mas', 'cual', 'este', 'esta',
];

const EN_STOPWORDS = [
  'the', 'of', 'and', 'to', 'your', 'for', 'with', 'are', 'you', 'this',
  'we', 'have', 'will', 'from', 'about', 'please', 'do', 'is',
];

/**
 * Idioma en el que hay que contestar.
 *
 * `<html lang>` primero, que es lo que declara el sitio. Si no dice nada o
 * dice algo que no sirve, se cuentan palabras funcionales sobre el texto
 * visible. Ante la duda, ingles: es el idioma de la mayoria de los
 * formularios tecnicos, incluso en empresas que no son anglosajonas.
 */
export function detectLanguage(doc: Document, forced: Lang | 'auto' = 'auto'): Lang {
  if (forced !== 'auto') return forced;

  const declared = doc.documentElement.getAttribute('lang')?.toLowerCase() ?? '';
  if (declared.startsWith('es')) return 'es';
  if (declared.startsWith('en')) return 'en';

  return guessLanguage(doc.body?.textContent ?? '');
}

export function guessLanguage(text: string): Lang {
  const tokens = normalize(text.slice(0, 8000)).split(' ');
  if (tokens.length < 12) return 'en';

  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);

  const score = (words: string[]) =>
    words.reduce((sum, word) => sum + (counts.get(word) ?? 0), 0);

  return score(ES_STOPWORDS) > score(EN_STOPWORDS) ? 'es' : 'en';
}

/* -------------------------------- el puesto -------------------------------- */

/**
 * El nombre del puesto, para elegir entre el CV de IA y el de liderazgo.
 *
 * `document.title` no alcanza: en BambooHR dice "BambooHR" y en el ATS de
 * Easy Peasy dice "Easy Peasy ATS". El puesto esta en el `og:title` o en el
 * primer encabezado, y solo si no hay ninguno se cae al titulo de la pestana.
 */
export function readJobTitle(doc: Document): string {
  const og = doc.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content?.trim();
  if (og) return og;

  for (const selector of ['h1', 'h2', '[class*="job-title"]', '[class*="position"]']) {
    const texto = doc.querySelector(selector)?.textContent?.trim();
    // Un encabezado largo es la descripcion del puesto, no su nombre.
    if (texto && texto.length <= 90) return texto;
  }

  return doc.title ?? '';
}

/* ------------------------------ calificadores ------------------------------ */

const PERIOD_PATTERNS: [Period, RegExp][] = [
  ['hour', /\b(hour|hourly|hr|per hour|rate per hour|hora|por hora|hora reloj)\b/],
  ['month', /\b(month|monthly|per month|mo|mes|mensual|por mes|mensuales)\b/],
  // `ano` porque normalize saca las tildes y `año` queda asi.
  ['year', /\b(year|yearly|annual|annually|per year|per annum|salario anual|ano|anual|anuales|por ano)\b/],
];

/**
 * Bruto o neto.
 *
 * Se mira antes que nada porque cambia el numero, no el formato: contestar en
 * neto lo que preguntan en bruto es equivocarse por el margen del impuesto.
 */
const BASIS_PATTERNS: [SalaryBasis, RegExp][] = [
  ['gross', /\b(bruto|brutos|bruta|brutas|gross|before tax|antes de impuestos|en bruto)\b/],
  ['net', /\b(neto|netos|neta|netas|net|take home|after tax|despues de impuestos|en mano|liquido|liquidos)\b/],
];

const CURRENCY_PATTERNS: [Currency, RegExp][] = [
  ['USD', /\b(usd|dollar|dollars|dolar|dolares|dolares estadounidenses)\b/],
  ['ARS', /\b(ars|peso|pesos|argentine peso|pesos argentinos)\b/],
  ['EUR', /\b(eur|euro|euros)\b/],
];

// El orden importa: lo mas especifico primero. `europe` es el mas amplio y va
// ultimo para que "Spain" no termine clasificado como UE a secas.
const REGION_PATTERNS: [RegionCode, RegExp][] = [
  ['ES', /\b(spain|espana)\b/],
  ['AR', /\b(argentina|argentine)\b/],
  ['UK', /\b(uk|united kingdom|great britain|reino unido)\b/],
  ['CA', /\b(canada|canadian)\b/],
  ['MX', /\b(mexico|mexican)\b/],
  ['BR', /\b(brazil|brasil)\b/],
  // `us` suelto no sirve: "tell us about yourself" lo dispararia. Se exige la
  // forma larga o la preposicion delante.
  ['US', /\b(united states|usa|eeuu|estados unidos|in the us|for the us)\b/],
  ['EU', /\b(eu|european union|europe|ue|union europea|europa|schengen)\b/],
];

/**
 * Lee del texto del campo que precision pide: por hora o por ano, en que
 * moneda, y sobre que region pregunta.
 */
export function extractQualifiers(text: string): Qualifiers {
  const raw = text.toLowerCase();
  const normalized = normalize(text);
  const qualifiers: Qualifiers = {};

  for (const [period, pattern] of PERIOD_PATTERNS) {
    if (pattern.test(normalized)) { qualifiers.period = period; break; }
  }

  for (const [currency, pattern] of CURRENCY_PATTERNS) {
    if (pattern.test(normalized)) { qualifiers.currency = currency; break; }
  }
  // Los simbolos no sobreviven a normalize, asi que se miran sobre el crudo.
  // `$` a secas queda afuera a proposito: lo usan tanto el peso como el dolar.
  if (!qualifiers.currency) {
    if (/u\$s|us\$/.test(raw)) qualifiers.currency = 'USD';
    else if (/€/.test(raw)) qualifiers.currency = 'EUR';
  }

  for (const [region, pattern] of REGION_PATTERNS) {
    if (pattern.test(normalized)) { qualifiers.region = region; break; }
  }

  for (const [basis, pattern] of BASIS_PATTERNS) {
    if (pattern.test(normalized)) { qualifiers.basis = basis; break; }
  }

  return qualifiers;
}
