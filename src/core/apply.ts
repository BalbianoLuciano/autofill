/**
 * Encontrar el boton de enviar, y saber si conviene tocarlo.
 *
 * Lo dificil no es clickear: es no clickear el equivocado. En una pagina de
 * empleo hay varios botones que dicen "Apply" y solo uno envia la aplicacion;
 * los otros abren el formulario, filtran una lista o guardan un borrador.
 *
 * Por eso la busqueda es siempre **dentro del formulario que rellenamos**, y
 * el texto se usa como confirmacion, no como criterio principal.
 */

import { normalize } from './normalize';

/** Como se llama el boton de enviar, en los idiomas que aparecen. */
const APPLY_WORDS = [
  'apply', 'apply now', 'submit', 'submit application', 'send application',
  'send', 'submit my application', 'finish', 'complete application',
  'postular', 'postularme', 'postular ahora', 'aplicar', 'enviar',
  'enviar solicitud', 'enviar candidatura', 'enviar postulacion',
  'inscribirse', 'solicitar', 'candidatarme', 'finalizar',
  'candidatar', 'enviar aplicacao', 'candidatura',
  'postuler', 'envoyer', 'bewerben', 'absenden',
];

/**
 * Botones que dicen algo parecido pero hacen otra cosa. Se descartan antes de
 * mirar nada mas: un "Apply filters" clickeado a destiempo no rompe nada, pero
 * un "Save draft" tomado por enviar hace que la aplicacion nunca salga.
 */
const DECOYS = [
  'apply filters', 'apply filter', 'save', 'save draft', 'save for later',
  'cancel', 'back', 'previous', 'reset', 'clear', 'search', 'sign in',
  'log in', 'register', 'upload', 'add', 'guardar', 'cancelar', 'volver',
  'atras', 'limpiar', 'buscar', 'iniciar sesion', 'registrarse', 'subir',
];

export interface ApplyTarget {
  button: HTMLElement;
  label: string;
}

/** El formulario que contiene los campos que rellenamos. */
export function formOf(filled: Element[]): HTMLElement | null {
  if (filled.length === 0) return null;

  const form = filled[0]!.closest('form');
  if (form) return form;

  // Muchos ATS en React no usan <form>. Se sube hasta el ancestro que
  // contenga a todos los campos que tocamos.
  let node: HTMLElement | null = filled[0]!.parentElement;
  while (node && !filled.every((el) => node!.contains(el))) node = node.parentElement;
  return node;
}

function textOf(el: Element): string {
  const label = el.getAttribute('aria-label') ?? '';
  const value = el instanceof HTMLInputElement ? el.value : '';
  return normalize(`${el.textContent ?? ''} ${label} ${value}`);
}

/** El boton que envia el formulario, si se puede identificar con confianza. */
export function findApplyButton(scope: HTMLElement | Document): ApplyTarget | null {
  const candidates = Array.from(
    scope.querySelectorAll<HTMLElement>(
      'button, input[type="submit"], [role="button"], a[href="#"]',
    ),
  ).filter(isClickable);

  let best: { el: HTMLElement; text: string; score: number } | null = null;

  for (const el of candidates) {
    const text = textOf(el);
    if (!text || DECOYS.some((decoy) => text === decoy || text.startsWith(`${decoy} `))) continue;

    let score = 0;
    if (APPLY_WORDS.includes(text)) score = 100;
    else if (APPLY_WORDS.some((word) => text.startsWith(`${word} `) || text.endsWith(` ${word}`))) score = 70;
    // `type="submit"` dentro del formulario es buena senal por si sola, pero
    // no alcanza: tambien lo llevan los botones de "siguiente paso".
    else if (isSubmit(el)) score = 40;

    if (score > 0 && (best === null || score > best.score)) best = { el, text, score };
  }

  // 40 es el piso: un submit sin texto reconocible no se toca.
  return best && best.score > 40 ? { button: best.el, label: best.text } : null;
}

function isSubmit(el: Element): boolean {
  return (
    (el instanceof HTMLButtonElement && el.type === 'submit') ||
    (el instanceof HTMLInputElement && el.type === 'submit')
  );
}

function isClickable(el: HTMLElement): boolean {
  if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;
  return el.getClientRects().length > 0;
}

/* ------------------------------ completitud ------------------------------ */

/**
 * Los campos obligatorios que siguen vacios.
 *
 * Es el chequeo mas importante del envio automatico y tambien el mas fragil:
 * solo ve lo que el formulario declara obligatorio. Validaciones propias,
 * pasos que todavia no se renderizaron y campos fuera de este contenedor no
 * aparecen aca.
 */
export function missingRequired(scope: HTMLElement | Document): string[] {
  const required = Array.from(
    scope.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      '[required], [aria-required="true"]',
    ),
  );

  const missing: string[] = [];
  const seenRadios = new Set<string>();

  for (const el of required) {
    if (el.disabled || el.getClientRects().length === 0) continue;

    if (el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox')) {
      const name = el.name || el.id;
      if (seenRadios.has(name)) continue;
      seenRadios.add(name);
      const group = Array.from(
        (el.getRootNode() as Document).querySelectorAll<HTMLInputElement>(
          `input[name="${CSS.escape(name)}"]`,
        ),
      );
      if (!group.some((input) => input.checked)) missing.push(describe(el));
      continue;
    }

    if (el instanceof HTMLInputElement && el.type === 'file') {
      if (!el.files || el.files.length === 0) missing.push(describe(el));
      continue;
    }

    if (!el.value.trim()) missing.push(describe(el));
  }

  return missing;
}

function describe(el: Element): string {
  const labels = (el as HTMLInputElement).labels;
  const text = labels?.[0]?.textContent?.trim();
  return text || el.getAttribute('name') || el.getAttribute('id') || 'campo sin etiqueta';
}
