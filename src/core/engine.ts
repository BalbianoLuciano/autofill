/**
 * El motor: corre dentro de la pagina, junta los campos, los rellena y arma el
 * informe que el popup muestra.
 *
 * No decide que significa cada dato: eso es `resolve`. Lo que decide son las
 * politicas —que es sensible, que no se pisa, que se reporta— y son todas
 * visibles en `applyTo`.
 */

import { FIELD_BY_KEY, type FieldKey } from './fields';
import { detectFields, type DetectedField } from './matcher';
import { clearHighlights, fill, highlight, isNumericInput, scrollToFirst } from './filler';
import { detectLanguage, extractQualifiers } from './context';
import { resolve } from './resolve';
import type {
  FieldSignature, FillReport, FilledField, Lang, Profile, Settings, SkippedField,
} from '../types';

export interface RunOptions {
  profile: Profile;
  mappings: Record<FieldSignature, FieldKey>;
  settings: Settings;
}

export function runFill(options: RunOptions): FillReport {
  clearHighlights(document);

  const lang = detectLanguage(document, options.settings.language);
  const detected = detectFields(document, { learned: options.mappings });

  const filled: FilledField[] = [];
  const skipped: SkippedField[] = [];
  const seenSignatures = new Set<FieldSignature>();
  // Los sensibles son lo unico que queda por hacer a mano, asi que la pagina
  // termina posicionada en el primero.
  const sensitive: Element[] = [];

  for (const field of detected) {
    // Un mismo `name` puede repetirse entre pasos del formulario; el primero
    // que se ve es el que esta a la vista.
    if (seenSignatures.has(field.signature)) continue;
    seenSignatures.add(field.signature);

    const outcome = applyTo(field, options, lang);
    if (outcome.kind === 'filled') filled.push(outcome.field);
    else if (outcome.kind === 'skipped') {
      skipped.push(outcome.field);
      if (outcome.field.reason === 'sensitive') sensitive.push(field.el);
    }
  }

  scrollToFirst(sensitive);

  return { hostname: location.hostname, lang, filled, skipped };
}

type Outcome =
  | { kind: 'filled'; field: FilledField }
  | { kind: 'skipped'; field: SkippedField }
  | { kind: 'ignored' };

function applyTo(field: DetectedField, options: RunOptions, lang: Lang): Outcome {
  const { el, group, signature, label, key, via } = field;

  if (key === null) {
    highlight(el, 'unmapped');
    return { kind: 'skipped', field: { signature, label, reason: 'unmapped' } };
  }

  // El label dice si quiere la cifra por hora o por ano, en que moneda y sobre
  // que pais pregunta. Sin eso, "2500" y "30000" son igual de plausibles.
  const qualifiers = extractQualifiers(`${label} ${el.getAttribute('placeholder') ?? ''}`);
  const resolution = resolve(key, options.profile, {
    lang,
    qualifiers,
    numeric: isNumericInput(el),
  });

  const def = FIELD_BY_KEY.get(key);
  const suggestion = resolution.candidates[0];

  // Los sensibles no se rellenan solos: un salario mal puesto o un "requiero
  // visa" equivocado queman la aplicacion. Se resuelven igual, para poder
  // mostrar en el popup la cifra que corresponde a *este* formulario.
  if (def?.sensitive && !options.settings.fillSensitive) {
    highlight(el, 'sensitive');
    return { kind: 'skipped', field: { signature, label, key, reason: 'sensitive', suggestion } };
  }

  if (resolution.problem === 'no-currency') {
    highlight(el, 'sensitive');
    return { kind: 'skipped', field: { signature, label, key, reason: 'no-currency' } };
  }

  if (resolution.candidates.length === 0) {
    return { kind: 'skipped', field: { signature, label, key, reason: 'no-value' } };
  }

  if (hasContent(el, group) && !options.settings.overwriteFilled) {
    return { kind: 'skipped', field: { signature, label, key, reason: 'already-filled', suggestion } };
  }

  const result = fill(el, resolution.candidates, group);
  if (!result.ok) {
    highlight(el, 'unmapped');
    return {
      kind: 'skipped',
      field: { signature, label, key, reason: 'no-option', suggestion, options: result.options },
    };
  }

  highlight(el, 'filled');
  return {
    kind: 'filled',
    field: { key, signature, label, value: suggestion ?? '', via: via ?? 'attributes' },
  };
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
  profile: Profile,
  settings: Settings,
): boolean {
  const detected = detectFields(document, { learned: { [signature]: key } });
  const target = detected.find((field) => field.signature === signature);
  if (!target) return false;

  const lang = detectLanguage(document, settings.language);
  const resolution = resolve(key, profile, {
    lang,
    qualifiers: extractQualifiers(target.label),
    numeric: isNumericInput(target.el),
  });
  if (resolution.candidates.length === 0) return false;

  const result = fill(target.el, resolution.candidates, target.group);
  if (!result.ok) return false;

  highlight(target.el, 'filled');
  return true;
}
