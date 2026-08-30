import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'Autofill',
    description:
      'Rellena formularios de aplicacion laboral con un click. Todo queda en el dispositivo.',
    // activeTab en vez de una lista de host_permissions: los portales de
    // recruiting son infinitos y ninguna lista los cubre. El permiso se
    // concede solo para la pestana activa y solo cuando abris el popup.
    permissions: ['activeTab', 'scripting', 'storage', 'downloads'],
    action: {
      default_title: 'Autofill — rellenar formulario',
    },
    commands: {
      _execute_action: {
        suggested_key: { default: 'Alt+Shift+F' },
        description: 'Abrir Autofill',
      },
    },
  },
});
