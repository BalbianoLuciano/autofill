/**
 * De lo que la persona guardo, al texto exacto que va en *este* campo.
 *
 * El perfil guarda intencion —"quiero 2500 dolares por mes", "puedo trabajar
 * en Argentina y España"— y el formulario pide un valor concreto: un numero
 * anual, un "No", la opcion de un select. Traducir de uno al otro es todo lo
 * que hace este archivo.
 */

import { FIELD_BY_KEY, type FieldKey } from './fields';
import { detectSkill } from './skills';
import type {
  Currency, Lang, Period, Profile, ProfileValue, Qualifiers, RegionCode, SalaryBasis,
} from '../types';

export interface ResolveContext {
  lang: Lang;
  qualifiers: Qualifiers;
  /** El input solo acepta numeros: nada de "2500 USD por mes". */
  numeric?: boolean;
  /** El `type` del input, que decide el formato de las fechas. */
  inputType?: string;
  /**
   * El texto del campo: label mas placeholder. De aca se lee de que tecnologia
   * habla la pregunta, que es lo que decide cuantos anios contestar.
   */
  text?: string;
}

/** Los tipos que exigen una fecha con formato, no una palabra. */
const DATE_INPUTS = new Set(['date', 'month', 'week', 'datetime-local']);

/**
 * La fecha que corresponde a un desplazamiento en dias, con el formato que
 * pide ese input. Sin esto, un `type="date"` recibe "Inmediata" y la descarta
 * sin decir nada: queda igual de vacio que antes, pero parece que funciono.
 */
export function formatDate(offsetDays: number, inputType: string, now = new Date()): string {
  const date = new Date(now);
  date.setDate(date.getDate() + offsetDays);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  if (inputType === 'month') return `${year}-${month}`;
  if (inputType === 'datetime-local') return `${year}-${month}-${day}T09:00`;
  return `${year}-${month}-${day}`;
}

export interface Resolution {
  /** Que tecnologia se reconocio en la pregunta, si hubo alguna. */
  skill?: string;
  /**
   * Candidatos en orden de preferencia. El primero es el que se escribe en un
   * input de texto; la lista entera se usa para elegir la opcion de un select
   * o de un grupo de radios.
   */
  candidates: string[];
  /** Si no se pudo resolver, por que. */
  problem?: 'no-value' | 'no-currency' | 'no-basis' | 'unlisted-skill';
}

const EMPTY: Resolution = { candidates: [], problem: 'no-value' };

export function resolve(
  key: FieldKey,
  profile: Profile,
  ctx: ResolveContext,
): Resolution {
  // El patrocinio se deduce del permiso de trabajo cuando la pregunta dice de
  // que pais habla: si podes trabajar ahi, no necesitas que te patrocinen.
  if (key === 'requiresSponsorship') {
    const derived = deriveSponsorship(profile, ctx);
    if (derived) return derived;
  }

  const value = profile[key];
  if (!value) return EMPTY;

  switch (value.kind) {
    case 'text':    return resolveText(value, ctx);
    case 'choice':  return resolveChoice(key, value.code, ctx);
    case 'salary':  return resolveSalary(value, ctx);
    case 'regions': return resolveRegions(value.codes, ctx);
    case 'skills':  return resolveSkills(value, ctx);
  }
}

/* ------------------------------- experiencia ------------------------------- */

/**
 * Cuantos anios contestar.
 *
 * Si la pregunta nombra una tecnologia, se responde por esa. Si nombra una que
 * no tenes cargada, se dice que no la tenes en vez de repetir tu total: poner
 * cinco anios de Kubernetes porque tenes cinco de experiencia es afirmar algo
 * falso, y queda por escrito en la postulacion.
 */
function resolveSkills(
  value: Extract<ProfileValue, { kind: 'skills' }>,
  ctx: ResolveContext,
): Resolution {
  const asked = detectSkill(ctx.text ?? '', value.entries);

  if (asked?.kind === 'known') {
    return { candidates: numberCandidates(asked.entry.years, ctx), skill: asked.entry.name };
  }

  if (asked?.kind === 'unlisted') {
    return { candidates: [], problem: 'unlisted-skill', skill: asked.name };
  }

  if (!Number.isFinite(value.totalYears) || value.totalYears <= 0) return EMPTY;
  return { candidates: numberCandidates(value.totalYears, ctx) };
}

