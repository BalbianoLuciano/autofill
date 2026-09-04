/**
 * El motor: corre dentro de la pagina, junta los campos, los rellena, adjunta
 * el CV y —si esta habilitado— arma el envio.
 *
 * No decide que significa cada dato: eso es `resolve`. Lo que decide son las
 * politicas —que es sensible, que no se pisa, cuando conviene enviar— y son
 * todas visibles en `applyTo` y en `orchestrateApply`.
 */

import { FIELD_BY_KEY, type FieldKey } from './fields';
import { detectFields, type DetectedField } from './matcher';
import { clearHighlights, fill, highlight, isNumericInput, scrollToFirst } from './filler';
import { findUnanswered } from './audit';
import { detectLanguage, extractQualifiers } from './context';
import { resolve } from './resolve';
import { findAnswer, looksLikeOpenQuestion, optionsOf } from './questions';
import { attachCv, findCvInputs } from './cvs';
import { findApplyButton, formOf, missingRequired } from './apply';
import { showCountdown, showNotice, showQuestions, type PendingQuestion } from './overlay';
import { getQuestions, rememberAnswer } from './storage';
import type {
  ApplyOutcome, CustomQuestion, CvBlob, CvMeta, FieldSignature, FillReport,
  FilledField, Lang, Profile, Settings, SkippedField,
} from '../types';

export interface RunOptions {
  profile: Profile;
  mappings: Record<FieldSignature, FieldKey>;
  settings: Settings;
  questions: CustomQuestion[];
  cv?: (CvMeta & CvBlob) | null;
}

export function runFill(options: RunOptions): FillReport {
  clearHighlights(document);

  const lang = detectLanguage(document, options.settings.language);
  const detected = detectFields(document, { learned: options.mappings });

  const filled: FilledField[] = [];
  const skipped: SkippedField[] = [];
  const touched: Element[] = [];
  const seenSignatures = new Set<FieldSignature>();
  const sensitive: Element[] = [];
  const pending: PendingQuestion[] = [];

  for (const field of detected) {
    if (seenSignatures.has(field.signature)) continue;
    seenSignatures.add(field.signature);

    const outcome = applyTo(field, options, lang);
    touched.push(field.el);

    if (outcome.kind === 'filled') filled.push(outcome.field);
    else if (outcome.kind === 'skipped') {
      skipped.push(outcome.field);
      if (outcome.field.reason === 'sensitive') sensitive.push(field.el);
      // Tanto una pregunta abierta como un campo cuyas opciones no coincidieron
      // terminan igual: hay que elegir a mano una vez y despues se reusa.
      if (outcome.field.reason === 'needs-answer' || outcome.field.reason === 'no-option') {
        pending.push({
          signature: outcome.field.signature,
          label: outcome.field.label,
          options: outcome.field.options,
        });
      }
    }
  }

  const cvAttached = options.settings.attachCv ? attachCvTo(document, options.cv) : undefined;
  const apply = orchestrateApply(options, touched, pending, lang);

  // Despues de rellenar, no antes: lo que importa es lo que quedo vacio
  // cuando el relleno ya hizo todo lo que podia.
  const unanswered = findUnanswered(document);

  if (pending.length === 0) scrollToFirst(sensitive);

  return { hostname: location.hostname, lang, filled, skipped, cvAttached, unanswered, apply };
}

/* --------------------------------- campos --------------------------------- */

type Outcome =
  | { kind: 'filled'; field: FilledField }
  | { kind: 'skipped'; field: SkippedField }
  | { kind: 'ignored' };

