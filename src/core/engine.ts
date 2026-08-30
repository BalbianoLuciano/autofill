/**
 * El motor: corre dentro de la pagina, junta los campos, los rellena y arma el
 * informe que el popup muestra.
 *
 * No decide politicas: recibe el perfil, los mappings aprendidos y los ajustes,
 * y se limita a aplicarlos. Toda la decision de que es sensible vive en el
 * diccionario.
 */

import { FIELD_BY_KEY, type FieldKey } from './fields';
import { detectFields, type DetectedField } from './matcher';
import { clearHighlights, fill, highlight } from './filler';
import type { FieldSignature, FillReport, FilledField, Profile, SkippedField } from '../types';

export interface RunOptions {
  profile: Profile;
  mappings: Record<FieldSignature, FieldKey>;
  fillSensitive: boolean;
  overwriteFilled: boolean;
}

export function runFill(options: RunOptions): FillReport {
  clearHighlights(document);

  const detected = detectFields(document, { learned: options.mappings });
  const filled: FilledField[] = [];
  const skipped: SkippedField[] = [];
  const seenSignatures = new Set<FieldSignature>();

  for (const field of detected) {
    // Un mismo `name` puede repetirse entre pasos del formulario; el primero
    // que se ve es el que esta a la vista.
    if (seenSignatures.has(field.signature)) continue;
    seenSignatures.add(field.signature);

    const outcome = applyTo(field, options);
    if (outcome.kind === 'filled') filled.push(outcome.field);
    else if (outcome.kind === 'skipped') skipped.push(outcome.field);
  }

  return { hostname: location.hostname, filled, skipped };
}

type Outcome =
  | { kind: 'filled'; field: FilledField }
  | { kind: 'skipped'; field: SkippedField }
  | { kind: 'ignored' };

function applyTo(field: DetectedField, options: RunOptions): Outcome {
  const { el, group, signature, label, key, via } = field;

  if (key === null) {
    highlight(el, 'unmapped');
    return { kind: 'skipped', field: { signature, label, reason: 'unmapped' } };
  }

  const def = FIELD_BY_KEY.get(key);

  // Los seis sensibles no se rellenan solos: un salario mal puesto o un
  // "requiero visa" equivocado queman la aplicacion.
  if (def?.sensitive && !options.fillSensitive) {
    highlight(el, 'sensitive');
    return { kind: 'skipped', field: { signature, label, key, reason: 'sensitive' } };
  }

  const value = options.profile[key];
  if (!value) {
    return { kind: 'skipped', field: { signature, label, key, reason: 'no-value' } };
  }

  if (hasContent(el, group) && !options.overwriteFilled) {
    return { kind: 'skipped', field: { signature, label, key, reason: 'already-filled' } };
  }

  const result = fill(el, value, group);
  if (!result.ok) {
    highlight(el, 'unmapped');
    return {
      kind: 'skipped',
      field: { signature, label, key, reason: 'no-option', options: result.options },
    };
  }

  highlight(el, 'filled');
  return { kind: 'filled', field: { key, label, value, via: via ?? 'attributes' } };
}

function hasContent(el: DetectedField['el'], group?: HTMLInputElement[]): boolean {
  if (group && group.length > 0) return group.some((input) => input.checked);
  if (el instanceof HTMLSelectElement) return el.value !== '' && el.selectedIndex > 0;
  return el.value.trim() !== '';
}

/**
 * Rellena un campo puntual despues de que la persona lo mapeo a mano desde el
 * popup. Se vuelve a detectar en vez de guardar referencias: entre el primer
 * intento y este click el formulario pudo haber cambiado de nodos.
 */
export function applyLearned(
  signature: FieldSignature,
  key: FieldKey,
  value: string,
): boolean {
  const detected = detectFields(document, { learned: { [signature]: key } });
  const target = detected.find((field) => field.signature === signature);
  if (!target) return false;

  const result = fill(target.el, value, target.group);
  if (!result.ok) return false;

  highlight(target.el, 'filled');
  return true;
}
