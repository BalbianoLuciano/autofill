/**
 * Los casos que el spec marca como los que van a romper (§5), mas los que ya
 * rompieron una vez.
 */

import { describe, expect, it } from 'vitest';
import { matchText, detectFields, signatureOf, labelFor } from './matcher';
import { normalize, tokenize, containsTokenSequence, similarity } from './normalize';

const keyOf = (text: string) => matchText(text)?.key ?? null;

describe('normalize', () => {
  it('reduce las cuatro formas del mismo campo a una', () => {
    for (const variant of ['first_name', 'first-name', 'firstName', 'First Name', 'FIRST NAME']) {
      expect(normalize(variant)).toBe('first name');
    }
  });

  it('saca tildes', () => {
    expect(normalize('Teléfono')).toBe('telefono');
    expect(normalize('Años de experiencia')).toBe('anos de experiencia');
    expect(normalize('Prénom')).toBe('prenom');
  });

  it('parte acronimos sin pegotearlos', () => {
    expect(normalize('linkedInURLValue')).toBe('linked in url value');
  });

  it('compara secuencias de tokens, no substrings', () => {
    expect(containsTokenSequence(tokenize('candidate first name'), tokenize('first name'))).toBe(true);
    expect(containsTokenSequence(tokenize('username'), tokenize('name'))).toBe(false);
    expect(containsTokenSequence(tokenize('first middle name'), tokenize('first name'))).toBe(false);
  });
});

describe('matchText', () => {
  it('reconoce los campos basicos en varios idiomas', () => {
    expect(keyOf('First Name')).toBe('firstName');
    expect(keyOf('Apellidos')).toBe('lastName');
    expect(keyOf('Correo electrónico')).toBe('email');
    expect(keyOf('Teléfono móvil')).toBe('phone');
    expect(keyOf('Nachname')).toBe('lastName');
    expect(keyOf('Prénom')).toBe('firstName');
  });

  it('no confunde `name` suelto con los que lo contienen', () => {
    // El caso que el spec marca explicitamente: comparar por token evita que
    // `name` se coma `company name`, `username` y `filename`.
    expect(keyOf('Company Name')).toBe('currentCompany');
    expect(keyOf('Username')).not.toBe('fullName');
    expect(keyOf('Filename')).not.toBe('fullName');
    expect(keyOf('Full Name')).toBe('fullName');
  });

  it('un alias de una palabra ambigua exige coincidencia exacta', () => {
    // `address` lo usan address y email (`email address`), asi que solo cuenta
    // si el texto es exactamente ese.
    expect(keyOf('Address')).toBe('address');
    expect(keyOf('Email Address')).toBe('email');
  });

  it('un alias de una palabra distintiva alcanza con que aparezca', () => {
    expect(keyOf('job_application[urls][LinkedIn]')).toBe('linkedin');
    expect(keyOf('candidate_github_profile')).toBe('github');
  });

  it('gana el alias mas especifico', () => {
    expect(keyOf('Current Company')).toBe('currentCompany');
    expect(keyOf('Years of experience')).toBe('yearsExperience');
    expect(keyOf('Expected salary')).toBe('salaryExpectation');
    expect(keyOf('Pretensión salarial')).toBe('salaryExpectation');
  });

  it('devuelve null cuando no reconoce nada', () => {
    expect(keyOf('Favorite dinosaur')).toBeNull();
    expect(keyOf('')).toBeNull();
  });
});

describe('similarity', () => {
  it('elige la opcion correcta de un select', () => {
    expect(similarity('Argentina', 'Argentina')).toBe(1);
    expect(similarity('Argentina', 'argentina')).toBe(1);
    expect(similarity('Argentina', 'Armenia')).toBeLessThan(0.72);
    expect(similarity('Spain / España', 'España')).toBeGreaterThan(0.72);
  });
});

/* ------------------------------ formularios ------------------------------ */

function render(html: string): Document {
  document.body.innerHTML = html;
  // happy-dom no calcula layout, asi que getClientRects devuelve vacio y el
  // filtro de visibilidad descartaria todo.
  for (const el of document.querySelectorAll('input, textarea, select')) {
    el.getClientRects = () => [{ width: 100, height: 20 }] as unknown as DOMRectList;
  }
  return document;
}

