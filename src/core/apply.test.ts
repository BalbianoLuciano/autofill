/**
 * Encontrar el boton de enviar y saber si conviene tocarlo.
 *
 * Lo dificil no es clickear: es no clickear el equivocado. En una pagina de
 * empleo hay varios botones que dicen "Apply" y solo uno envia.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { findApplyButton, formOf, missingRequired } from './apply';
import { pickCv } from './cvs';
import { findAnswer, looksLikeOpenQuestion, upsertQuestion } from './questions';
import { formatDate } from './resolve';
import { setRangeValue } from './filler';
import type { CustomQuestion, CvMeta } from '../types';

function render(html: string): void {
  document.body.innerHTML = html;
  for (const node of document.querySelectorAll('button, input, textarea, select, a')) {
    node.getClientRects = () => [{ width: 80, height: 30 }] as unknown as DOMRectList;
  }
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('findApplyButton', () => {
  it('encuentra el boton de enviar en varios idiomas', () => {
    for (const text of ['Submit application', 'Apply', 'Postular', 'Enviar candidatura']) {
      render(`<button>${text}</button>`);
      expect(findApplyButton(document)?.button.textContent).toBe(text);
    }
  });

  it('no confunde "Apply filters" con postularse', () => {
    render(`<button>Apply filters</button>`);
    expect(findApplyButton(document)).toBeNull();
  });

  it('descarta guardar, cancelar y volver', () => {
    render(`
      <button>Save draft</button>
      <button>Cancelar</button>
      <button>Back</button>
    `);
    expect(findApplyButton(document)).toBeNull();
  });

  it('un submit sin texto reconocible no se toca', () => {
    // 40 es el piso: type=submit por si solo tambien lo llevan los botones de
    // "siguiente paso" de un formulario multipaso.
    render(`<button type="submit">Continuar</button>`);
    expect(findApplyButton(document)).toBeNull();
  });

  it('ignora los deshabilitados', () => {
    render(`<button disabled>Apply</button>`);
    expect(findApplyButton(document)).toBeNull();
  });

  it('prefiere el texto exacto sobre el parcial', () => {
    render(`
      <button>Apply to this amazing role today</button>
      <button>Submit application</button>
    `);
    expect(findApplyButton(document)?.label).toBe('submit application');
  });
});

describe('missingRequired', () => {
  it('lista los obligatorios vacios', () => {
    render(`
      <label for="a">Email</label><input id="a" name="email" required>
      <label for="b">Nombre</label><input id="b" name="nombre" required value="Ada">
    `);
    expect(missingRequired(document)).toEqual(['Email']);
  });

  it('un grupo de radios cuenta una sola vez', () => {
    render(`
      <input type="radio" name="visa" value="yes" required>
      <input type="radio" name="visa" value="no" required>
    `);
    expect(missingRequired(document)).toHaveLength(1);
  });

  it('un radio ya marcado no falta', () => {
    render(`
      <input type="radio" name="visa" value="yes" required checked>
      <input type="radio" name="visa" value="no" required>
    `);
    expect(missingRequired(document)).toEqual([]);
  });

  it('un file input vacio cuenta como faltante', () => {
    render(`<label for="cv">CV</label><input type="file" id="cv" name="cv" required>`);
    expect(missingRequired(document)).toEqual(['CV']);
  });
});

describe('formOf', () => {
  it('encuentra el formulario que contiene los campos', () => {
    render(`<form id="f"><input name="a"><input name="b"></form>`);
    const inputs = Array.from(document.querySelectorAll('input'));
    expect(formOf(inputs)?.id).toBe('f');
  });

  it('sin <form>, sube al ancestro que los contiene a todos', () => {
    // Muchos ATS en React no usan <form>.
    render(`<div id="wrap"><div><input name="a"></div><div><input name="b"></div></div>`);
    const inputs = Array.from(document.querySelectorAll('input'));
    expect(formOf(inputs)?.id).toBe('wrap');
  });
});

/* ------------------------- preguntas abiertas ------------------------- */

const QUESTIONS: CustomQuestion[] = [{
  id: '1',
  question: 'Describí brevemente la automatización más compleja que hayas construido',
  answer: 'Una extensión de Chrome…',
  updatedAt: 0,
}];

describe('preguntas propias', () => {
  it('reconoce la misma pregunta escrita distinto', () => {
    expect(findAnswer(
      'Describí brevemente la automatización más compleja que hayas construido *',
      QUESTIONS,
    )?.id).toBe('1');
  });

  it('no contesta una pregunta con la respuesta de otra', () => {
    // Peor que dejarla vacia: se envia igual y nadie lo nota.
    expect(findAnswer('¿Por qué querés trabajar acá?', QUESTIONS)).toBeNull();
  });

  it('actualiza en vez de duplicar', () => {
    const next = upsertQuestion(QUESTIONS, QUESTIONS[0]!.question, 'Otra respuesta');
    expect(next).toHaveLength(1);
    expect(next[0]!.answer).toBe('Otra respuesta');
  });

  it('un textarea es pregunta abierta; un input corto no', () => {
    render(`<textarea></textarea><input type="text">`);
    const textarea = document.querySelector('textarea')!;
    const input = document.querySelector('input')!;

    expect(looksLikeOpenQuestion(textarea, 'Contanos algo')).toBe(true);
    expect(looksLikeOpenQuestion(input, 'Ciudad')).toBe(false);
    expect(looksLikeOpenQuestion(input, '¿Por qué te interesa el puesto?')).toBe(true);
  });
});

/* ------------------------------- CVs ------------------------------- */

const CVS: CvMeta[] = [
  { id: 'a', filename: 'ai-es.pdf', label: 'AI ES', lang: 'es', role: 'ai', mime: 'application/pdf', size: 1 },
  { id: 'b', filename: 'ai-en.pdf', label: 'AI EN', lang: 'en', role: 'ai', mime: 'application/pdf', size: 1 },
  { id: 'c', filename: 'lead-en.pdf', label: 'Lead EN', lang: 'en', role: 'lead', mime: 'application/pdf', size: 1 },
];

describe('pickCv', () => {
  it('elige por idioma del formulario', () => {
    expect(pickCv(CVS, 'es', 'AI Engineer')?.id).toBe('a');
    expect(pickCv(CVS, 'en', 'AI Engineer')?.id).toBe('b');
  });

  it('detecta que el puesto es de liderazgo', () => {
    expect(pickCv(CVS, 'en', 'Engineering Team Lead')?.id).toBe('c');
    expect(pickCv(CVS, 'en', 'Senior Engineering Manager')?.id).toBe('c');
  });

  it('el elegido a mano le gana a la deteccion', () => {
    expect(pickCv(CVS, 'en', 'AI Engineer', 'c')?.id).toBe('c');
  });
});

/* --------------------------- tipos de input --------------------------- */

describe('fechas', () => {
  it('formatea segun el tipo del input', () => {
    const base = new Date('2026-08-31T12:00:00');
    expect(formatDate(0, 'date', base)).toBe('2026-08-31');
    expect(formatDate(0, 'month', base)).toBe('2026-08');
    // Un type="date" descarta en silencio cualquier cosa que no sea ISO.
    expect(formatDate(14, 'date', base)).toBe('2026-09-14');
  });
});

describe('setRangeValue', () => {
  it('acota la pretension al rango del slider', () => {
    render(`<input type="range" min="1000" max="5000" step="500">`);
    const input = document.querySelector<HTMLInputElement>('input')!;

    setRangeValue(input, ['9000']);
    expect(input.value).toBe('5000');

    setRangeValue(input, ['2600']);
    expect(input.value).toBe('2500');
  });
});
