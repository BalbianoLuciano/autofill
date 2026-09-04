/**
 * Relleno.
 *
 * Lo mas importante del proyecto esta en `setValue`: los inputs controlados
 * por React ignoran `element.value = x`. React guarda el ultimo valor que el
 * mismo escribio en una propiedad interna del nodo, ve que `value` coincide,
 * y descarta el evento como si no hubiera pasado nada. El campo se ve lleno y
 * el formulario se envia vacio. Greenhouse, Lever y Ashby son todos React.
 *
 * La salida es llamar al setter nativo del prototipo, que escribe el valor sin
 * pasar por el descriptor que React instalo en la instancia.
 */

import { similarity } from './normalize';
import type { Fillable } from './matcher';

/** Se le pone a los campos completados y a los sensibles, para que se vean. */
export const HIGHLIGHT_ATTR = 'data-autofill';

/**
 * Escribe un valor de forma que React, Vue y Svelte lo registren.
 */
export function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;

  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;

  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Elige la opcion de un `<select>` que mejor se parece al valor.
 *
 * Si ninguna llega al umbral, no toca nada y devuelve las opciones para que el
 * popup las muestre: mejor dejarlo vacio que elegir el pais equivocado.
 */
export function setSelectValue(
  el: HTMLSelectElement,
  candidates: string[],
): { ok: true } | { ok: false; options: string[] } {
  const options = Array.from(el.options).filter((o) => o.value !== '' && !o.disabled);

  // Se prueban todos los candidatos contra todas las opciones. El perfil
  // guarda un codigo, no una etiqueta, asi que "b2" tambien tiene que poder
  // encontrar "B2 - Upper intermediate" y "Professional working proficiency".
  let best: { option: HTMLOptionElement; score: number } | null = null;
  for (const option of options) {
    for (const value of candidates) {
      const score = Math.max(similarity(option.text, value), similarity(option.value, value));
      if (best === null || score > best.score) best = { option, score };
    }
  }

  if (!best || best.score < 0.72) {
    return { ok: false, options: options.map((o) => o.text.trim()) };
  }

  el.value = best.option.value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true };
}

/** Lo mismo para un grupo de radios: marca el que mejor se parece al valor. */
export function setRadioValue(
  group: HTMLInputElement[],
  candidates: string[],
): { ok: true } | { ok: false; options: string[] } {
  const labelled = group.map((input) => ({ input, text: radioLabel(input) }));

  let best: { input: HTMLInputElement; score: number } | null = null;
  for (const { input, text } of labelled) {
    for (const value of candidates) {
      const score = Math.max(similarity(text, value), similarity(input.value, value));
      if (best === null || score > best.score) best = { input, score };
    }
  }

  if (!best || best.score < 0.72) {
    return { ok: false, options: labelled.map((l) => l.text) };
  }

  best.input.checked = true;
  best.input.dispatchEvent(new Event('click', { bubbles: true }));
  best.input.dispatchEvent(new Event('input', { bubbles: true }));
  best.input.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true };
}

/** Palabras que en un checkbox suelto significan "marcalo" o "dejalo vacio". */
const AFIRMA = ['si', 'yes', 'true', 'ja', 'oui', 'sim', 'acepto', 'agree', 'accept'];
const NIEGA = ['no', 'false', 'nein', 'non', 'nao'];

/**
 * Un grupo de checkboxes.
 *
 * Se separa de los radios por una razon concreta: un radio no se puede
 * desmarcar clickeandolo, asi que volver a clickearlo es inocuo. Un checkbox
 * si, y escribir `checked = true` y despues despachar un `click` lo deja
 * apagado. Por eso se compara contra el estado actual y se usa `.click()`
 * nativo, que dispara la cadena entera de eventos como si fuera una persona.
 */
