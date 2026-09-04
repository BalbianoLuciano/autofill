/**
 * Que iframes de la pagina quedaron fuera de alcance.
 *
 * `activeTab` concede permiso sobre el origen del frame principal y nada mas.
 * Un iframe de otro origen —el Greenhouse embebido en la web de la empresa, o
 * el bloque HTML de Wix, que es un dominio aparte— no recibe el motor: ni
 * siquiera contesta el ping. La unica forma de saber que existe es
 * preguntarselo al frame que lo contiene, que si lo ve.
 */

/** Lo que cada frame vivo cuenta de si mismo cuando se lo pinguea. */
export interface FrameView {
  hostname: string;
  /** Las URLs de los iframes que tiene adentro. */
  frames?: string[];
}

/**
 * Los origenes que hay que pedir para poder tocar lo que hay adentro.
 *
 * Se descartan los que ya contestaron —esos son alcanzables— y todo lo que no
 * sea http(s): `about:blank`, los `blob:` de los widgets y los `data:` no son
 * un origen que se pueda pedir.
 */
export function crossOriginFrames(views: FrameView[]): string[] {
  const alcanzables = new Set(views.map((v) => v.hostname));
  const origenes = new Set<string>();

  for (const view of views) {
    for (const src of view.frames ?? []) {
      let url: URL;
      try {
        url = new URL(src);
      } catch {
        continue;
      }
      if (url.protocol !== 'https:' && url.protocol !== 'http:') continue;
      if (alcanzables.has(url.hostname)) continue;
      origenes.add(url.origin);
    }
  }

  return [...origenes];
}
