/**
 * Lo que queda sin contestar.
 *
 * El caso que motivo el modulo: un radio obligatorio sin marcar no se ve
 * vacio, asi que se descubre despues del submit.
 */

import { describe, expect, it } from 'vitest';
import { findUnanswered } from './audit';
import { setCheckboxValue } from './filler';

function render(html: string): Document {
  document.body.innerHTML = html;
  for (const el of document.querySelectorAll('input, textarea, select')) {
    el.getClientRects = () => [{ width: 100, height: 20 }] as unknown as DOMRectList;
  }
  return document;
}

const faltantes = (html: string) => findUnanswered(render(html));

describe('findUnanswered', () => {
  it('encuentra un radio obligatorio sin marcar', () => {
    const out = faltantes(`
      <fieldset>
        <legend>¿Requerís patrocinio de visa? *</legend>
        <label><input type="radio" name="visa" value="si"> Sí</label>
        <label><input type="radio" name="visa" value="no"> No</label>
      </fieldset>
    `);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('radio');
    expect(out[0]?.options).toEqual(['Sí', 'No']);
  });

  it('no reporta el grupo cuando ya hay una opcion marcada', () => {
    expect(faltantes(`
      <fieldset>
        <legend>¿Requerís patrocinio? *</legend>
        <label><input type="radio" name="visa" value="si"> Sí</label>
        <label><input type="radio" name="visa" value="no" checked> No</label>
      </fieldset>
    `)).toHaveLength(0);
  });

  it('un select que quedo en el placeholder cuenta como vacio', () => {
    const out = faltantes(`
      <label for="s">País *</label>
      <select id="s" required>
        <option value="x">Seleccioná una opción</option>
        <option value="ar">Argentina</option>
      </select>
    `);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('select');
  });

  it('ignora lo que no es obligatorio', () => {
    expect(faltantes(`
      <label for="s">País</label>
      <select id="s"><option value="">--</option><option value="ar">Argentina</option></select>
    `)).toHaveLength(0);
  });

  // Muchos formularios validan en JS y solo ponen un asterisco en la etiqueta.
  it('toma el asterisco de la etiqueta como obligatorio', () => {
    const out = faltantes(`
      <label for="t">Expectativa salarial *</label>
      <input id="t" type="text">
    `);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('text');
  });

  it('un checkbox obligatorio sin marcar aparece', () => {
    const out = faltantes(`
      <label for="c">Acepto los términos *</label>
      <input id="c" type="checkbox" required>
    `);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('checkbox');
  });
});

describe('setCheckboxValue', () => {
  it('marca un checkbox suelto cuando la respuesta es afirmativa', () => {
    render(`<input id="c" type="checkbox">`);
    const c = document.querySelector<HTMLInputElement>('#c')!;
    expect(setCheckboxValue([c], ['yes']).ok).toBe(true);
    expect(c.checked).toBe(true);
  });

  // El bug que separa checkbox de radio: un radio no se desmarca al
  // reclickearlo, un checkbox si.
  it('no lo apaga si ya estaba marcado', () => {
    render(`<input id="c" type="checkbox" checked>`);
    const c = document.querySelector<HTMLInputElement>('#c')!;
    setCheckboxValue([c], ['si']);
    expect(c.checked).toBe(true);
  });

  it('lo desmarca cuando la respuesta es que no', () => {
    render(`<input id="c" type="checkbox" checked>`);
    const c = document.querySelector<HTMLInputElement>('#c')!;
    setCheckboxValue([c], ['no']);
    expect(c.checked).toBe(false);
  });

  it('elige la opcion del grupo que coincide', () => {
    render(`
      <label><input type="checkbox" name="r" value="es"> España</label>
      <label><input type="checkbox" name="r" value="ar"> Argentina</label>
    `);
    const grupo = [...document.querySelectorAll<HTMLInputElement>('input[name=r]')];
    expect(setCheckboxValue(grupo, ['Argentina']).ok).toBe(true);
    expect(grupo[1]!.checked).toBe(true);
    expect(grupo[0]!.checked).toBe(false);
  });

  it('no marca nada si ninguna opcion se parece', () => {
    render(`
      <label><input type="checkbox" name="r" value="es"> España</label>
      <label><input type="checkbox" name="r" value="ar"> Argentina</label>
    `);
    const grupo = [...document.querySelectorAll<HTMLInputElement>('input[name=r]')];
    const out = setCheckboxValue(grupo, ['Japón']);
    expect(out.ok).toBe(false);
    expect(grupo.some((c) => c.checked)).toBe(false);
  });
});
