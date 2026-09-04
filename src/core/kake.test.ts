/**
 * kake.co, copiado del DOM real.
 *
 * Es el formulario mas pobre en senales que aparecio hasta ahora: sin `name`,
 * sin `id`, sin `label`, sin `autocomplete`. Lo unico que identifica cada
 * campo es el `placeholder`, y el unico texto alrededor del input es el
 * mensaje de validacion.
 */

import { describe, expect, it } from 'vitest';
import { detectFields } from './matcher';

function render(html: string): Document {
  document.body.innerHTML = html;
  for (const el of document.querySelectorAll('input, textarea, select')) {
    el.getClientRects = () => [{ width: 100, height: 20 }] as unknown as DOMRectList;
  }
  return document;
}

const FORM = `
  <div><input type="text" placeholder="Full Name"><div>Field is required</div></div>
  <div><input type="email" placeholder="Email"><div>Field is required</div></div>
  <div>Location<input type="search" id="rc_select_0" autocomplete="off"></div>
  <div><input type="text" placeholder="LinkedIn"></div>
`;

const detect = () => detectFields(render(FORM), { learned: {} });

describe('kake.co', () => {
  it('reconoce los campos por el placeholder', () => {
    const porClave = Object.fromEntries(detect().filter((f) => f.key).map((f) => [f.key, true]));
    expect(porClave).toMatchObject({ fullName: true, email: true, linkedin: true });
  });

  // rc-select monta su combobox sobre un `type="search"`, que estaba en la
  // lista de tipos ignorados. El campo de ubicacion no se tocaba nunca.
  it('recolecta el combobox de ubicacion aunque sea type=search', () => {
    const buscado = detect().find((f) => f.el.id === 'rc_select_0');
    expect(buscado).toBeDefined();
  });

  // "Field is required" es el mensaje de validacion, no el nombre del campo.
  it('no toma el mensaje de validacion como etiqueta', () => {
    for (const field of detect()) {
      expect(field.label).not.toMatch(/field is required/i);
    }
  });

  it('la etiqueta que muestra el popup es el placeholder', () => {
    const nombre = detect().find((f) => f.key === 'fullName');
    expect(nombre?.label).toBe('Full Name');
  });
});
