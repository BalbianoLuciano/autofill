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
import { applyLearned, runFill } from '../core/engine';
import type { Message } from '../types';

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
        sendResponse({ ready: true, hostname: location.hostname });
        return;

      case 'AUTOFILL_RUN':
        sendResponse(
          runFill({
            profile: message.profile,
            mappings: message.mappings,
            settings: message.settings,
          }),
        );
        return;

      case 'AUTOFILL_APPLY_LEARNED':
        sendResponse({
          ok: applyLearned(message.signature, message.key, message.profile, message.settings),
        });
        return;
    }
  });
});