const detect = (html: string) => detectFields(render(html), { learned: {} });
const byKey = (html: string) =>
  Object.fromEntries(detect(html).filter((f) => f.key).map((f) => [f.key, f.label]));

describe('detectFields', () => {
  it('lee un formulario tipo Greenhouse', () => {
    const found = byKey(`
      <label for="first_name">First Name *</label>
      <input id="first_name" name="job_application[first_name]" type="text">
      <label for="last_name">Last Name *</label>
      <input id="last_name" name="job_application[last_name]" type="text">
      <label for="email">Email *</label>
      <input id="email" name="job_application[email]" type="email">
      <label for="phone">Phone</label>
      <input id="phone" name="job_application[phone]" type="tel">
      <label for="url1">LinkedIn Profile</label>
      <input id="url1" name="job_application[urls][LinkedIn]" type="text">
    `);
    expect(found).toMatchObject({
      firstName: 'First Name',
      lastName: 'Last Name',
      email: 'Email',
      phone: 'Phone',
      linkedin: 'LinkedIn Profile',
    });
  });

  it('prefiere autocomplete cuando el valor tiene un solo dueno', () => {
    const [field] = detect(`<input autocomplete="given-name" name="q1">`);
    expect(field?.key).toBe('firstName');
    expect(field?.via).toBe('autocomplete');
  });

  it('ignora autocomplete cuando el valor es ambiguo', () => {
    // `url` lo declaran linkedin, github, portfolio y otherUrl: no dice nada.
    const [field] = detect(`<label for="a">GitHub</label><input id="a" autocomplete="url">`);
    expect(field?.key).toBe('github');
    expect(field?.via).toBe('label');
  });

  it('el mapping aprendido le gana a todo', () => {
    const doc = render(`<label for="x">First Name</label><input id="x" name="weird_field">`);
    const [field] = detectFields(doc, { learned: { 'name:weird_field': 'portfolio' } });
    expect(field?.key).toBe('portfolio');
    expect(field?.via).toBe('learned');
  });

  it('cae al texto cercano cuando no hay label', () => {
    const [field] = detect(`<div><span>Years of experience</span><input name="q_842"></div>`);
    expect(field?.key).toBe('yearsExperience');
    expect(field?.via).toBe('nearby-text');
  });

  it('entra al shadow DOM', () => {
    const doc = render(`<div id="host"></div>`);
    const host = doc.getElementById('host')!;
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<label for="s">Email</label><input id="s" name="email">`;
    const input = shadow.querySelector('input')!;
    input.getClientRects = () => [{ width: 100, height: 20 }] as unknown as DOMRectList;

    expect(detectFields(doc, { learned: {} }).some((f) => f.key === 'email')).toBe(true);
  });

  it('agrupa los radios y usa la pregunta del fieldset', () => {
    const fields = detect(`
      <fieldset>
        <legend>Do you require visa sponsorship?</legend>
        <label><input type="radio" name="sponsor" value="yes"> Yes</label>
        <label><input type="radio" name="sponsor" value="no"> No</label>
      </fieldset>
    `);
    expect(fields).toHaveLength(1);
    expect(fields[0]?.key).toBe('requiresSponsorship');
    expect(fields[0]?.group).toHaveLength(2);
  });

  it('descarta lo que no se rellena: file, password, hidden, checkbox', () => {
    const fields = detect(`
      <input type="file" name="resume">
      <input type="password" name="password">
      <input type="hidden" name="token">
      <input type="checkbox" name="consent">
      <input type="text" name="email">
    `);
    expect(fields.map((f) => f.el.getAttribute('name'))).toEqual(['email']);
  });

  it('la firma es estable y prefiere name sobre id', () => {
    const doc = render(`<label for="a">Email</label><input id="a" name="candidate[email]">`);
    const input = doc.querySelector('input')!;
    expect(signatureOf(input, labelFor(input))).toBe('name:candidate[email]');
  });
});
