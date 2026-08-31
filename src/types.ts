import type { FieldKey } from './core/fields';

export type { FieldKey };

/** El perfil: una clave del diccionario -> el valor que la persona guardo. */
export type Profile = Partial<Record<FieldKey, string>>;

/**
 * Firma de un campo dentro de un formulario: `name` si existe, si no `id`,
 * si no el texto del label normalizado. Estable entre visitas al mismo sitio.
 */
export type FieldSignature = string;

/** hostname -> firma -> clave del perfil. Lo que la extension aprendio. */
export type Mappings = Record<string, Record<FieldSignature, FieldKey>>;

export interface Settings {
  /** Rellenar tambien los seis campos sensibles. Default: false. */
  fillSensitive: boolean;
  /**
   * Pisar campos que ya tenian contenido. Default: false, porque varios ATS
   * prellenan el formulario parseando el CV y esas respuestas ya son buenas.
   */
  overwriteFilled: boolean;
}

export interface Store {
  profile: Profile;
  mappings: Mappings;
  settings: Settings;
}

/** Por que un campo quedo sin completar. */
export type SkipReason =
  | 'sensitive'      // se reconocio, pero no se rellena solo
  | 'no-value'       // se reconocio, pero el perfil no tiene ese dato
  | 'no-option'      // es un select/radio y ninguna opcion se parecio al valor
  | 'already-filled' // ya tenia contenido y no se pisa sin permiso
  | 'unmapped';      // no se pudo reconocer que campo es

/** Un campo que la extension reconocio y completo. */
export interface FilledField {
  key: FieldKey;
  signature: FieldSignature;
  label: string;
  value: string;
  /** Con que paso de la cascada se reconocio (§5 del spec). */
  via: MatchSource;
}

/** Un campo que quedo sin completar, con el motivo. */
export interface SkippedField {
  signature: FieldSignature;
  label: string;
  reason: SkipReason;
  /** Presente salvo cuando reason === 'unmapped'. */
  key?: FieldKey;
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
  filled: FilledField[];
  skipped: SkippedField[];
}

/* ------------------------------ mensajes ------------------------------ */

export interface RunFillMessage {
  type: 'AUTOFILL_RUN';
  profile: Profile;
  /** Solo los mappings del hostname de esta pestana. */
  mappings: Record<FieldSignature, FieldKey>;
  fillSensitive: boolean;
  overwriteFilled: boolean;
}

/** Se dispara cuando la persona resuelve un campo sin mapear desde el popup. */
export interface ApplyLearnedMessage {
  type: 'AUTOFILL_APPLY_LEARNED';
  signature: FieldSignature;
  key: FieldKey;
  value: string;
}

export interface PingMessage {
  type: 'AUTOFILL_PING';
}

export type Message = RunFillMessage | ApplyLearnedMessage | PingMessage;
