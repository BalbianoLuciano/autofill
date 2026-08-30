/**
 * Service worker.
 *
 * Casi no hace nada y esta bien que sea asi: sin backend, sin base de datos y
 * sin nada que salga del dispositivo, el trabajo real pasa en el popup y en la
 * pagina. Lo unico que vive aca es el atajo de teclado.
 */

import { browser } from 'wxt/browser';

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') {
      // Primera instalacion: el perfil esta vacio, hay que llenarlo.
      void browser.action.openPopup?.().catch(() => {});
    }
  });
});
