# Autofill

Extensión de Chrome que rellena formularios de aplicación laboral con un click.

Cada portal pide los mismos datos con nombres distintos. Esto los reconoce y los
completa. **No** aplica solo: rellena, y la persona revisa y envía.

---

## Cómo funciona

Tres partes:

- **Diccionario** (`src/core/fields.ts`) — 26 campos del perfil y 315 formas en que un
  formulario puede pedirlos, en inglés, español, francés, alemán y portugués.
- **Motor** (`matcher.ts` + `filler.ts` + `engine.ts`) — encuentra los campos en la
  página y los completa.
- **Memoria** (`storage.ts`) — guarda el perfil y aprende los campos que no supo mapear.

### Por qué no hay lista de sitios

Los portales de recruiting no se pueden enumerar: hay ATS con dominio propio, páginas
de carreras alojadas en el sitio de cada empresa, y los derivados de LinkedIn que se
abren al clickear "Solicitar". Una lista de `host_permissions` siempre queda corta.

En vez de eso el manifest pide **`activeTab`**: no da acceso a nada hasta que abrís el
popup, y ahí concede permiso sobre esa pestaña y solo esa. El motor no está declarado
en el manifest; el popup lo inyecta con `scripting.executeScript` en el momento de
rellenar. Estés donde estés, funciona; y la extensión no puede leer ninguna pestaña
que no hayas abierto vos con el botón.

Se inyecta en todos los frames, porque los ATS embebidos (Greenhouse dentro de la web
de la empresa es el caso típico) viven en un iframe.

### La cascada

El matcher prueba de más confiable a menos y se corta en el primer acierto:

1. **Mapping aprendido** para ese hostname. Gana siempre.
2. **`autocomplete`** — el único atributo estándar, cuando el valor tiene un solo dueño.
   `url` lo declaran LinkedIn, GitHub, portfolio y otros: no dice nada y se sigue bajando.
3. **`<label>` asociado** — vía `for=`, label ancestro o `aria-labelledby`.
4. **`name` / `id` / `aria-label` / `placeholder` / `data-testid`**.
5. **Texto cercano** en el DOM, para inputs sin label.

Todo se normaliza antes de comparar: `first_name`, `first-name`, `firstName` y
`First Name` son lo mismo.

La comparación es **por token, no por substring**. Si no, `name` matchea `company name`,
`username` y `filename`. Un alias de varias palabras cuenta si aparece como secuencia
contigua; uno de una sola palabra cuenta entero solo si es distintivo (`linkedin` lo usa
un campo, `name` lo usan cuatro y entonces exige coincidencia exacta).

### El relleno

Lo más importante del proyecto son diez líneas en `filler.ts`.

Los inputs controlados por React **ignoran `element.value = x`**: React guarda el último
valor que él escribió, ve que coincide y descarta el evento. El campo se ve lleno y el
formulario se envía vacío. Greenhouse, Lever y Ashby son todos React.

La salida es llamar al setter nativo del prototipo, que escribe sin pasar por el
descriptor que React instaló en la instancia, y recién ahí disparar `input` y `change`.

Para `<select>` y radios se elige la opción cuyo texto más se parece al valor. Si
ninguna llega al umbral no se toca nada y se reporta: mejor vacío que el país equivocado.

---

## Los seis campos sensibles

`salaryExpectation` · `workAuthorization` · `requiresSponsorship` · `nationalId` ·
`address` · `coverLetter`

No se rellenan solos. Se resaltan en naranja para completarlos a mano. Un salario mal
puesto o un "requiero visa" equivocado queman la aplicación, y se piensan caso por caso.

Hay un ajuste para rellenarlos igual, apagado por defecto.

---

## Privacidad

- Todo vive en `chrome.storage.local`. Nada sale del dispositivo: no hay backend, no hay
  base de datos, no hay telemetría.
- `storage.sync` está descartado a propósito: 8KB por item, y estos datos no tienen por
  qué viajar a los servidores de Google.
- Sin `<all_urls>`. Los permisos son `activeTab`, `scripting`, `storage` y `downloads`
  (este último solo para el botón Exportar).
- **El perfil real nunca se commitea.** `profile.example.json` tiene datos ficticios y
  muestra la forma del JSON que acepta Importar.

---

## Desarrollo

```bash
npm install
npm run dev      # carga la extensión en un Chrome de desarrollo, con hot reload
npm test         # 31 tests sobre el matcher y el motor
npm run build    # .output/chrome-mv3
npm run zip      # paquete para la Chrome Web Store
```

Para instalarla en el Chrome de todos los días: `npm run build`, después
`chrome://extensions` → Modo desarrollador → Cargar descomprimida → `.output/chrome-mv3`.

### Estructura

```
src/
├── core/
│   ├── fields.ts      # el diccionario
│   ├── normalize.ts   # texto a forma canónica, tokens, similitud
│   ├── matcher.ts     # la cascada + recorrido del DOM y shadow DOM
│   ├── filler.ts      # el setter nativo, selects, radios, resaltado
│   ├── engine.ts      # arma el informe aplicando las políticas
│   └── storage.ts     # perfil, mappings aprendidos, export/import
├── entrypoints/
│   ├── autofill.ts    # el script que se inyecta en la página
│   ├── background.ts  # service worker
│   └── popup/         # el botón, el resultado y el editor del perfil
└── types.ts
```

---

## Uso

1. Abrí el popup, pestaña **Perfil**, completá los datos y guardá.
2. En un formulario de aplicación, abrí el popup y clickeá **Rellenar**.
3. Revisá el resultado:
   - verde: completado
   - naranja: sensible, lo completás vos
   - gris: no lo reconoció

Los que no reconoció traen un desplegable para asignarlos a un campo del perfil. Al
elegir, se guarda el mapping para ese hostname y se rellena en el momento. **La próxima
vez en ese sitio ya lo sabe** — y como el mapping se guarda por el hostname del frame,
lo aprendido en `boards.greenhouse.io` sirve para todas las empresas que usen Greenhouse.

Atajo: `Alt+Shift+F` abre el popup.

---

## Pendiente

- **Adaptadores por ATS** para los formularios en varios pasos.
- **Combobox custom** (Workday, Ashby): inputs que no son `<select>` sino un `<div>` con
  una lista que aparece al tipear. Hoy se completa el texto pero no se elige la opción.
- **`MutationObserver`** para los campos que aparecen después de un scan.
- **LLM como fallback** para los campos que la heurística no reconoce. Va después, y solo
  como último paso de la cascada.
