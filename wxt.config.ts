import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'Autofill',
    description:
      'Fill job application forms in one click. Everything stays on your device.',
    // activeTab en vez de una lista de host_permissions: los portales de
    // recruiting son infinitos y ninguna lista los cubre. El permiso se
    // concede solo para la pestana activa y solo cuando abris el popup.
    // `unlimitedStorage` por los CVs: la cuota por defecto de storage.local es
    // ~10MB y cuatro archivos de hasta 5MB no entran.
    permissions: ['activeTab', 'scripting', 'storage', 'unlimitedStorage', 'downloads'],
    // activeTab concede permiso sobre el origen del frame PRINCIPAL, y nada
    // mas. El formulario de Greenhouse dentro de la web de la empresa vive en
    // un iframe de otro origen, y ahi el motor nunca llegaba: la pagina se
    // leia entera y no habia un solo campo que tocar.
    //
    // Opcional y no fijo para no romper la promesa: al instalar no se pide
    // nada, y el permiso se concede por dominio, desde el panel, cuando hace
    // falta. Se revoca desde chrome://extensions como cualquier otro.
    optional_host_permissions: ['<all_urls>'],
    action: {
      default_title: 'Autofill — fill this form',
    },
    commands: {
      _execute_action: {
        suggested_key: { default: 'Alt+Shift+F' },
        description: 'Open Autofill',
      },
    },
  },
});
