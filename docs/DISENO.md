# Decisiones de diseño

> Por qué la extensión está hecha como está. Este documento nació como spec de
> construcción y quedó como registro de las decisiones y del razonamiento detrás
> de cada una. Si vas a tocar el matcher o el motor, leelo antes.

---

## 1. Qué es

Una extensión de Chrome que rellena formularios de aplicación laboral con un click.

El problema: cada portal pide los mismos datos (nombre, LinkedIn, GitHub, portfolio,
años de experiencia) con nombres distintos, y copiar y pegar en cada uno consume más
tiempo que escribir la aplicación.

La solución tiene tres partes:

1. **Diccionario** — cada dato del perfil y las ~300 formas en que un formulario puede pedirlo
2. **Motor** — encuentra los campos en la página y los completa
3. **Memoria** — guarda el perfil y aprende los campos que no supo mapear

**No** es un bot que aplica solo. Rellena y la persona revisa y envía.

---

## 2. Decisiones ya tomadas

| Decisión | Por qué |
|---|---|
| Extensión, no Playwright | Playwright levanta su propio navegador y se pierden las sesiones iniciadas |
| Manifest V3 | MV2 ya no se acepta en la Chrome Web Store |
| `chrome.storage.local` | ~10MB, persistente, local. **No** usar `storage.sync`: 8KB por item y son datos personales |
| Sin backend | No hace falta base de datos ni servidor |
| Sin LLM en v1 | Las heurísticas cubren la mayoría. El LLM es v2 y va como fallback |
| WXT como framework | Sobre Vite, hot reload real, TypeScript. `wxt.dev` |

### Campos sensibles

Seis campos **no se rellenan solos**: se resaltan para completar a mano.

`salaryExpectation` · `workAuthorization` · `requiresSponsorship` · `nationalId` · `address` · `coverLetter`

Un salario mal puesto o un "requiero visa" equivocado queman la aplicación. Se piensan
caso por caso.

---

## 3. Estructura

```
autofill/
├── wxt.config.ts
├── package.json
├── tsconfig.json
└── src/
    ├── core/
    │   ├── fields.ts        # diccionario (YA ESCRITO, ver §4)
    │   ├── matcher.ts       # encuentra qué campo es cada input
    │   ├── filler.ts        # escribe el valor de forma que React lo registre
    │   └── storage.ts       # perfil + mappings aprendidos
    ├── entrypoints/
    │   ├── content.ts       # corre en la página
    │   ├── background.ts    # service worker
    │   └── popup/           # el botón y la revisión
    └── types.ts
```

---

## 4. El diccionario

**Ya está escrito** en `~/Documents/PersonalRepos/autofill/src/core/fields.ts`.
Moverlo al repo nuevo. Son 26 campos y 298 formas de reconocerlos, en inglés,
español, francés, alemán y portugués.

Si el archivo no está, regenerarlo con esta forma:

```ts
export interface FieldDef {
  key: FieldKey;
  autocomplete?: string[];   // valores del atributo estándar
  aliases: string[];         // fragmentos a buscar en label/name/id/placeholder
  sensitive?: boolean;       // true = no se rellena solo
  multiline?: boolean;
}
```

Claves: `firstName` `lastName` `fullName` `email` `phone` `linkedin` `github`
`portfolio` `otherUrl` `city` `country` `address` `postalCode` `currentTitle`
`currentCompany` `yearsExperience` `salaryExpectation` `noticePeriod` `startDate`
`workAuthorization` `requiresSponsorship` `nationalId` `englishLevel` `education`
`coverLetter` `howDidYouHear`

---

## 5. El matcher

Cascada, de más confiable a menos. Se corta en el primer acierto.

1. **Mapping aprendido** para ese hostname (§7). Gana siempre.
2. **`autocomplete`** — el único atributo estándar. Si el formulario lo declara bien,
   no hay que adivinar. Muchos ATS lo hacen.
3. **`<label>` asociado** — vía `for=`, o el label ancestro.
4. **`name` / `id` / `placeholder` / `aria-label`**, normalizados.
5. **Texto cercano** en el DOM, para inputs sin label.

