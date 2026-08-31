/**
 * Un formulario real, de los que rompen.
 *
 * Estructura tomada de una oferta en Teamtailor (careers.humand.co): preguntas
 * propias en grupos de radios, una escala de ingles inventada por la empresa y
 * el salario como slider. Los tres casos que fallaron la primera vez.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { runFill } from './engine';
import { findApplyButton, missingRequired } from './apply';
import type { CustomQuestion, Profile, Settings } from '../types';

const PROFILE: Profile = {
  firstName: { kind: 'text', es: 'Luciano' },
  lastName: { kind: 'text', es: 'Balbiano' },
  englishLevel: { kind: 'choice', code: 'b2' },
  salaryExpectation: {
    kind: 'salary',
    hoursPerMonth: 160,
    entries: [{ amount: 2500, currency: 'USD', period: 'month' }],
  },
};

const SETTINGS: Settings = {
  fillSensitive: false,
  overwriteFilled: false,
  language: 'auto',
  autoApply: false,
  autoApplyDelay: 5,
  attachCv: false,
};

/** El formulario, con la misma forma que el real. */
const FORM = `
<form>
  <fieldset>
    <legend>¿Tenés experiencia integrando APIs de LLMs (Claude, OpenAI) en flujos de trabajo reales?*</legend>
    <label><input type="radio" name="candidate[answers_attributes][1][boolean]" value="1"> Sí</label>
    <label><input type="radio" name="candidate[answers_attributes][1][boolean]" value="0"> No</label>
  </fieldset>

  <fieldset>
    <legend>¿Cuál es tu nivel de inglés?*</legend>
    <label><input type="radio" name="candidate[answers_attributes][3][choice]" value="1"> Básico - inicial</label>
    <label><input type="radio" name="candidate[answers_attributes][3][choice]" value="2"> Intermedio - me siento con comodidad para leer y escribir pero no a nivel conversacional</label>
    <label><input type="radio" name="candidate[answers_attributes][3][choice]" value="3"> Avanzado - Lo uso conversacionalmente o he trabajado en inglés</label>
    <label><input type="radio" name="candidate[answers_attributes][3][choice]" value="4"> Bilingüe</label>
  </fieldset>

  <label for="sal">¿Cuál es tu expectativa salarial mensual (contemplando compensación total por mes) en USD?*</label>
  <input type="range" id="sal" name="candidate[answers_attributes][4][range]" min="100" max="7000" required>

  <label for="fn">Nombre*</label>
  <input type="text" id="fn" name="candidate[first_name]">

  <label for="cv">Subir currículum*</label>
  <input type="file" id="cv" name="cv" accept=".doc,.docx,.pdf" required>

  <input type="submit" name="commit" value="Enviar solicitud">
</form>`;

function render(html: string): void {
  document.documentElement.setAttribute('lang', 'es');
  document.body.innerHTML = html;
  for (const node of document.querySelectorAll('input, textarea, select, button')) {
    node.getClientRects = () => [{ width: 100, height: 24 }] as unknown as DOMRectList;
  }
}

const run = (settings: Partial<Settings> = {}, questions: CustomQuestion[] = []) =>
  runFill({ profile: PROFILE, mappings: {}, questions, settings: { ...SETTINGS, ...settings } });

const bySignature = (list: { signature: string }[], fragment: string) =>
  list.find((s) => s.signature.includes(fragment));

beforeEach(() => {
  document.body.innerHTML = '';
  render(FORM);
});

describe('el slider de salario', () => {
  it('lo reconoce y resuelve la cifra, aunque no lo toque', () => {
    // Es sensible: se resuelve para mostrarlo, pero no se escribe.
    const skip = bySignature(run().skipped, '[4][range]');
    expect(skip?.key).toBe('salaryExpectation');
    expect(skip?.reason).toBe('sensitive');
    expect(skip?.suggestion).toBe('2500');
  });

  it('lo completa cuando se habilitan los sensibles, acotado al rango', () => {
    run({ fillSensitive: true });
    expect(document.querySelector<HTMLInputElement>('#sal')!.value).toBe('2500');
  });
});

describe('las preguntas en grupos de radios', () => {
  it('una pregunta propia queda para contestar, con sus opciones', () => {
    // No es ningun dato del perfil, pero se contesta una vez y se reusa.
    const skip = bySignature(run().skipped, '[1][boolean]');
    expect(skip?.reason).toBe('needs-answer');
    expect(skip?.options).toEqual(['Sí', 'No']);
  });

  it('reusa la respuesta guardada la proxima vez', () => {
    const guardada: CustomQuestion[] = [{
      id: '1',
      question: '¿Tenés experiencia integrando APIs de LLMs (Claude, OpenAI) en flujos de trabajo reales?',
      answer: 'Sí',
      updatedAt: 0,
    }];

    const report = run({}, guardada);

    expect(document.querySelector<HTMLInputElement>('[value="1"]')!.checked).toBe(true);
    expect(bySignature(report.skipped, '[1][boolean]')).toBeUndefined();
  });
});

describe('la escala de ingles propia de la empresa', () => {
  it('reconoce el campo pero avisa que ninguna opcion coincide', () => {
    // El perfil dice B2 y la empresa ofrece "Intermedio - leer y escribir pero
    // no conversacional". Ningun sinonimo cubre todas las escalas inventadas.
    const skip = bySignature(run().skipped, '[3][choice]');
    expect(skip?.key).toBe('englishLevel');
    expect(skip?.reason).toBe('no-option');
    expect(skip?.options).toHaveLength(4);
  });

  it('usa la eleccion que hiciste una vez para esa pregunta', () => {
    const guardada: CustomQuestion[] = [{
      id: '2',
      question: '¿Cuál es tu nivel de inglés?',
      answer: 'Intermedio - me siento con comodidad para leer y escribir pero no a nivel conversacional',
      updatedAt: 0,
    }];

    run({}, guardada);

    expect(document.querySelector<HTMLInputElement>('[value="2"]')!.checked).toBe(true);
  });
});

describe('el envio', () => {
  it('encuentra el boton por el value del input', () => {
    // Es <input type="submit" value="Enviar solicitud">, sin textContent.
    expect(findApplyButton(document)?.label).toBe('enviar solicitud');
  });

  it('ve que faltan el salario y el CV', () => {
    const faltan = missingRequired(document);
    expect(faltan).toHaveLength(2);
  });
});
