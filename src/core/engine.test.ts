/**
 * El motor de punta a punta: que los seis sensibles no se rellenen solos es
 * la regla que mas caro sale romper.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { runFill, applyLearned } from './engine';
import type { Profile } from '../types';

const PROFILE: Profile = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  phone: '+34 600 000 000',
  country: 'Argentina',
  salaryExpectation: '60000',
  address: 'Calle Falsa 123',
  yearsExperience: '7',
};

function render(html: string): void {
  document.body.innerHTML = html;
  for (const el of document.querySelectorAll('input, textarea, select')) {
    el.getClientRects = () => [{ width: 100, height: 20 }] as unknown as DOMRectList;
  }
}

const run = (overrides: Partial<Parameters<typeof runFill>[0]> = {}) =>
  runFill({
    profile: PROFILE,
    mappings: {},
    fillSensitive: false,
    overwriteFilled: false,
    ...overrides,
  });

const input = (name: string) => document.querySelector<HTMLInputElement>(`[name="${name}"]`)!;

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

  it('no toca los sensibles y los marca', () => {
    render(`
      <label for="a">Expected Salary</label><input id="a" name="salary">
      <label for="b">Street Address</label><input id="b" name="address">
    `);

    const report = run();

    expect(input('salary').value).toBe('');
    expect(input('address').value).toBe('');
    expect(report.filled).toHaveLength(0);
    expect(report.skipped.map((s) => s.reason)).toEqual(['sensitive', 'sensitive']);
    expect(input('salary').getAttribute('data-autofill')).toBe('sensitive');
  });

  it('los rellena si la persona lo pidio explicitamente', () => {
    render(`<label for="a">Expected Salary</label><input id="a" name="salary">`);
    run({ fillSensitive: true });
    expect(input('salary').value).toBe('60000');
  });

  it('no pisa lo que ya estaba escrito', () => {
    render(`<label for="a">Email</label><input id="a" name="email" value="otro@mail.com">`);

    const report = run();

    expect(input('email').value).toBe('otro@mail.com');
    expect(report.skipped[0]?.reason).toBe('already-filled');
  });

  it('pisa cuando el ajuste lo permite', () => {
    render(`<label for="a">Email</label><input id="a" name="email" value="otro@mail.com">`);
    run({ overwriteFilled: true });
    expect(input('email').value).toBe('ada@example.com');
  });

  it('elige la opcion del select que se parece al valor', () => {
    render(`
      <label for="a">Country</label>
      <select id="a" name="country">
        <option value=""></option>
        <option value="ar">Argentina</option>
        <option value="es">Spain</option>
      </select>
    `);

    run();

    expect(document.querySelector<HTMLSelectElement>('[name="country"]')!.value).toBe('ar');
  });

  it('deja el select sin tocar si ninguna opcion se parece', () => {
    render(`
      <label for="a">Country</label>
      <select id="a" name="country">
        <option value=""></option>
        <option value="de">Germany</option>
        <option value="jp">Japan</option>
      </select>
    `);

    const report = run();
    const select = document.querySelector<HTMLSelectElement>('[name="country"]')!;

    expect(select.value).toBe('');
    expect(report.skipped[0]?.reason).toBe('no-option');
    expect(report.skipped[0]?.options).toEqual(['Germany', 'Japan']);
  });

  it('informa los que no reconoce, con su firma', () => {
    render(`<label for="a">Favorite dinosaur</label><input id="a" name="dino_q">`);

    const report = run();

    expect(report.skipped[0]).toMatchObject({
      reason: 'unmapped',
      signature: 'name:dino_q',
      label: 'Favorite dinosaur',
    });
  });

  it('avisa cuando reconoce el campo pero el perfil no tiene el dato', () => {
    render(`<label for="a">GitHub</label><input id="a" name="github">`);
    expect(run().skipped[0]?.reason).toBe('no-value');
  });
});

describe('applyLearned', () => {
  it('rellena el campo que la persona mapeo a mano', () => {
    render(`<label for="a">Favorite dinosaur</label><input id="a" name="dino_q">`);

    expect(applyLearned('name:dino_q', 'city', 'Madrid')).toBe(true);
    expect(input('dino_q').value).toBe('Madrid');
  });

  it('devuelve false si el campo ya no esta', () => {
    render(`<input name="otro">`);
    expect(applyLearned('name:dino_q', 'city', 'Madrid')).toBe(false);
  });
});
