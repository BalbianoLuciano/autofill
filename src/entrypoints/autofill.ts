/**
 * El script que corre en la pagina.
 *
 * No esta declarado en el manifest a proposito. Los portales de recruiting son
 * infinitos y ninguna lista de `host_permissions` los cubre: derivados de
 * LinkedIn, ATS con dominio propio, carreras alojadas en el sitio de la empresa.
 * En vez de enumerarlos, el popup lo inyecta con `scripting.executeScript` sobre
 * la pestana activa, que es lo que habilita `activeTab`. El permiso dura lo que
 * dura esa interaccion y no da acceso a ninguna otra pestana ni al historial.
 */

import { browser } from 'wxt/browser';
import { applyAnswer, applyLearned, runFill } from '../core/engine';
import type { Message } from '../types';
import { detectLanguage, readJobTitle } from '../core/context';
import { collectFillables } from '../core/matcher';

const READY_FLAG = '__autofillEngineReady';

export default defineUnlistedScript(() => {
  const scope = window as unknown as Record<string, boolean>;
  // El popup inyecta antes de cada corrida; sin esto se acumularian listeners
  // y una sola pregunta tendria varias respuestas.
  if (scope[READY_FLAG]) return;
  scope[READY_FLAG] = true;

  browser.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
    const message = raw as Message;

    switch (message.type) {
      case 'AUTOFILL_PING':
        sendResponse({
          ready: true,
          hostname: location.hostname,
          lang: detectLanguage(document, 'auto'),
          jobTitle: readJobTitle(document),
          // Cuantos campos ve este frame y que iframes tiene adentro. Con eso
          // el popup distingue «esta pagina no tiene formulario» de «el
          // formulario esta en un iframe al que no llegamos».
          controls: collectFillables(document).length,
          frames: nestedFrames(document),
        });
        return;

      case 'AUTOFILL_RUN':
        sendResponse(
          runFill({
            profile: message.profile,
            mappings: message.mappings,
            settings: message.settings,
            questions: message.questions,
            cv: message.cv,
          }),
        );
        return;

      case 'AUTOFILL_ANSWER':
        sendResponse({ ok: applyAnswer(message.signature, message.answer) });
        return;

      case 'AUTOFILL_APPLY_LEARNED':
        sendResponse({
          ok: applyLearned(message.signature, message.key, message.profile, message.settings),
        });
        return;
    }
  });
});

/**
 * Los iframes de este documento, por su URL.
 *
 * Se lee desde el frame que los contiene porque es el unico que los ve: si el
 * iframe es de otro origen, la extension no puede entrar hasta que se le de
 * permiso, y para pedirlo hace falta saber que existe.
 */
function nestedFrames(doc: Document): string[] {
  return Array.from(doc.querySelectorAll('iframe'))
    .map((frame) => frame.src)
    .filter(Boolean);
}
