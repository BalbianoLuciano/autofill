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
 * Un campo da para pregunta abierta si espera un texto largo. Un input de una
 * linea que no reconocimos casi siempre es un dato, no una pregunta, y llenarlo
 * con un parrafo lo empeora.
 */
export function looksLikeOpenQuestion(el: Element, label: string): boolean {
  if (el instanceof HTMLTextAreaElement) return true;
  if (!(el instanceof HTMLInputElement) || el.type !== 'text') return false;

  // Un label largo o con signo de pregunta es una pregunta, no una etiqueta.
  return label.length >= 25 || /[?¿]/.test(label);
}
