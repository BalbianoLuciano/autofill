/**
 * El caso que rompio: hireincloud.com es un Wix, y el formulario entero vive
 * en un iframe de filesusr.com. El frame principal no tiene un solo campo, y
 * el motor nunca llegaba al que si los tenia.
 */

import { describe, expect, it } from 'vitest';
import { crossOriginFrames } from './frames';

describe('crossOriginFrames', () => {
  it('delata el iframe de otro dominio que nunca contesto el ping', () => {
    expect(crossOriginFrames([
      {
        hostname: 'www.hireincloud.com',
        frames: ['https://www-hireincloud-com.filesusr.com/html/6e4c15.html'],
      },
    ])).toEqual(['https://www-hireincloud-com.filesusr.com']);
  });

  it('ignora los que ya contestaron: a esos ya llegamos', () => {
    expect(crossOriginFrames([
      { hostname: 'empresa.com', frames: ['https://job-boards.greenhouse.io/empresa'] },
      { hostname: 'job-boards.greenhouse.io', frames: [] },
    ])).toEqual([]);
  });

  it('ignora el mismo origen', () => {
    expect(crossOriginFrames([
      { hostname: 'empresa.com', frames: ['https://empresa.com/form.html'] },
    ])).toEqual([]);
  });

  it('ignora lo que no es un origen que se pueda pedir', () => {
    // about:blank son los frames de tracking, y los blob: los de los widgets.
    expect(crossOriginFrames([
      {
        hostname: 'empresa.com',
        frames: ['about:blank', 'blob:https://empresa.com/1234', 'data:text/html,x', ''],
      },
    ])).toEqual([]);
  });

  it('no repite un dominio que aparece en varios iframes', () => {
    expect(crossOriginFrames([
      {
        hostname: 'empresa.com',
        frames: ['https://ats.io/a', 'https://ats.io/b', 'https://ats.io/c'],
      },
    ])).toEqual(['https://ats.io']);
  });

  it('distingue el puerto y el esquema, que son parte del origen', () => {
    expect(crossOriginFrames([
      { hostname: 'empresa.com', frames: ['https://ats.io:8443/a'] },
    ])).toEqual(['https://ats.io:8443']);
  });
});
