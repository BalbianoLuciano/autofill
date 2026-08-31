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
    if (reason !== 'install') return;

    // `action.openPopup()` exige un gesto del usuario, y `onInstalled` no lo
    // es: desde aca siempre falla. La misma pagina abierta como pestana sirve
    // igual de onboarding, y no hay nada que rellenar hasta que el perfil
    // tenga datos.
    void browser.tabs.create({
      url: `${browser.runtime.getURL('/popup.html')}?onboarding=1`,
    });
  });
});
