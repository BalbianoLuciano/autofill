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

export interface SkillEntry {
  /** Como la escribis vos: "React", "Node.js", "AWS". */
  name: string;
  years: number;
}

/**
 * Anios de experiencia, general y por tecnologia.
 *
 * Es un solo campo y no dos porque son la misma pregunta con distinta
 * precision: "cuantos anios de experiencia" y "cuantos anios con React" se
 * resuelven leyendo el label, igual que el permiso de trabajo se resuelve
 * leyendo de que pais habla la pregunta.
 */
export interface SkillsValue {
  kind: 'skills';
  /** Experiencia profesional total, para cuando la pregunta es general. */
  totalYears: number;
  entries: SkillEntry[];
}

export type ProfileValue =
  | TextValue
  | ChoiceValue
  | SalaryValue
  | RegionsValue
  | SkillsValue;

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
  /**
   * Enviar la aplicacion sola cuando no falte nada. Default: false.
   *
   * No se puede des-aplicar, y varios ATS bloquean volver a postularse al
   * mismo puesto, asi que esto se prende a mano y una sola vez.
   */
  autoApply: boolean;
  /** Segundos de cuenta regresiva antes de enviar, para poder cancelar. */
  autoApplyDelay: number;
  /** Adjuntar el CV solo. Default: true. */
  attachCv: boolean;
}

export interface Store {
  profile: Profile;
  mappings: Mappings;
  settings: Settings;
  questions: CustomQuestion[];
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
  | 'unlisted-skill' // pregunta por una tecnologia que no esta en tu perfil
  | 'no-option'      // es un select/radio y ninguna opcion se parecio al valor
  | 'needs-answer'   // pregunta abierta sin respuesta guardada: la contestas vos
  | 'already-filled' // ya tenia contenido y no se pisa sin permiso
  | 'unmapped';      // no se pudo reconocer que campo es

export interface FilledField {
  key: FieldKey;
  signature: FieldSignature;
  label: string;
  value: string;
  /** La tecnologia por la que preguntaba, si preguntaba por alguna. */
  skill?: string;
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
  /** La tecnologia por la que preguntaba y no tenes cargada. */
  skill?: string;
}

export type MatchSource =
  | 'learned'
  | 'autocomplete'
  | 'label'
  | 'attributes'
  | 'nearby-text';

/** Como quedo el intento de enviar la aplicacion. */
export type ApplyOutcome =
  | { status: 'off' }                                  // el ajuste esta apagado
  | { status: 'incomplete'; missing: string[] }        // faltan obligatorios
  | { status: 'no-button' }                            // no se encontro el boton
  | { status: 'armed'; label: string };                // cuenta regresiva corriendo

/** Lo que el content script devuelve despues de rellenar. */
export interface FillReport {
  hostname: string;
  lang: Lang;
  filled: FilledField[];
  skipped: SkippedField[];
  /** Si se adjunto el CV, y cual. */
  cvAttached?: string;
  apply: ApplyOutcome;
}

/* ------------------------------ mensajes ------------------------------ */

export interface RunFillMessage {
  type: 'AUTOFILL_RUN';
  profile: Profile;
  mappings: Record<FieldSignature, FieldKey>;
  settings: Settings;
  questions: CustomQuestion[];
  /** El CV elegido, ya resuelto por el popup. */
  cv?: (CvMeta & CvBlob) | null;
}

/** Guarda la respuesta que la persona escribio en el overlay y la rellena. */
export interface AnswerQuestionMessage {
  type: 'AUTOFILL_ANSWER';
  signature: FieldSignature;
  answer: string;
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

export type Message =
  | RunFillMessage
  | ApplyLearnedMessage
  | AnswerQuestionMessage
  | PingMessage;

/* ---------------------------- preguntas propias ---------------------------- */

/**
 * Una pregunta abierta que un formulario hizo y el diccionario no cubre
 * ("describi la automatizacion mas compleja que construiste"). Se guarda con
 * su respuesta y se reusa por similitud contra el label del proximo.
 */
export interface CustomQuestion {
  id: string;
  /** El texto tal como lo pidio el formulario. */
  question: string;
  answer: string;
  /** Donde se vio por primera vez, para poder revisarla despues. */
  hostname?: string;
  updatedAt: number;
}

/* ---------------------------------- CVs ---------------------------------- */

export type CvRole = 'ai' | 'lead' | 'any';

export interface CvMeta {
  id: string;
  /** Nombre del archivo, tal como se sube al formulario. */
  filename: string;
  /** Como lo llamas vos en el selector: "IA Engineer · ES". */
  label: string;
  lang: Lang;
  role: CvRole;
  mime: string;
  size: number;
}

/** El archivo en si, en base64: un content script no ve el IndexedDB de la extension. */
export interface CvBlob {
  id: string;
  base64: string;
}
