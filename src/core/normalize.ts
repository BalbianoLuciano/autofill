/**
 * Normalizacion de texto.
 *
 * `first_name`, `first-name`, `firstName` y `First Name` son lo mismo, y hay
 * que reducirlos a la misma forma antes de comparar contra el diccionario.
 */

/** Separa camelCase y PascalCase: `firstName` -> `first Name`. */
function splitCamelCase(input: string): string {
  return input
    // minuscula/digito seguida de mayuscula: firstName -> first Name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    // final de acronimo seguido de palabra: URLValue -> URL Value
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
}

/** Saca tildes y diacriticos: `teléfono` -> `telefono`. */
function stripAccents(input: string): string {
  return input.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Minusculas, sin tildes, sin separadores, espacios colapsados.
 * Es la forma canonica: todo lo que se compare pasa por aca.
 */
export function normalize(input: string | null | undefined): string {
  if (!input) return '';
  return stripAccents(splitCamelCase(input))
    .toLowerCase()
    // cualquier cosa que no sea letra o numero es un separador
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Parte en palabras.
 *
 * Comparar por token y no por substring es lo que evita que `name` matchee
 * `company name`, `username` y `filename`.
 */
export function tokenize(input: string | null | undefined): string[] {
  const normalized = normalize(input);
  return normalized ? normalized.split(' ') : [];
}

/**
 * true si `needle` aparece como secuencia contigua de tokens dentro de
 * `haystack`. `['first','name']` esta dentro de `['candidate','first','name']`,
 * pero `['name']` no esta dentro de `['username']` porque `username` es un
 * unico token.
 */
export function containsTokenSequence(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

/**
 * Similitud entre dos textos, 0 a 1. Se usa para elegir la opcion de un
 * `<select>` que mas se parece al valor del perfil.
 *
 * Combina coincidencia de tokens con prefijo comun, que es lo que distingue
 * `Argentina` de `Armenia` cuando el valor es `argent`.
 */
export function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const ta = new Set(tokenize(na));
  const tb = new Set(tokenize(nb));
  let shared = 0;
  for (const token of ta) if (tb.has(token)) shared++;
  const tokenScore = shared / Math.max(ta.size, tb.size);

  // Uno contiene al otro entero: `argentina` dentro de `argentina (arg)`.
  //
  // Con un minimo de tres caracteres y proporcional a cuanto cubre. Sin eso,
  // el `1` de un `<option value="1">` queda contenido en `c1` y se lleva el
  // puesto de la opcion correcta: una coincidencia de un caracter valia lo
  // mismo que una frase entera.
  const [shorter, longer] = na.length <= nb.length ? [na, nb] : [nb, na];
  const containment =
    shorter.length >= 3 && longer.includes(shorter)
      ? 0.6 + 0.35 * (shorter.length / longer.length)
      : 0;

  let prefix = 0;
  const limit = Math.min(na.length, nb.length);
  while (prefix < limit && na[prefix] === nb[prefix]) prefix++;
  const prefixScore = prefix / Math.max(na.length, nb.length);

  return Math.max(tokenScore, containment, prefixScore * 0.9);
}
