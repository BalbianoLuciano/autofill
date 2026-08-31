/**
 * La traduccion de "lo que la persona quiere" a "lo que este campo pide".
 * Es donde vive casi toda la logica nueva, asi que es donde mas importa.
 */

import { describe, expect, it } from 'vitest';
import { resolve } from './resolve';
import { extractQualifiers, guessLanguage } from './context';
import type { Profile } from '../types';

const PROFILE: Profile = {
  currentTitle: { kind: 'text', es: 'Ingeniero de IA', en: 'AI Engineer' },
  education: { kind: 'text', es: 'Tecnicatura en Programación' },
  noticePeriod: { kind: 'choice', code: 'immediate' },
  englishLevel: { kind: 'choice', code: 'b2' },
  salaryExpectation: {
    kind: 'salary',
    hoursPerMonth: 160,
    entries: [
      { amount: 2500, currency: 'USD', period: 'month' },
      { amount: 3_500_000, currency: 'ARS', period: 'month' },
    ],
  },
  workAuthorization: { kind: 'regions', codes: ['AR', 'ES'] },
};

const first = (key: keyof Profile, label: string, lang: 'es' | 'en' = 'en', numeric = false) =>
  resolve(key, PROFILE, { lang, qualifiers: extractQualifiers(label), numeric }).candidates[0];

describe('texto por idioma', () => {
  it('usa la variante del idioma de la pagina', () => {
    expect(first('currentTitle', 'Job title', 'en')).toBe('AI Engineer');
    expect(first('currentTitle', 'Puesto actual', 'es')).toBe('Ingeniero de IA');
  });

  it('cae al castellano cuando falta el ingles', () => {
    // Un perfil a medio cargar tiene que seguir sirviendo.
    expect(first('education', 'Education', 'en')).toBe('Tecnicatura en Programación');
  });
});

describe('opciones', () => {
  it('devuelve la etiqueta del idioma y deja sinonimos para el select', () => {
    const out = resolve('noticePeriod', PROFILE, { lang: 'en', qualifiers: {} });
    expect(out.candidates[0]).toBe('Immediately');
    expect(out.candidates).toContain('Inmediata');
    expect(out.candidates).toContain('asap');
  });

  it('el nivel de ingles llega con las formas en que lo escriben los ATS', () => {
    const out = resolve('englishLevel', PROFILE, { lang: 'en', qualifiers: {} });
    expect(out.candidates[0]).toBe('B2 - Upper intermediate');
    expect(out.candidates).toContain('professional working');
  });
});

describe('salario', () => {
  it('convierte entre periodos', () => {
    expect(first('salaryExpectation', 'Expected monthly salary (USD)')).toBe('2500');
    expect(first('salaryExpectation', 'Expected annual salary (USD)')).toBe('30000');
    expect(first('salaryExpectation', 'Hourly rate (USD)')).toBe('15.63');
  });

  it('elige la entrada de la moneda que pide el formulario', () => {
    expect(first('salaryExpectation', 'Sueldo mensual pretendido en ARS', 'es')).toBe('3500000');
    expect(first('salaryExpectation', 'Sueldo anual en ARS', 'es')).toBe('42000000');
  });

  it('no convierte entre monedas: avisa que falta', () => {
    // El tipo de cambio se mueve y en Argentina hay varios a la vez. Inventar
    // una cifra seria peor que no contestar.
    const out = resolve('salaryExpectation', PROFILE, {
      lang: 'en',
      qualifiers: extractQualifiers('Expected salary in EUR'),
    });
    expect(out.candidates).toEqual([]);
    expect(out.problem).toBe('no-currency');
  });

  it('acompana con unidades si el label no las aclara', () => {
    expect(first('salaryExpectation', 'Salary expectations')).toBe('2500 USD per month');
    expect(first('salaryExpectation', 'Pretensión salarial', 'es')).toBe('2500 USD por mes');
  });

  it('en un input numerico va el numero pelado', () => {
    expect(first('salaryExpectation', 'Salary expectations', 'en', true)).toBe('2500');
  });
});

describe('permiso de trabajo', () => {
  it('contesta por si o por no segun la region de la pregunta', () => {
    expect(first('workAuthorization', 'Are you authorized to work in Spain?')).toBe('Yes');
    expect(first('workAuthorization', 'Are you authorized to work in the United States?')).toBe('No');
  });

  it('un permiso espanol habilita la UE', () => {
    expect(first('workAuthorization', 'Are you legally authorized to work in the EU?')).toBe('Yes');
  });

  it('sin region en la pregunta, lista las regiones', () => {
    expect(first('workAuthorization', 'Work authorization')).toBe('Argentina and Spain');
    expect(first('workAuthorization', 'Permiso de trabajo', 'es')).toBe('Argentina y España');
  });

  it('deduce el patrocinio del permiso, invertido', () => {
    // Si podes trabajar ahi, no necesitas que te patrocinen.
    expect(first('requiresSponsorship', 'Will you require visa sponsorship in Spain?')).toBe('No');
    expect(first('requiresSponsorship', 'Will you require sponsorship in the United States?')).toBe('Yes');
  });
});

describe('deteccion de idioma', () => {
  it('distingue por palabras funcionales', () => {
    expect(guessLanguage(
      'Por favor completá el formulario con tus datos, para que podamos revisar la solicitud que enviaste',
    )).toBe('es');
    expect(guessLanguage(
      'Please fill out the form with your details so that we are able to review the application you have sent',
    )).toBe('en');
  });
});

describe('calificadores', () => {
  it('lee periodo, moneda y region del label', () => {
    expect(extractQualifiers('Expected annual salary (USD)')).toEqual({
      period: 'year', currency: 'USD',
    });
    expect(extractQualifiers('Sueldo mensual en pesos')).toMatchObject({
      period: 'month', currency: 'ARS',
    });
    expect(extractQualifiers('authorized to work in the EU')).toMatchObject({ region: 'EU' });
  });

  it('no confunde "tell us about" con Estados Unidos', () => {
    // `us` suelto aparece en medio formulario en ingles.
    expect(extractQualifiers('Tell us about yourself').region).toBeUndefined();
  });

  it('ignora el signo $ solo, que usan las dos monedas', () => {
    expect(extractQualifiers('Salary ($)').currency).toBeUndefined();
    expect(extractQualifiers('Salary (U$S)').currency).toBe('USD');
  });
});
