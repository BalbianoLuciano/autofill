/**
 * El bug que esto viene a arreglar: un formulario de IT pregunta por seis
 * tecnologias y las seis recibian el mismo numero, que es afirmar por escrito
 * una experiencia que no tenes.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { detectSkill } from './skills';
import { resolve } from './resolve';
import { runFill } from './engine';
import { migrateFromV1, sanitizeProfile } from './storage';
import type { Profile, Settings, SkillEntry } from '../types';

const MIS_SKILLS: SkillEntry[] = [
  { name: 'React', years: 5 },
  { name: 'Node.js', years: 4 },
  { name: 'Java', years: 2 },
  { name: 'React Native', years: 1 },
];

const PROFILE: Profile = {
  yearsExperience: { kind: 'skills', totalYears: 5, entries: MIS_SKILLS },
};

const SETTINGS: Settings = {
  fillSensitive: false, overwriteFilled: false, language: 'auto',
  autoApply: false, autoApplyDelay: 5, attachCv: false,
};

describe('detectSkill', () => {
  it('reconoce la tecnologia de la pregunta', () => {
    const hit = detectSkill('¿Cuántos años de experiencia tenés con React?', MIS_SKILLS);
    expect(hit).toEqual({ kind: 'known', entry: { name: 'React', years: 5 } });
  });

  it('gana la coincidencia mas larga', () => {
    // `React Native` contiene `React`; sin preferir la mas larga, un anio de
    // React Native se convertiria en cinco.
    const hit = detectSkill('Years of experience with React Native', MIS_SKILLS);
    expect(hit).toMatchObject({ entry: { name: 'React Native', years: 1 } });
  });

  it('no confunde Java con JavaScript', () => {
    // normalize parte camelCase: JavaScript -> "java script", asi que `Java`
    // tambien matchea. La mas larga desempata.
    const hit = detectSkill('How many years with JavaScript?', MIS_SKILLS);
    expect(hit).toEqual({ kind: 'unlisted', name: 'javascript' });
  });

  it('reconoce una tecnologia que no tenes cargada', () => {
    const hit = detectSkill('¿Cuántos años con Kubernetes?', MIS_SKILLS);
    expect(hit).toEqual({ kind: 'unlisted', name: 'kubernetes' });
  });

  it('una pregunta general no nombra ninguna', () => {
    expect(detectSkill('¿Cuántos años de experiencia tenés?', MIS_SKILLS)).toBeNull();
  });
});

describe('resolver los años', () => {
  const anios = (texto: string) =>
    resolve('yearsExperience', PROFILE, { lang: 'es', qualifiers: {}, text: texto, numeric: true });

  it('contesta el numero de esa tecnologia', () => {
    expect(anios('¿Años con React?').candidates[0]).toBe('5');
    expect(anios('¿Años con Node.js?').candidates[0]).toBe('4');
    expect(anios('¿Años con Java?').candidates[0]).toBe('2');
  });

  it('contesta el total cuando la pregunta es general', () => {
    expect(anios('Años de experiencia').candidates[0]).toBe('5');
  });

  it('no inventa experiencia en lo que no tenes', () => {
    const out = anios('¿Cuántos años con Kubernetes?');
    expect(out.candidates).toEqual([]);
    expect(out.problem).toBe('unlisted-skill');
    expect(out.skill).toBe('kubernetes');
  });
});

/* -------------------------- de punta a punta -------------------------- */

function render(html: string): void {
  document.documentElement.setAttribute('lang', 'es');
  document.body.innerHTML = html;
  for (const node of document.querySelectorAll('input, textarea, select')) {
    node.getClientRects = () => [{ width: 100, height: 20 }] as unknown as DOMRectList;
  }
}

const val = (name: string) =>
  document.querySelector<HTMLInputElement>(`[name="${name}"]`)!.value;

beforeEach(() => { document.body.innerHTML = ''; });

describe('un formulario de IT con varias tecnologias', () => {
  it('le da a cada pregunta su propio numero', () => {
    render(`
      <label for="a">¿Cuántos años de experiencia tenés con React?</label>
      <input id="a" name="q_react" type="number">
      <label for="b">¿Cuántos años con Node.js?</label>
      <input id="b" name="q_node" type="number">
      <label for="c">¿Cuántos años con Java?</label>
      <input id="c" name="q_java" type="number">
      <label for="d">Años de experiencia total</label>
      <input id="d" name="q_total" type="number">
    `);

    const report = runFill({ profile: PROFILE, mappings: {}, questions: [], settings: SETTINGS });

    expect(val('q_react')).toBe('5');
    expect(val('q_node')).toBe('4');
    expect(val('q_java')).toBe('2');
    expect(val('q_total')).toBe('5');
    // El informe muestra por que tecnologia contesto cada uno.
    expect(report.filled.map((f) => f.skill)).toEqual(['React', 'Node.js', 'Java', undefined]);
  });

  it('deja vacia la tecnologia que no tenes, y la reporta', () => {
    render(`
      <label for="a">¿Cuántos años con Kubernetes?</label>
      <input id="a" name="q_k8s" type="number">
    `);

    const report = runFill({ profile: PROFILE, mappings: {}, questions: [], settings: SETTINGS });

    expect(val('q_k8s')).toBe('');
    expect(report.skipped[0]).toMatchObject({ reason: 'unlisted-skill', skill: 'kubernetes' });
  });
});

describe('migracion', () => {
  it('conserva el numero que ya estaba cargado como total', () => {
    expect(migrateFromV1({ yearsExperience: '5' }).yearsExperience)
      .toEqual({ kind: 'skills', totalYears: 5, entries: [] });
  });

  it('convierte el texto de la v2 sin perderlo', () => {
    const clean = sanitizeProfile({
      yearsExperience: { kind: 'text', es: '5' },
    } as never);
    expect(clean.yearsExperience).toEqual({ kind: 'skills', totalYears: 5, entries: [] });
  });
});