/** El numero pelado primero; las formas con unidad ayudan en los desplegables. */
function numberCandidates(years: number, ctx: ResolveContext): string[] {
  const plain = String(years);
  if (ctx.numeric) return [plain];
  return [plain, `${years}+`, ctx.lang === 'en' ? `${years} years` : `${years} años`];
}

/* --------------------------------- texto --------------------------------- */

function resolveText(value: Extract<ProfileValue, { kind: 'text' }>, ctx: ResolveContext): Resolution {
  const primary = ctx.lang === 'en' ? value.en : value.es;
  const fallback = ctx.lang === 'en' ? value.es : value.en;
  const chosen = primary?.trim() || fallback?.trim();
  return chosen ? { candidates: [chosen] } : EMPTY;
}

/* -------------------------------- opciones -------------------------------- */

function resolveChoice(key: FieldKey, code: string, ctx: ResolveContext): Resolution {
  const option = FIELD_BY_KEY.get(key)?.options?.find((o) => o.code === code);
  if (!option) return EMPTY;

  // Un campo de fecha quiere una fecha, no la etiqueta de la opcion.
  if (option.offsetDays !== undefined && ctx.inputType && DATE_INPUTS.has(ctx.inputType)) {
    return { candidates: [formatDate(option.offsetDays, ctx.inputType)] };
  }

  // La etiqueta del idioma de la pagina primero; despues la del otro idioma y
  // los sinonimos, que son los que salvan un select escrito de otra forma.
  const label = ctx.lang === 'en' ? option.en : option.es;
  const other = ctx.lang === 'en' ? option.es : option.en;

  return { candidates: [label, other, ...(option.match ?? [])] };
}

/* -------------------------------- salario -------------------------------- */

/** Meses trabajados en un año. No cambia aunque el sueldo se pague en 14. */
const MONTHS_WORKED = 12;

/**
 * Todo pasa por el total anual, que es la unica unidad que no depende de como
 * se reparta el pago.
 *
 * `paymentsPerYear` es en cuantos pagos se divide ese total —12, o 14 en
 * España— y por eso decide cuanto es "un sueldo mensual". Las horas, en
 * cambio, se trabajan doce meses igual: la tarifa horaria sale del anual
 * dividido por los meses trabajados, no por la cantidad de pagas.
 */
function convert(
  amount: number,
  from: Period,
  to: Period,
  hoursPerMonth: number,
  paymentsPerYear: number,
): number {
  if (from === to) return amount;

  const annual =
    from === 'year' ? amount
    : from === 'month' ? amount * paymentsPerYear
    : amount * hoursPerMonth * MONTHS_WORKED;

  if (to === 'year') return annual;
  if (to === 'month') return annual / paymentsPerYear;
  return annual / (hoursPerMonth * MONTHS_WORKED);
}