Normalizar antes de comparar: minúsculas, sin tildes, sin separadores
(`first_name`, `first-name`, `firstName` y `First Name` son lo mismo).

**Comparar por token, no por substring.** `name` como substring matchea `company name`,
`username` y `filename`. Partir en palabras y comparar conjuntos.

### Casos que van a romper

- **Shadow DOM e iframes** — Workday es el peor. Recorrer `shadowRoot` y los iframes
  del mismo origen. Dejarlo para el final.
- **Selects y radios** — no alcanza con escribir: hay que elegir la opción cuyo texto
  más se parezca al valor.
- **Campos que aparecen después** — usar `MutationObserver`, no un scan único.

---

## 6. El relleno (lo más importante)

**Los inputs controlados por React ignoran `element.value = x`.** El campo se ve lleno
y el formulario se envía vacío. Greenhouse, Lever y Ashby son todos React.

```ts
export function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
```

Para `<select>`: setear `value` y disparar `change`. Si ninguna opción coincide exacto,
buscar la más parecida y, si no hay nada razonable, dejarlo sin tocar y marcarlo.

---

## 7. Almacenamiento

```ts
type Store = {
  profile: Record<FieldKey, string>;
  mappings: {
    // hostname -> firma del campo -> clave del perfil
    [hostname: string]: { [signature: string]: FieldKey };
  };
  settings: { fillSensitive: boolean };  // default: false
};
```

La firma de un campo: `name` si existe, si no `id`, si no el texto del label
normalizado. Estable entre visitas al mismo formulario.

Incluir **exportar e importar JSON**, para que los datos no queden atrapados en el
navegador.

---

## 8. El popup

Un botón grande: **Rellenar**. Debajo, el resultado del último intento:

- Cuántos campos completó
- Los **sensibles** que encontró y dejó vacíos a propósito
- Los **sin mapear**: cada uno con su label y un desplegable para asignarlo a una clave
  del perfil. Al elegir, se guarda el mapping y se rellena.

Ese último punto es el aprendizaje: la próxima vez en ese sitio ya lo sabe.

---

## 9. Privacidad

- Todo en `chrome.storage.local`. Nada sale del dispositivo.
- `host_permissions` acotado a los dominios que se usen. **No** `<all_urls>`.
- El repo puede ser público, pero **el perfil con los datos reales nunca se commitea**.
  Va en `storage`, no en el código. Incluir `profile.example.json` con datos ficticios.

---

## 10. Setup

```bash
mkdir -p ~/Documents/PersonalRepos/autofill && cd ~/Documents/PersonalRepos/autofill
npx wxt@latest init . --template vanilla-ts
npm install
```

### Instalarla en Chrome

```bash
npm run build
```

Después `chrome://extensions` → Modo desarrollador → Cargar descomprimida →
`.output/chrome-mv3`.

---

## 11. Orden de trabajo

1. Esqueleto WXT + `fields.ts` movido
2. `storage.ts` con perfil y export/import
3. `matcher.ts` con la cascada (sin shadow DOM todavía)
4. `filler.ts` con el setter nativo
5. `content.ts` que escucha el mensaje del popup y rellena
6. Popup con el botón y el resultado
7. Aprendizaje de campos sin mapear
8. Recién ahí: shadow DOM, iframes, adaptadores por ATS

Probar contra un formulario real de Greenhouse o Lever desde el paso 5.

---

## 12. Qué cambió respecto de esta spec

Dos cosas se decidieron distinto durante la construcción:

**No hay `host_permissions`.** La spec original pedía acotarlos a una lista de
dominios. No escala: hay ATS con dominio propio, páginas de carreras alojadas en
el sitio de cada empresa y los derivados de LinkedIn. Cualquier lista queda
corta. Se usa `activeTab` + `scripting`, y el motor se inyecta bajo demanda sobre
la pestaña activa. Ver el README.

**Se agregó "no pisar lo que ya está escrito"**, apagado por defecto. Varios ATS
prellenan el formulario parseando el CV, y esas respuestas suelen ser mejores que
un valor genérico del perfil.