function applyTo(field: DetectedField, options: RunOptions, lang: Lang): Outcome {
  const { el, group, signature, label, key, via } = field;

  // Sin campo del diccionario, todavia puede ser una pregunta abierta que ya
  // contestamos alguna vez en otro formulario.
  if (key === null) return applyOpenQuestion(field, options);

  const qualifiers = extractQualifiers(`${label} ${el.getAttribute('placeholder') ?? ''}`);
  const text = `${label} ${el.getAttribute('placeholder') ?? ''}`;
  const resolution = resolve(key, options.profile, {
    lang,
    qualifiers,
    text,
    numeric: isNumericInput(el),
    inputType: el instanceof HTMLInputElement ? el.type : undefined,
  });

  const def = FIELD_BY_KEY.get(key);
  const suggestion = resolution.candidates[0];

  if (def?.sensitive && !options.settings.fillSensitive) {
    highlight(el, 'sensitive');
    return { kind: 'skipped', field: { signature, label, key, reason: 'sensitive', suggestion } };
  }

  if (resolution.problem === 'no-currency') {
    highlight(el, 'sensitive');
    return { kind: 'skipped', field: { signature, label, key, reason: 'no-currency' } };
  }

  // La pregunta es por una tecnologia puntual que no esta en el perfil. Antes
  // esto contestaba el total general, que es afirmar una experiencia que no
  // tenes; ahora se reporta para que la agregues vos.
  if (resolution.problem === 'unlisted-skill') {
    highlight(el, 'unmapped');
    return {
      kind: 'skipped',
      field: { signature, label, key, reason: 'unlisted-skill', skill: resolution.skill },
    };
  }

  if (resolution.candidates.length === 0) {
    return { kind: 'skipped', field: { signature, label, key, reason: 'no-value' } };
  }

  if (hasContent(el, group) && !options.settings.overwriteFilled) {
    return { kind: 'skipped', field: { signature, label, key, reason: 'already-filled', suggestion } };
  }

  const result = fill(el, resolution.candidates, group);
  if (!result.ok) {
    // El perfil dice C1 pero este formulario ofrece "Avanzado - lo uso
    // conversacionalmente": ningun sinonimo va a cubrir todas las escalas que
    // inventa cada empresa. Si ya elegiste una vez para esta pregunta, se
    // reusa esa eleccion.
    const known = findAnswer(label, options.questions);
    if (known) {
      const retry = fill(el, [known.answer], group);
      if (retry.ok) {
        highlight(el, 'filled');
        return {
          kind: 'filled',
          field: { key, signature, label, value: known.answer, via: 'learned' },
        };
      }
    }

    highlight(el, 'unmapped');
    return {
      kind: 'skipped',
      field: { signature, label, key, reason: 'no-option', suggestion, options: result.options },
    };
  }

  highlight(el, 'filled');
  return {
    kind: 'filled',
    field: {
      key, signature, label, value: suggestion ?? '',
      skill: resolution.skill, via: via ?? 'attributes',
    },
  };
}

/**
 * Un campo que el diccionario no cubre.
 *
 * Si parece una pregunta abierta se busca entre las que ya contestamos. Si no
 * hay respuesta guardada, se marca para que la persona la escriba en el
 * overlay, y desde ahi queda guardada para la proxima.
 */
function applyOpenQuestion(field: DetectedField, options: RunOptions): Outcome {
  const { el, group, signature, label } = field;
  const choices = optionsOf(el, group);

  if (!looksLikeOpenQuestion(el, label, choices.length > 0)) {
    highlight(el, 'unmapped');
    return { kind: 'skipped', field: { signature, label, reason: 'unmapped' } };
  }

  const known = findAnswer(label, options.questions);
  if (known) {
    if (hasContent(el, group) && !options.settings.overwriteFilled) {
      return { kind: 'skipped', field: { signature, label, reason: 'already-filled' } };
    }
    const result = fill(el, [known.answer], group);
    if (result.ok) {
      highlight(el, 'filled');
      return {
        kind: 'filled',
        field: { key: 'coverLetter', signature, label, value: known.answer, via: 'learned' },
      };
    }
  }

  highlight(el, 'unmapped');
  return {
    kind: 'skipped',
    field: { signature, label, reason: 'needs-answer', options: choices },
  };
}

