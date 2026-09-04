/**
 * Que quedo sin contestar.
 *
 * Rellenar bien no alcanza: lo que arruina una aplicacion es mandarla con un
 * obligatorio en blanco y enterarse por un error rojo despues del submit. Los
 * de opcion multiple son los peores, porque un radio sin marcar no se ve vacio
 * como se ve un input de texto: se ve igual que antes de mirarlo.
 *
 * Esto corre despues del relleno y devuelve lo que todavia falta.
 */

import { detectFields, isChoiceGroup, type Fillable } from './matcher';
import { highlight } from './filler';
import type { FieldSignature } from '../types';

export type ControlKind = 'text' | 'select' | 'radio' | 'checkbox';

export interface Unanswered {
  signature: FieldSignature;
  label: string;
  kind: ControlKind;
  /** Lo que se puede elegir, para resolverlo desde el popup sin ir al form. */
  options: string[];
}

/** Textos que una opcion usa para decir "todavia no elegiste". */
const PLACEHOLDERS = [
  'select', 'choose', 'pick', 'elegi', 'elegí', 'elige', 'selecciona',
  'seleccioná', 'seleccione', 'ninguno', 'none', 'sin especificar', '--',
];

export function findUnanswered(root: Document | ShadowRoot): Unanswered[] {
  const pendientes: Unanswered[] = [];
  const vistos = new Set<FieldSignature>();

  for (const field of detectFields(root, { learned: {} })) {
    if (vistos.has(field.signature)) continue;
    vistos.add(field.signature);

    const grupo = field.group ?? [];
    if (!isRequired(field.el, grupo)) continue;
    if (!isEmpty(field.el, grupo)) continue;

    const kind = kindOfControl(field.el);
    highlight(field.el, 'unmapped');

    pendientes.push({
      signature: field.signature,
      label: field.label,
      kind,
      options: optionsOf(field.el, grupo),
    });
  }

  return pendientes;
}

/**
 * Obligatorio segun el DOM o segun lo que ve la persona.
 *
 * El atributo `required` es lo confiable, pero muchos formularios validan en
 * JavaScript y solo marcan la pregunta con un asterisco. Si la etiqueta dice
 * que es obligatorio, lo es, aunque el HTML no lo diga.
 */
function isRequired(el: Fillable, grupo: HTMLInputElement[]): boolean {
  const nodos: Element[] = grupo.length > 0 ? grupo : [el];
  if (nodos.some((n) => (n as HTMLInputElement).required)) return true;
  if (nodos.some((n) => n.getAttribute('aria-required') === 'true')) return true;

  const texto = etiquetaVisible(el);
  return /\*/.test(texto) || /\b(obligatorio|requerido|required)\b/i.test(texto);
}

/**
 * El texto que rodea al control, donde vive el asterisco.
 *
 * El fieldset se busca aparte y no en la misma lista que `label`: en
 * `<label><input type="radio"> Si</label>` el `closest` se queda en ese label,
 * devuelve "Si" y nunca llega a la pregunta, que es donde esta el asterisco.
 *
 * Tampoco se mira el div contenedor: en un formulario denso un solo campo
 * obligatorio marcaria como obligatorios a todos sus vecinos.
 */
function etiquetaVisible(el: Fillable): string {
  const propio = (el as HTMLInputElement).labels?.[0]?.textContent ?? '';
  const grupo = el.closest('fieldset, [role="group"], [role="radiogroup"]');
  const legend = grupo?.querySelector('legend')?.textContent ?? '';
  return `${propio} ${legend}`.trim();
}

function isEmpty(el: Fillable, grupo: HTMLInputElement[]): boolean {
  if (isChoiceGroup(el)) {
    const nodos = grupo.length > 0 ? grupo : [el as HTMLInputElement];
    return !nodos.some((n) => n.checked);
  }

  if (el instanceof HTMLSelectElement) {
    if (el.value === '') return true;
    // Un select puede tener seleccionado un "Elegí una opción" con value.
    const texto = el.selectedOptions[0]?.text.trim().toLowerCase() ?? '';
    return PLACEHOLDERS.some((p) => texto.startsWith(p));
  }

  return el.value.trim() === '';
}

function kindOfControl(el: Fillable): ControlKind {
  if (el instanceof HTMLSelectElement) return 'select';
  if (el instanceof HTMLInputElement && el.type === 'radio') return 'radio';
  if (el instanceof HTMLInputElement && el.type === 'checkbox') return 'checkbox';
  return 'text';
}

function optionsOf(el: Fillable, grupo: HTMLInputElement[]): string[] {
  if (el instanceof HTMLSelectElement) {
    return Array.from(el.options)
      .filter((o) => o.value !== '' && !o.disabled)
      .map((o) => o.text.trim());
  }
  if (isChoiceGroup(el)) {
    const nodos = grupo.length > 0 ? grupo : [el as HTMLInputElement];
    return nodos.map((n) => n.labels?.[0]?.textContent?.trim() || n.value);
  }
  return [];
}
