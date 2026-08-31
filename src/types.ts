import type { FieldKey } from './core/fields';

export type { FieldKey };

/** Los dos idiomas en los que se completa un formulario. */
export type Lang = 'es' | 'en';

export type Currency = 'USD' | 'ARS' | 'EUR';
export type Period = 'hour' | 'month' | 'year';

/**
 * Regiones donde la persona puede trabajar legalmente.
 *
 * Sirven para contestar "¿estas autorizado a trabajar en X?" sin que la
 * respuesta sea una frase que ningun radio button va a matchear.
 */
export type RegionCode = 'AR' | 'ES' | 'EU' | 'US' | 'UK' | 'CA' | 'MX' | 'BR';

/* --------------------------- valores del perfil --------------------------- */

/**
 * Texto libre. `en` es opcional: cuando falta se usa `es`, asi un perfil a
 * medio cargar sigue sirviendo.
 */
export interface TextValue {
  kind: 'text';
  es?: string;
  en?: string;
}

/** Una opcion de una lista cerrada. Se guarda el codigo, no la etiqueta. */
export interface ChoiceValue {
  kind: 'choice';
  code: string;
}

export interface SalaryEntry {
  amount: number;
  currency: Currency;
  period: Period;
}

/**
 * Una pretension por moneda.
 *
 * Se guarda una entrada por moneda y **no se convierte entre monedas**: el tipo
 * de cambio se mueve, y en Argentina hay varios a la vez. Entre periodos si se
 * convierte, porque eso es aritmetica.
 */
export interface SalaryValue {
  kind: 'salary';
  entries: SalaryEntry[];
  /** Para pasar de sueldo mensual a tarifa horaria. */
  hoursPerMonth: number;
}

export interface RegionsValue {
  kind: 'regions';
  codes: RegionCode[];
}

export type ProfileValue = TextValue | ChoiceValue | SalaryValue | RegionsValue;

export type Profile = Partial<Record<FieldKey, ProfileValue>>;

/* -------------------------------- el resto -------------------------------- */

/**
 * Firma de un campo dentro de un formulario: `name` si existe, si no `id`,
 * si no el texto del label normalizado. Estable entre visitas al mismo sitio.
 */
export type FieldSignature = string;

/** hostname -> firma -> clave del perfil. Lo que la extension aprendio. */
export type Mappings = Record<string, Record<FieldSignature, FieldKey>>;

export interface Settings {
  /** Rellenar tambien los campos sensibles. Default: false. */
  fillSensitive: boolean;
  /**
   * Pisar campos que ya tenian contenido. Default: false, porque varios ATS
   * prellenan el formulario parseando el CV y esas respuestas ya son buenas.
   */
  overwriteFilled: boolean;
  /**
   * Forzar un idioma en vez de detectarlo de la pagina. 'auto' es el default.
   */
  language: Lang | 'auto';
}

export interface Store {
  profile: Profile;
  mappings: Mappings;
  settings: Settings;
}

/**
 * Lo que el formulario pide ademas del campo en si: si quiere la cifra por
 * hora o por ano, en que moneda, y sobre que region pregunta.
 *
 * Se lee del label, no del perfil. Es la diferencia entre pegar "2500" en
 * "expected annual salary (USD)" y pegar "30000".
 */
export interface Qualifiers {
  period?: Period;
  currency?: Currency;
  region?: RegionCode;
}

/** Por que un campo quedo sin completar. */
export type SkipReason =
  | 'sensitive'      // se reconocio, pero no se rellena solo
  | 'no-value'       // se reconocio, pero el perfil no tiene ese dato
  | 'no-currency'    // pide una moneda que el perfil no tiene cargada
  | 'no-option'      // es un select/radio y ninguna opcion se parecio al valor
  | 'already-filled' // ya tenia contenido y no se pisa sin permiso
  | 'unmapped';      // no se pudo reconocer que campo es

export interface FilledField {
  key: FieldKey;
  signature: FieldSignature;
  label: string;
  value: string;
  /** Con que paso de la cascada se reconocio (§5 del spec). */
  via: MatchSource;
}

export interface SkippedField {
  signature: FieldSignature;
  label: string;
  reason: SkipReason;
  /** Presente salvo cuando reason === 'unmapped'. */
  key?: FieldKey;
  /**
   * El valor que corresponderia. En los sensibles se muestra en el popup para
   * copiarlo a mano: es la cifra ya resuelta al periodo y la moneda que pide
   * ese formulario.
   */
  suggestion?: string;
  /** Para selects sin opcion parecida: que opciones habia. */
  options?: string[];
}

export type MatchSource =
  | 'learned'
  | 'autocomplete'
  | 'label'
  | 'attributes'
  | 'nearby-text';

/** Lo que el content script devuelve despues de rellenar. */
export interface FillReport {
  hostname: string;
  lang: Lang;
  filled: FilledField[];
  skipped: SkippedField[];
}

/* ------------------------------ mensajes ------------------------------ */

export interface RunFillMessage {
  type: 'AUTOFILL_RUN';
  profile: Profile;
  mappings: Record<FieldSignature, FieldKey>;
  settings: Settings;
}

export interface ApplyLearnedMessage {
  type: 'AUTOFILL_APPLY_LEARNED';
  signature: FieldSignature;
  key: FieldKey;
  profile: Profile;
  settings: Settings;
}

export interface PingMessage {
  type: 'AUTOFILL_PING';
}

export type Message = RunFillMessage | ApplyLearnedMessage | PingMessage;
