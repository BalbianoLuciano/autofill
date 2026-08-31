/**
 * Preguntas propias.
 *
 * El diccionario cubre los datos que todos los formularios piden. Pero las
 * aplicaciones de verdad tienen ademas preguntas abiertas —"describi la
 * automatizacion mas compleja que construiste", "por que queres trabajar
 * aca"— que no son un campo del perfil y se repiten entre postulaciones.
 *
 * Se guardan con su texto y se reusan por similitud contra el label del
 * proximo formulario, que casi nunca lo escribe igual.
 */

import { similarity } from './normalize';
import type { CustomQuestion } from '../types';

/**
 * Umbral para dar dos preguntas por equivalentes.
 *
 * Alto a proposito: contestar una pregunta con la respuesta de otra es peor
 * que dejarla vacia, porque se envia igual y nadie lo nota.
 */
const MATCH_THRESHOLD = 0.82;

export function findAnswer(
  label: string,
  questions: CustomQuestion[],
): CustomQuestion | null {
  if (!label.trim()) return null;

  let best: { question: CustomQuestion; score: number } | null = null;
  for (const question of questions) {
    const score = similarity(question.question, label);
    if (best === null || score > best.score) best = { question, score };
  }

  return best && best.score >= MATCH_THRESHOLD ? best.question : null;
}

/** Guarda o actualiza. Si ya hay una equivalente, se pisa en vez de duplicar. */
export function upsertQuestion(
  questions: CustomQuestion[],
  question: string,
  answer: string,
  hostname?: string,
): CustomQuestion[] {
  const existing = findAnswer(question, questions);
  const entry: CustomQuestion = {
    id: existing?.id ?? crypto.randomUUID(),
    question: existing?.question ?? question,
    answer,
    hostname: existing?.hostname ?? hostname,
    updatedAt: Date.now(),
  };

  return existing
    ? questions.map((q) => (q.id === existing.id ? entry : q))
    : [...questions, entry];
}

/**
 * Si el campo se puede contestar a mano.
 *
 * Un textarea siempre. Un grupo de radios o un select, cuando lo que los
 * encabeza es una pregunta y no una etiqueta: "¿Tenes experiencia integrando
 * APIs de LLMs?" no es ningun dato del perfil, pero se contesta una vez y se
 * reusa. Un input de una linea suelto casi siempre es un dato, no una
 * pregunta, y llenarlo con un parrafo lo empeora.
 */
export function looksLikeOpenQuestion(
  el: Element,
  label: string,
  hasOptions = false,
): boolean {
  if (el instanceof HTMLTextAreaElement) return true;

  const asks = /[?¿]/.test(label);
  if (hasOptions || el instanceof HTMLSelectElement) return asks || label.length >= 15;
  if (!(el instanceof HTMLInputElement) || el.type !== 'text') return false;
  return asks || label.length >= 25;
}

/** Las etiquetas de las opciones, para poder ofrecerlas en el overlay. */
export function optionsOf(el: Element, group?: HTMLInputElement[]): string[] {
  if (group && group.length > 0) {
    return group.map((i) => i.labels?.[0]?.textContent?.trim() || i.value).filter(Boolean);
  }
  if (el instanceof HTMLSelectElement) {
    return Array.from(el.options).filter((o) => o.value !== '').map((o) => o.text.trim());
  }
  return [];
}
