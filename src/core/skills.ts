/**
 * Anios de experiencia por tecnologia.
 *
 * Un formulario de IT no pregunta "cuantos anios de experiencia tenes": pregunta
 * cuantos con React, cuantos con Kubernetes y cuantos con AWS, en la misma
 * pantalla. Con un solo numero guardado, las tres respuestas salian iguales, y
 * eso no es un dato incompleto: es una afirmacion falsa sobre tu experiencia.
 *
 * La deteccion es la misma idea que la de regiones en el permiso de trabajo:
 * se lee del label de que tecnologia habla la pregunta, y se responde por esa.
 */

import { containsTokenSequence, normalize, tokenize } from './normalize';
import type { SkillEntry } from '../types';

/**
 * Tecnologias que se reconocen aunque no esten en tu perfil.
 *
 * No sirven para responder —para eso estan tus propias entradas— sino para
 * saber que la pregunta es sobre *una* tecnologia. Sin esta lista, "¿cuantos
 * anios con Kubernetes?" caeria en la respuesta general y volveria a contestar
 * tu total, que es justo el error que esto viene a arreglar.
 */
export const KNOWN_TECHNOLOGIES = [
  // Lenguajes
  'javascript', 'typescript', 'python', 'java', 'kotlin', 'swift', 'go', 'golang',
  'rust', 'ruby', 'php', 'c', 'c++', 'c#', 'scala', 'elixir', 'dart', 'r',
  'perl', 'haskell', 'clojure', 'objective c', 'visual basic', 'matlab',
  // Frontend
  'react', 'react native', 'vue', 'vue js', 'angular', 'angularjs', 'svelte',
  'next js', 'nuxt', 'astro', 'remix', 'jquery', 'tailwind', 'bootstrap',
  'sass', 'webpack', 'vite', 'redux', 'ember', 'backbone',
  // Backend
  'node', 'node js', 'express', 'nest js', 'django', 'flask', 'fastapi',
  'spring', 'spring boot', 'laravel', 'symfony', 'rails', 'ruby on rails',
  'net', 'asp net', 'graphql', 'grpc', 'rest',
  // Datos
  'sql', 'mysql', 'postgresql', 'postgres', 'mongodb', 'redis', 'elasticsearch',
  'cassandra', 'dynamodb', 'oracle', 'sql server', 'sqlite', 'neo4j',
  'snowflake', 'bigquery', 'databricks', 'spark', 'hadoop', 'kafka', 'airflow',
  'dbt', 'pandas', 'numpy',
  // Nube e infraestructura
  'aws', 'azure', 'gcp', 'google cloud', 'docker', 'kubernetes', 'k8s',
  'terraform', 'ansible', 'jenkins', 'github actions', 'gitlab ci', 'circleci',
  'cloudflare', 'vercel', 'heroku', 'nginx', 'linux', 'bash',
  // IA
  'machine learning', 'deep learning', 'tensorflow', 'pytorch', 'scikit learn',
  'openai', 'langchain', 'langgraph', 'llm', 'llms', 'rag', 'nlp',
  'computer vision', 'hugging face', 'mcp',
  // Mobile y otros
  'flutter', 'android', 'ios', 'xamarin', 'ionic',
  'git', 'jira', 'figma', 'salesforce', 'sap', 'sharepoint', 'power bi',
  'tableau', 'excel', 'wordpress', 'shopify', 'stripe',
];

const KNOWN_TOKENS = KNOWN_TECHNOLOGIES.map((name) => ({
  name,
  tokens: tokenize(name),
})).filter((t) => t.tokens.length > 0);

export type SkillMatch =
  /** La pregunta nombra una tecnologia que tenes cargada. */
  | { kind: 'known'; entry: SkillEntry }
  /** Nombra una tecnologia, pero no esta en tu perfil. */
  | { kind: 'unlisted'; name: string };

/**
 * Que tecnologia menciona el texto de la pregunta.
 *
 * Gana la coincidencia mas larga, y eso importa mas de lo que parece:
 * `JavaScript` se normaliza a `java script`, asi que la entrada `Java` tambien
 * matchea. Si no se prefiriera la mas larga, cinco anios de Java se
 * convertirian en cinco anios de JavaScript.
 */
export function detectSkill(text: string, entries: SkillEntry[]): SkillMatch | null {
  const haystack = tokenize(text);
  if (haystack.length === 0) return null;

  // Las dos listas compiten juntas, y no una despues de la otra: si se
  // resolvieran las tuyas primero, `Java` ganaria dentro de `JavaScript` y
  // dos anios de Java se convertirian en dos de JavaScript.
  let best: SkillMatch | null = null;
  let longest = 0;

  for (const candidate of entries) {
    const length = matchLength(haystack, tokenize(candidate.name));
    if (length > longest) {
      best = { kind: 'known', entry: candidate };
      longest = length;
    }
  }

  for (const known of KNOWN_TOKENS) {
    // Estrictamente mas larga: en empate gana la tuya, que es la unica que
    // puede responder con un numero.
    const length = matchLength(haystack, known.tokens);
    if (length > longest) {
      best = { kind: 'unlisted', name: known.name };
      longest = length;
    }
  }

  return best;
}

/**
 * Cuantos tokens del texto consume la tecnologia, o 0 si no aparece.
 *
 * No alcanza con comparar tokens contra tokens. `JavaScript` se parte en
 * `java script` al normalizar, pero escrito en minusculas queda entero, y las
 * dos formas aparecen en formularios reales. Asi que ademas de la comparacion
 * directa se prueban las corridas de tokens pegadas: `java` + `script` tiene
 * que poder encontrar a `javascript`, y al reves.
 */
function matchLength(haystack: string[], tokens: string[]): number {
  if (tokens.length === 0) return 0;
  if (containsTokenSequence(haystack, tokens)) return tokens.length;

  const squashed = tokens.join('');
  for (let i = 0; i < haystack.length; i++) {
    let joined = '';
    for (let j = i; j < haystack.length; j++) {
      joined += haystack[j];
      if (joined === squashed) return j - i + 1;
      if (joined.length >= squashed.length) break;
    }
  }
  return 0;
}

/** Normaliza el nombre para guardarlo sin duplicados que solo cambian de forma. */
export function skillKey(name: string): string {
  return normalize(name);
}