function format(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

const CURRENCY_WORD: Record<Currency, { es: string; en: string }> = {
  USD: { es: 'USD', en: 'USD' },
  ARS: { es: 'ARS', en: 'ARS' },
  EUR: { es: 'EUR', en: 'EUR' },
};

const BASIS_WORD: Record<SalaryBasis, { es: string; en: string }> = {
  gross: { es: 'brutos', en: 'gross' },
  net: { es: 'netos', en: 'net' },
};

const PERIOD_WORD: Record<Period, { es: string; en: string }> = {
  hour: { es: 'por hora', en: 'per hour' },
  month: { es: 'por mes', en: 'per month' },
  year: { es: 'por año', en: 'per year' },
};

function resolveSalary(
  value: Extract<ProfileValue, { kind: 'salary' }>,
  ctx: ResolveContext,
): Resolution {
  if (value.entries.length === 0) return EMPTY;

  const { currency: wantedCurrency, basis: wantedBasis } = ctx.qualifiers;

  // Entre monedas no se convierte: el tipo de cambio se mueve, y en Argentina
  // hay varios a la vez. Si el formulario pide una moneda que no esta cargada,
  // se dice, en vez de inventar una cifra.
  const byCurrency = wantedCurrency
    ? value.entries.filter((e) => e.currency === wantedCurrency)
    : value.entries;

  if (byCurrency.length === 0) return { candidates: [], problem: 'no-currency' };

  /*
   * Entre bruto y neto tampoco se convierte, y por la misma razon: depende del
   * pais, del tramo y de la situacion personal de cada uno. Contestar en neto
   * lo que preguntan en bruto es equivocarse por el margen del impuesto, y en
   * un numero que nadie vuelve a mirar despues de enviarlo.
   *
   * Una entrada sin bruto/neto declarado sirve para cualquier pregunta: es el
   * caso de quien nunca hizo la distincion.
   */
  const entry = wantedBasis
    ? byCurrency.find((e) => e.basis === wantedBasis || e.basis === undefined)
    : byCurrency[0];

  if (!entry) return { candidates: [], problem: 'no-basis' };

  const period = ctx.qualifiers.period ?? entry.period;
  const amount = format(
    convert(entry.amount, entry.period, period, value.hoursPerMonth, value.paymentsPerYear),
  );

  // Si el input solo toma numeros, o el label ya aclara periodo y moneda, va
  // el numero pelado. Si no, se acompana para que se entienda que es.
  if (ctx.numeric || (ctx.qualifiers.period && ctx.qualifiers.currency)) {
    return { candidates: [amount] };
  }

  const currency = CURRENCY_WORD[entry.currency][ctx.lang];
  const periodWord = PERIOD_WORD[period][ctx.lang];
  const basisWord = entry.basis ? ` ${BASIS_WORD[entry.basis][ctx.lang]}` : '';
  return { candidates: [`${amount} ${currency}${basisWord} ${periodWord}`, amount] };
}

/* -------------------------------- regiones -------------------------------- */

const REGION_NAME: Record<RegionCode, { es: string; en: string }> = {
  AR: { es: 'Argentina', en: 'Argentina' },
  ES: { es: 'España', en: 'Spain' },
  EU: { es: 'Unión Europea', en: 'European Union' },
  US: { es: 'Estados Unidos', en: 'United States' },
  UK: { es: 'Reino Unido', en: 'United Kingdom' },
  CA: { es: 'Canadá', en: 'Canada' },
  MX: { es: 'México', en: 'Mexico' },
  BR: { es: 'Brasil', en: 'Brazil' },
};

const YES = { es: 'Sí', en: 'Yes', match: ['si', 'sí', 'yes', 'y', 'true'] };
const NO = { es: 'No', en: 'No', match: ['no', 'n', 'false'] };

/**
 * Un permiso en España habilita a trabajar en la UE, y al reves la UE incluye
 * a España. Sin esta expansion, "authorized to work in the EU" se contestaria
 * que no teniendo permiso español.
 */
export function expandRegions(codes: RegionCode[]): Set<RegionCode> {
  const expanded = new Set(codes);
  if (expanded.has('ES')) expanded.add('EU');
  if (expanded.has('EU')) expanded.add('ES');
  return expanded;
}

function resolveRegions(codes: RegionCode[], ctx: ResolveContext): Resolution {
  if (codes.length === 0) return EMPTY;

  const asked = ctx.qualifiers.region;

  // La pregunta nombra un pais: la respuesta es si o no, que es lo que el
  // radio button espera. Sin eso, se listan las regiones como texto.
  if (asked) {
    const authorized = expandRegions(codes).has(asked);
    const answer = authorized ? YES : NO;
    const label = ctx.lang === 'en' ? answer.en : answer.es;
    const other = ctx.lang === 'en' ? answer.es : answer.en;
    return { candidates: [label, other, ...answer.match] };
  }

  const names = codes.map((code) => REGION_NAME[code][ctx.lang]);
  const joiner = ctx.lang === 'en' ? ' and ' : ' y ';
  const listed =
    names.length > 1
      ? `${names.slice(0, -1).join(', ')}${joiner}${names[names.length - 1]}`
      : names[0]!;

  return { candidates: [listed, ...names] };
}

/* ------------------------------- patrocinio ------------------------------- */

function deriveSponsorship(profile: Profile, ctx: ResolveContext): Resolution | null {
  const asked = ctx.qualifiers.region;
  const authorization = profile.workAuthorization;
  if (!asked || authorization?.kind !== 'regions') return null;

  // Si podes trabajar ahi, no necesitas patrocinio. La respuesta es la
  // inversa del permiso.
  const answer = expandRegions(authorization.codes).has(asked) ? NO : YES;
  const label = ctx.lang === 'en' ? answer.en : answer.es;
  const other = ctx.lang === 'en' ? answer.es : answer.en;
  return { candidates: [label, other, ...answer.match] };
}
