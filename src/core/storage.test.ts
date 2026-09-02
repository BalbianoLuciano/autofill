/**
 * La migracion desde la v1, donde todo el perfil era texto plano.
 *
 * Importa porque un perfil ya cargado tiene que sobrevivir al cambio de
 * modelo: si se pierde, la persona lo vuelve a tipear entero.
 */

import { describe, expect, it } from 'vitest';
import { migrateFromV1, parseRegions, parseSalary, sanitizeProfile } from './storage';

describe('parseSalary', () => {
  it('separa las dos monedas de una respuesta escrita a mano', () => {
    // Sin moneda declarada se usa la magnitud: nadie pide 3.500.000 dolares
    // por mes ni 2.500 pesos.
    expect(parseSalary('2500 usd o 3500000')).toEqual([
      { amount: 2500, currency: 'USD', period: 'month' },
      { amount: 3500000, currency: 'ARS', period: 'month' },
    ]);
  });

  it('entiende los separadores de miles', () => {
    expect(parseSalary('3.500.000 pesos')).toEqual([
      { amount: 3500000, currency: 'ARS', period: 'month' },
    ]);
  });

  it('no inventa nada si no hay numeros', () => {
    expect(parseSalary('a convenir')).toEqual([]);
  });

  it('marca bruto o neto cuando el texto lo aclara', () => {
    expect(parseSalary('3000 eur brutos')).toEqual([
      { amount: 3000, currency: 'EUR', period: 'month', basis: 'gross' },
    ]);
    expect(parseSalary('2300 eur en mano')).toEqual([
      { amount: 2300, currency: 'EUR', period: 'month', basis: 'net' },
    ]);
  });

  it('no confunde "en mano" con anual', () => {
    // "ano" esta adentro de "mano": sin limites de palabra el sueldo mensual
    // se guardaba como anual y salia dividido por doce.
    const periodos = (text: string) => parseSalary(text).map((e) => e.period);

    expect(periodos('2300 eur en mano')).toEqual(['month']);
    expect(periodos('30000 eur anuales')).toEqual(['year']);
    expect(periodos('25 usd por hora')).toEqual(['hour']);
  });

  it('deja sin marcar lo que no se aclaro', () => {
    // Sin declarar sirve para cualquier pregunta: no hay que inventarle un
    // bruto/neto a quien nunca hizo la distincion.
    expect(parseSalary('2500 usd').map((e) => e.basis)).toEqual([undefined]);
  });
});

describe('parseRegions', () => {
  it('saca los paises de una frase', () => {
    expect(parseRegions('Argentina y España')).toEqual(['AR', 'ES']);
    expect(parseRegions('Puedo trabajar en la Unión Europea')).toContain('EU');
  });

  it('devuelve vacio cuando no reconoce ninguno', () => {
    expect(parseRegions('tengo permiso')).toEqual([]);
  });
});

describe('migrateFromV1', () => {
  it('convierte cada campo al tipo que le corresponde', () => {
    const migrated = migrateFromV1({
      firstName: 'Ada',
      currentTitle: 'AI Engineer',
      noticePeriod: 'Inmediatamente',
      englishLevel: 'B2',
      salaryExpectation: '2500 usd o 3500000',
      workAuthorization: 'Argentina y España',
    });

    expect(migrated.firstName).toEqual({ kind: 'text', es: 'Ada' });
    expect(migrated.currentTitle).toEqual({ kind: 'text', es: 'AI Engineer' });
    // El texto libre se convierte en el codigo de la opcion.
    expect(migrated.noticePeriod).toEqual({ kind: 'choice', code: 'immediate' });
    expect(migrated.englishLevel).toEqual({ kind: 'choice', code: 'b2' });
    expect(migrated.salaryExpectation).toMatchObject({
      kind: 'salary',
      entries: [
        { amount: 2500, currency: 'USD' },
        { amount: 3500000, currency: 'ARS' },
      ],
    });
    expect(migrated.workAuthorization).toEqual({ kind: 'regions', codes: ['AR', 'ES'] });
  });

  it('descarta lo que no puede interpretar en vez de adivinar', () => {
    const migrated = migrateFromV1({ noticePeriod: 'cuando termine el proyecto' });
    expect(migrated.noticePeriod).toBeUndefined();
  });

  it('ignora claves que no existen', () => {
    expect(migrateFromV1({ noSoyUnCampo: 'x' })).toEqual({});
  });
});

describe('sanitizeProfile', () => {
  it('tira los valores con forma invalida', () => {
    const clean = sanitizeProfile({
      firstName: { kind: 'text', es: '  Ada  ' },
      lastName: { kind: 'text', es: '   ' },
      englishLevel: { kind: 'choice', code: 'no-existe' },
      salaryExpectation: { kind: 'salary', entries: [], hoursPerMonth: 160 },
    } as never);

    expect(clean.firstName).toEqual({ kind: 'text', es: 'Ada' });
    expect(clean.lastName).toBeUndefined();
    expect(clean.englishLevel).toBeUndefined();
    expect(clean.salaryExpectation).toBeUndefined();
  });
});