export function setCheckboxValue(
  group: HTMLInputElement[],
  candidates: string[],
): { ok: true } | { ok: false; options: string[] } {
  const labelled = group.map((input) => ({ input, text: radioLabel(input) }));

  // Un checkbox solo es una pregunta de si o no: no hay opcion que elegir,
  // hay un estado que decidir.
  if (group.length === 1) {
    const solo = group[0]!;
    const dicho = candidates.map((c) => c.trim().toLowerCase());
    const quiere = dicho.some((c) => AFIRMA.includes(c))
      ? true
      : dicho.some((c) => NIEGA.includes(c))
        ? false
        : null;

    if (quiere === null) return { ok: false, options: [labelled[0]!.text] };
    if (solo.checked !== quiere) solo.click();
    return { ok: true };
  }

  let best: { input: HTMLInputElement; score: number } | null = null;
  for (const { input, text } of labelled) {
    for (const value of candidates) {
      const score = Math.max(similarity(text, value), similarity(input.value, value));
      if (best === null || score > best.score) best = { input, score };
    }
  }

  if (!best || best.score < 0.72) {
    return { ok: false, options: labelled.map((l) => l.text) };
  }

  if (!best.input.checked) best.input.click();
  return { ok: true };
}

function radioLabel(input: HTMLInputElement): string {
  const own = input.labels?.[0]?.textContent ?? input.getAttribute('aria-label') ?? '';
  return own.trim() || input.value;
}

/**
 * Rellena cualquier control. Devuelve por que no pudo, si no pudo.
 */
/**
 * Un slider de salario. Se acota la pretension al rango que el formulario
 * admite y se respeta el paso: un `range` fuera de rango se recorta solo, y
 * uno con un valor intermedio al `step` se redondea sin avisar.
 */
export function setRangeValue(
  el: HTMLInputElement,
  candidates: string[],
): { ok: true } | { ok: false; options: string[] } {
  const wanted = candidates.map((c) => Number(c.replace(/[^\d.-]/g, ''))).find(Number.isFinite);
  if (wanted === undefined) return { ok: false, options: [] };

  const min = Number(el.min || 0);
  const max = Number(el.max || 100);
  const step = Number(el.step || 1) || 1;

  const clamped = Math.min(max, Math.max(min, wanted));
  const stepped = min + Math.round((clamped - min) / step) * step;

  setValue(el, String(Math.min(max, Math.max(min, stepped))));
  return { ok: true };
}

export function fill(
  el: Fillable,
  candidates: string[],
  group?: HTMLInputElement[],
): { ok: true } | { ok: false; options: string[] } {
  if (candidates.length === 0) return { ok: false, options: [] };
  if (el instanceof HTMLSelectElement) return setSelectValue(el, candidates);
  if (el instanceof HTMLInputElement && el.type === 'range') return setRangeValue(el, candidates);
  if (el instanceof HTMLInputElement && el.type === 'checkbox') {
    return setCheckboxValue(group && group.length > 0 ? group : [el], candidates);
  }
  if (group && group.length > 0) return setRadioValue(group, candidates);
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    // En un input de texto va el primer candidato: los demas existen para
    // elegir entre opciones ya escritas, no para escribirse.
    setValue(el, candidates[0]!);
    return { ok: true };
  }
  return { ok: false, options: [] };
}

/** true si el input solo acepta numeros. Decide si el salario lleva unidades. */
export function isNumericInput(el: Fillable): boolean {
  if (!(el instanceof HTMLInputElement)) return false;
  if (el.type === 'number' || el.type === 'range') return true;
  return /^(numeric|decimal)$/.test(el.inputMode ?? '');
}

/* --------------------------------- resaltado --------------------------------- */

const STYLE_ID = 'autofill-styles';

const STYLES = `
[${HIGHLIGHT_ATTR}="filled"] {
  outline: 2px solid #4ade80 !important;
  outline-offset: 1px !important;
  transition: outline-color .4s ease;
}
[${HIGHLIGHT_ATTR}="sensitive"] {
  outline: 2px dashed #fb923c !important;
  outline-offset: 1px !important;
}
[${HIGHLIGHT_ATTR}="unmapped"] {
  outline: 2px dotted #94a3b8 !important;
  outline-offset: 1px !important;
}
`;

export function ensureStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLES;
  (doc.head ?? doc.documentElement).append(style);
}

export function highlight(
  el: Element,
  kind: 'filled' | 'sensitive' | 'unmapped',
): void {
  ensureStyles(el.ownerDocument);
  el.setAttribute(HIGHLIGHT_ATTR, kind);
}

export function clearHighlights(root: Document | ShadowRoot): void {
  root.querySelectorAll(`[${HIGHLIGHT_ATTR}]`).forEach((el) => {
    el.removeAttribute(HIGHLIGHT_ATTR);
  });
}

/** Lleva el primer campo sensible a la vista, que es lo que hay que revisar. */
export function scrollToFirst(elements: Element[]): void {
  elements[0]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