function hasContent(el: DetectedField['el'], group?: HTMLInputElement[]): boolean {
  if (group && group.length > 0) return group.some((input) => input.checked);
  if (el instanceof HTMLSelectElement) return el.value !== '' && el.selectedIndex > 0;
  return el.value.trim() !== '';
}

/* ----------------------------------- CV ----------------------------------- */

function attachCvTo(root: Document, cv: RunOptions['cv']): string | undefined {
  if (!cv) return undefined;

  for (const input of findCvInputs(root)) {
    if (input.files && input.files.length > 0) return cv.filename;
    if (attachCv(input, cv)) {
      highlight(input, 'filled');
      return cv.filename;
    }
  }
  return undefined;
}

/* --------------------------------- envio --------------------------------- */

/**
 * Decide si corresponde enviar, y arma la cuenta regresiva.
 *
 * Tres condiciones, todas necesarias: el ajuste prendido, nada obligatorio
 * vacio y un boton identificable dentro del formulario que rellenamos. Si
 * falta cualquiera, se avisa y no se toca nada.
 */
function orchestrateApply(
  options: RunOptions,
  touched: Element[],
  pending: PendingQuestion[],
  lang: Lang,
): ApplyOutcome {
  // Las preguntas sin responder van primero: enviar sin contestarlas seria
  // mandar la aplicacion incompleta.
  if (pending.length > 0) {
    const hostname = location.hostname;
    showQuestions(
      pending,
      (signature, label, answer) => {
        // Se guarda y se escribe en el acto: si el formulario se pierde, la
        // respuesta ya quedo para la proxima vez.
        void rememberAnswer(label, answer, hostname);
        applyAnswer(signature, answer);
      },
      () => {
        // Al cerrar se vuelve a correr con las respuestas ya guardadas, y
        // desde ahi el envio sigue su curso normal.
        void getQuestions().then((questions) => runFill({ ...options, questions }));
      },
    );
    return { status: 'incomplete', missing: pending.map((p) => p.label) };
  }

  if (!options.settings.autoApply) return { status: 'off' };

  const scope = formOf(touched) ?? document.body;
  const missing = missingRequired(scope);
  if (missing.length > 0) {
    showNotice(
      lang === 'es' ? 'No se envió' : 'Not submitted',
      lang === 'es'
        ? `Faltan campos obligatorios: ${missing.slice(0, 4).join(', ')}.`
        : `Required fields are still empty: ${missing.slice(0, 4).join(', ')}.`,
    );
    return { status: 'incomplete', missing };
  }

  const target = findApplyButton(scope);
  if (!target) {
    showNotice(
      lang === 'es' ? 'No se envió' : 'Not submitted',
      lang === 'es'
        ? 'Está todo completo, pero no se pudo identificar el botón de enviar con confianza.'
        : 'Everything is filled, but the submit button could not be identified with confidence.',
    );
    return { status: 'no-button' };
  }

  showCountdown(options.settings.autoApplyDelay, target.label, () => target.button.click());
  return { status: 'armed', label: target.label };
}

/* ------------------------------- aprendizaje ------------------------------- */

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
    inputType: target.el instanceof HTMLInputElement ? target.el.type : undefined,
  });
  if (resolution.candidates.length === 0) return false;

  const result = fill(target.el, resolution.candidates, target.group);
  if (!result.ok) return false;

  highlight(target.el, 'filled');
  return true;
}

/** Escribe en la pagina la respuesta que se acaba de tipear en el overlay. */
export function applyAnswer(signature: FieldSignature, answer: string): boolean {
  const target = detectFields(document, { learned: {} }).find(
    (field) => field.signature === signature,
  );
  if (!target) return false;

  const result = fill(target.el, [answer], target.group);
  if (result.ok) highlight(target.el, 'filled');
  return result.ok;
}
