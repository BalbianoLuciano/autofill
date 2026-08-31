# Contribuir

Gracias por pasar. Esto se mantiene en castellano, pero **los issues y PRs en
inglés son igual de bienvenidos**.

```bash
npm install
npm test          # tiene que quedar en verde antes de abrir el PR
npm run dev       # Chrome de desarrollo con hot reload
```

## Por dónde empezar

### Sumar aliases al diccionario — el aporte más útil

`src/core/fields.ts` es data pura: 26 campos y las formas en que un formulario
puede pedirlos. Si encontraste un portal que dice el campo de una manera que no
está, agregarla es una línea.

**Una regla que hay que respetar:** el matcher compara por token, no por
substring, y trata distinto los aliases de una sola palabra. Un alias de una
palabra solo cuenta si es *distintivo*, es decir, si ningún otro campo lo usa. Si
agregás `nombre` a un campo nuevo, `nombre` deja de ser distintivo para
`firstName` y ese campo pasa a exigir coincidencia exacta.

No hay que tocar nada para eso: el índice se calcula solo desde el diccionario.
Pero **corré los tests**, que es justo lo que verifican.

### Adaptadores por ATS

Lo que más falta. Formularios en varios pasos, y los combobox custom de Workday
y Ashby: no son `<select>` sino un `div` con una lista que aparece al tipear.
Hoy se escribe el texto pero no se elige la opción.

### Un portal donde no funciona

Es un issue perfecto. Contá qué portal, qué campos no reconoció y, si podés,
pegá el HTML del input (sin tus datos). Con `name`, `id` y el `<label>` alcanza.

## Cómo agregar un test

Los tests arman formularios de verdad con happy-dom. Mirá
`src/core/matcher.test.ts`: si reportás un portal que falla, un test con su HTML
es el mejor PR posible.

## Lo que no va a entrar

- **Enviar la aplicación automáticamente.** Esto rellena; la persona revisa y
  envía. No es negociable.
- **Rellenar los seis campos sensibles por defecto.** Salario, permiso de
  trabajo, patrocinio de visa, documento, dirección y carta. Un valor equivocado
  ahí quema la aplicación.
- **Mandar datos a cualquier servidor.** No hay backend y no lo va a haber. Si
  algún día entra un LLM, va a ser opt-in y explícito.

## Estilo

Los comentarios explican **por qué**, no qué. Si algo está hecho de una forma
rara porque la obvia no funciona (el setter nativo de `filler.ts` es el caso
típico), eso es exactamente lo que hay que dejar escrito.
