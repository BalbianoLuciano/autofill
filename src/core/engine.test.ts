/**
 * El motor de punta a punta: que los sensibles no se rellenen solos es la
 * regla que mas caro sale romper.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { runFill, applyLearned } from './engine';
import type { Profile, Settings } from '../types';

const PROFILE: Profile = {
  firstName: { kind: 'text', es: 'Ada' },
  lastName: { kind: 'text', es: 'Lovelace' },
  email: { kind: 'text', es: 'ada@example.com' },
  country: { kind: 'text', es: 'España', en: 'Spain' },
  currentTitle: { kind: 'text', es: 'Ingeniera', en: 'Engineer' },
  englishLevel: { kind: 'choice', code: 'c1' },
  noticePeriod: { kind: 'choice', code: 'immediate' },
  address: { kind: 'text', es: 'Calle Falsa 123' },
  workAuthorization: { kind: 'regions', codes: ['ES'] },
  salaryExpectation: {
    kind: 'salary',
    hoursPerMonth: 160,
    paymentsPerYear: 12,
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

function render(html: string, lang = 'en'): void {
  document.documentElement.setAttribute('lang', lang);
  document.body.innerHTML = html;
  for (const node of document.querySelectorAll('input, textarea, select')) {
    node.getClientRects = () => [{ width: 100, height: 20 }] as unknown as DOMRectList;
  }
}

const run = (overrides: Partial<Settings> = {}) =>
  runFill({
    profile: PROFILE,
    mappings: {},
    questions: [],
    settings: { ...SETTINGS, ...overrides },
  });

const input = (name: string) => document.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
const select = (name: string) => document.querySelector<HTMLSelectElement>(`[name="${name}"]`)!;

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('runFill', () => {
  it('completa los campos que reconoce', () => {
    render(`
      <label for="a">First Name</label><input id="a" name="first_name">
      <label for="b">Email</label><input id="b" name="email">
    `);

    const report = run();

    expect(input('first_name').value).toBe('Ada');
    expect(input('email').value).toBe('ada@example.com');
    expect(report.filled.map((f) => f.key).sort()).toEqual(['email', 'firstName']);
  });

  it('responde en el idioma del formulario', () => {
    render(`<label for="a">Country</label><input id="a" name="country">`, 'en');
    run();
    expect(input('country').value).toBe('Spain');

    render(`<label for="a">País</label><input id="a" name="country">`, 'es');
    run();
    expect(input('country').value).toBe('España');
  });

  it('el ajuste de idioma le gana a la deteccion', () => {
    render(`<label for="a">Country</label><input id="a" name="country">`, 'en');
    run({ language: 'es' });
    expect(input('country').value).toBe('España');
  });

  it('elige la opcion del select aunque este escrita distinto', () => {
    render(`
      <label for="a">English level</label>
      <select id="a" name="english">
        <option value=""></option>
        <option value="1">Limited working proficiency</option>
        <option value="2">Full professional proficiency</option>
      </select>
    `);

    run();

    // El perfil guarda el codigo `c1`; el sinonimo es el que encuentra la opcion.
    expect(select('english').value).toBe('2');
  });

  it('no toca los sensibles, pero deja resuelto que corresponde', () => {
    render(`<label for="a">Expected annual salary (USD)</label><input id="a" name="salary">`);

    const report = run();
    const skip = report.skipped.find((s) => s.key === 'salaryExpectation');

    expect(input('salary').value).toBe('');
    expect(skip?.reason).toBe('sensitive');
    // 2500 por mes guardados, pero el formulario pide el anual.
    expect(skip?.suggestion).toBe('30000');
    expect(input('salary').getAttribute('data-autofill')).toBe('sensitive');
  });

  it('contesta el permiso de trabajo por si o por no', () => {
    render(`
      <fieldset>
        <legend>Are you legally authorized to work in the EU?</legend>
        <label><input type="radio" name="auth" value="yes"> Yes</label>
        <label><input type="radio" name="auth" value="no"> No</label>
      </fieldset>
    `);

    const report = run({ fillSensitive: true });

    expect(document.querySelector<HTMLInputElement>('[value="yes"]')!.checked).toBe(true);
    expect(report.filled.some((f) => f.key === 'workAuthorization')).toBe(true);
  });

  it('deduce el patrocinio del permiso de trabajo', () => {
    render(`
      <fieldset>
        <legend>Will you require visa sponsorship in the United States?</legend>
        <label><input type="radio" name="sp" value="yes"> Yes</label>
        <label><input type="radio" name="sp" value="no"> No">
      </fieldset>
    `);

    run({ fillSensitive: true });

    // Solo tiene permiso español, asi que en EE.UU. si necesita patrocinio.
    expect(document.querySelector<HTMLInputElement>('[value="yes"]')!.checked).toBe(true);
  });

  it('avisa cuando pide una moneda que no esta cargada', () => {
    render(`<label for="a">Expected salary in EUR</label><input id="a" name="salary">`);
    const report = run({ fillSensitive: true });
    expect(report.skipped.find((s) => s.key === 'salaryExpectation')?.reason).toBe('no-currency');
  });

  it('no pisa lo que ya estaba escrito', () => {
    render(`<label for="a">Email</label><input id="a" name="email" value="otro@mail.com">`);
    const report = run();
    expect(input('email').value).toBe('otro@mail.com');
    expect(report.skipped.find((s) => s.key === 'email')?.reason).toBe('already-filled');
  });

  it('pisa cuando el ajuste lo permite', () => {
    render(`<label for="a">Email</label><input id="a" name="email" value="otro@mail.com">`);
    run({ overwriteFilled: true });
    expect(input('email').value).toBe('ada@example.com');
  });

  it('informa los que no reconoce, con su firma', () => {
    render(`<label for="a">Favorite dinosaur</label><input id="a" name="dino_q">`);
    expect(run().skipped[0]).toMatchObject({
      reason: 'unmapped',
      signature: 'name:dino_q',
      label: 'Favorite dinosaur',
    });
  });

  it('avisa cuando reconoce el campo pero el perfil no tiene el dato', () => {
    render(`<label for="a">GitHub</label><input id="a" name="github">`);
    expect(run().skipped[0]?.reason).toBe('no-value');
  });

  it('reporta en que idioma leyo el formulario', () => {
    render(`<label for="a">Email</label><input id="a" name="email">`, 'es');
    expect(run().lang).toBe('es');
  });
});

describe('applyLearned', () => {
  it('rellena el campo que la persona mapeo a mano', () => {
    render(`<label for="a">Favorite dinosaur</label><input id="a" name="dino_q">`);
    expect(applyLearned('name:dino_q', 'currentTitle', PROFILE, SETTINGS)).toBe(true);
    expect(input('dino_q').value).toBe('Engineer');
  });

  it('devuelve false si el campo ya no esta', () => {
    render(`<input name="otro">`);
    expect(applyLearned('name:dino_q', 'currentTitle', PROFILE, SETTINGS)).toBe(false);
  });
});
