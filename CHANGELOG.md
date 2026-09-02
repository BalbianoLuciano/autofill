# Changelog

Las versiones siguen [SemVer](https://semver.org/lang/es/): se sube el **minor**
cuando entra funcionalidad y el **patch** cuando solo se arreglan cosas. La versión
del manifest sale de `package.json`, así que es la que se ve en `chrome://extensions`
y en el encabezado del popup.

Todavía no está publicada en la Chrome Web Store: se instala descomprimida.

## 1.7.0

**Bruto o neto, y las pagas del año.**

Dos formularios pueden pedir el mismo sueldo y esperar números distintos. «Salario bruto
anual» y «neto mensual» no son el mismo dato con otro formato: entre uno y otro está el
impuesto, y en España el anual se cobra en catorce pagas y no en doce. La extensión
contestaba los dos casos con la misma cuenta.

- **El perfil guarda si el monto es bruto o neto**, o ninguno de los dos. Sin aclarar es
  una opción válida —el caso de quien nunca hizo la distinción— y ese monto sirve para
  las dos preguntas.
- **Entre bruto y neto no se convierte**, por la misma razón que no se convierte entre
  monedas: depende del país, del tramo y de la situación personal de cada uno. Si el
  formulario pide bruto y solo cargaste neto, se avisa en vez de estimar.
- **Pagas por año**, 12 o 14. No es un detalle de nómina: 30.000 € anuales son 2.500 al
  mes en 12 pagas y 2.142 en 14. Un 17% de diferencia en el número que más se mira de la
  postulación.
- La conversión pasa ahora por el **total anual**, que es la única unidad que no depende
  de cómo se reparta el pago. La tarifa horaria sigue saliendo de doce meses de trabajo,
  porque las horas se trabajan igual aunque el sueldo se cobre en catorce.
- Se pueden cargar **tres montos** en vez de dos: el mismo sueldo en bruto y en neto ya
  no deja sin lugar a una segunda moneda.

**Arreglado**

- «2300 eur en mano» se guardaba como sueldo **anual**. El período se detectaba buscando
  `ano` dentro del texto, y `ano` está adentro de `m-ano-`: el sueldo mensual salía
  después dividido por doce.

## 1.6.1

**Guardabas el perfil y no te enterabas.**

El aviso de «Perfil guardado» estaba *después* del bloque fijo, o sea al final de un
formulario de 38 campos: aparecía fuera de la pantalla, justo donde no estabas mirando.

- **Confirma el propio botón**, que se pone verde con «✓ Perfil guardado». Es lo único
  imposible de no ver, porque es lo que acabás de apretar. Lo mismo al guardar un CV.
- El renglón de aviso pasó adentro del bloque fijo y queda solo para los errores. Vacío
  no ocupa lugar.
- El bloque fijo dejó de quedar pegado al borde del popup, y el desvanecido de arriba
  ahora termina donde empieza el botón: antes el campo que venía scrolleando se veía
  pegado atrás y todo el conjunto se leía como contenido cortado.

## 1.6.0

**Años de experiencia, por tecnología.**

Hasta acá había un solo número. Un formulario de IT pregunta por seis tecnologías en la
misma pantalla y las seis recibían el mismo valor: si tenés cinco años de experiencia,
la extensión afirmaba cinco años de Kubernetes. Eso no es un dato incompleto, es una
afirmación falsa que queda por escrito en la postulación.

Ahora el perfil guarda un total general y una fila por tecnología, y se lee del label de
qué tecnología habla cada pregunta — el mismo mecanismo que ya resuelve «¿podés trabajar
en la UE?» leyendo de qué país habla.

- Si la pregunta nombra una tecnología que tenés, contesta esa.
- Si nombra una que **no** tenés, deja el campo vacío y lo reporta, en vez de repetir el
  total.
- Si es general, contesta el total.

**Detalles que importan**

- Gana la coincidencia más larga y las dos listas compiten juntas: `React Native` le gana
  a `React`, y `JavaScript` le gana a `Java`. Sin eso, un año de React Native se
  convertía en cinco.
- `JavaScript` se parte en `java script` al normalizar pero en minúsculas queda entero, y
  las dos formas aparecen en formularios reales; se comparan también las corridas de
  tokens pegadas, en las dos direcciones.
- El diccionario aprendió la forma corta con la que los formularios de IT preguntan por
  cada tecnología: «¿Cuántos años **con** React?», «Years **with** Kubernetes».
- El número que ya tenías cargado se conserva como total general.

102 tests.

## 1.5.0

Primera pasada contra un formulario real (Teamtailor). Cuatro cosas rotas.

**Arreglado**

- **Las preguntas en grupos de radios no se podían contestar.** Una pregunta propia de la
  empresa —«¿Tenés experiencia integrando APIs de LLMs?», Sí/No— quedaba como «sin
  reconocer» y no había forma de responderla. Ahora aparece en el panel con sus opciones
  reales para elegir, y la elección se guarda para la próxima.
- **Las escalas inventadas por cada empresa no coincidían.** El perfil dice B2 y el
  formulario ofrece «Intermedio - me siento con comodidad para leer y escribir pero no a
  nivel conversacional». Ningún sinónimo va a cubrir todas las escalas posibles, así que
  ahora se ofrece elegir una vez y esa elección se reusa por pregunta.
- **`experiencia` como alias suelto era un imán de falsos positivos.** «¿Tenés
  experiencia integrando APIs?» se identificaba como el campo de años de experiencia. Se
  quita, y además una pregunta con opciones ahora exige un alias de varias palabras: una
  palabra suelta dentro de una pregunta larga no dice nada.
- **El matcher detectaba los controles del propio panel.** Como recorre shadow DOM, veía
  el `<select>` que el overlay inyecta y lo trataba como un campo del formulario.

**Nota sobre el salario**

El slider *sí* se reconoce y se resuelve a la cifra correcta, convertida al período y la
moneda que pide el label. No se completa porque el salario es un campo sensible: hay que
habilitar «Rellenar los campos sensibles» en Ajustes. El popup ya muestra la cifra que
corresponde, con botón para copiarla.

90 tests, ocho de ellos calcados de un formulario real.

## 1.4.1

- **El popup no scrolleaba.** El `body` tenía `max-height: 580px` con `overflow-y: auto`,
  pero en un popup el que scrollea es `html`. Al limitar el `body`, el popup se
  dimensionaba a esa altura y `html` quedaba sin nada que scrollear: los campos de abajo
  eran inalcanzables. Ahora el `body` no se limita y scrollea el documento, que es lo que
  Chrome ya hace topando el popup en 600px.
- Se saca el estilo propio de la barra de scroll: convertía la barra *overlay* de macOS,
  que no ocupa espacio, en una clásica que sí lo ocupa, y esos píxeles se sumaban al ancho
  y sacaban una barra horizontal.

## 1.4.0

- **El nombre con el que se sube el CV ahora se elige.** Antes viajaba el nombre que el
  archivo tenía en el disco, que es lo primero que ve quien abre la aplicación:
  `BALBIANO_LUCIANO_CV_en.pdf` no se lee igual que `cv_balbiano_luciano_es.pdf`. Se
  propone al elegir el archivo, se puede cambiar al guardarlo, y se corrige después
  clickeándolo en la tarjeta. Se sanea de barras y caracteres raros, y se le conserva la
  extensión.
- La etiqueta y el nombre de subida quedaron separados y explicados: una es para vos, en
  la lista; el otro es lo que ve el otro lado.
- Se suprime el tooltip nativo «No file chosen» del input de archivo.

## 1.3.0

Rediseño del popup.

- **Helvetica Neue** como fuente, con su pila de respaldo. Es lo que pide un panel
  denso de formularios: neutra, sin personalidad que compita con el contenido, y con
  dígitos que se alinean en las columnas de sueldo.
- **El «Choose file» nativo se fue.** No se puede estilar y cada plataforma lo dibuja
  distinto. En su lugar hay una zona de arrastre que acepta el archivo soltándolo o
  haciendo click, y que muestra cuál quedó elegido y cuánto pesa.
- **Los ajustes salen de Perfil a su propia pestaña.** Estaban enterrados debajo de un
  formulario de 38 campos, que es el peor lugar posible para algo como «enviar la
  aplicación automáticamente».
- **Switches en vez de casillas** para los ajustes, con una línea que explica qué hace
  cada uno y qué pasa si se prende.
- Pestañas como control segmentado, selects con su propio chevron (el nativo cambia en
  cada sistema), tarjetas para los CVs con el elegido marcado, y «Guardar perfil» fijo
  al pie para no tener que scrollear hasta el fondo.

## 1.2.0

De rellenar a resolver la aplicación entera: adjunta el CV, contesta las preguntas
abiertas y —si se lo habilita— envía.

**Nuevo**

- **Pool de CVs.** Se guardan varios y se elige por el idioma del formulario y por el
  puesto que anuncia la página (si dice *lead*, *manager* o *head*, va el de liderazgo).
  Se adjunta construyendo un `FileList` con `DataTransfer`, que es el único camino:
  `input.files` es de solo lectura por seguridad.
- **Preguntas abiertas.** Las que el diccionario no cubre («describí la automatización
  más compleja que construiste») aparecen en un panel sobre la página, con espacio para
  contestarlas. La respuesta se guarda apenas se escribe y se reusa por similitud la
  próxima vez que aparezca una parecida.
- **Envío automático**, apagado por defecto. Exige tres condiciones a la vez: el ajuste
  prendido, nada obligatorio vacío y un botón identificable dentro del formulario que se
  rellenó. Antes de clickear muestra una cuenta regresiva cancelable, porque enviar no se
  puede deshacer y varios ATS bloquean volver a postularse al mismo puesto.
- **Fecha de inicio como opción con fecha real detrás.** `Inmediata` se convierte en la
  fecha de hoy con el formato que pide el input.

**Arreglado**

- Los `<input type="range">` estaban en la lista de ignorados, así que un salario que
  venía como slider se salteaba en silencio. Ahora se acota la pretensión al rango y se
  respeta el `step`.
- Los `<input type="date">` sí se procesaban, pero recibían texto («Lo más próximo») y lo
  descartaban sin decir nada: quedaban tan vacíos como antes, pero parecía que había
  funcionado.

**Permisos**

- Se suma `unlimitedStorage`: la cuota por defecto de `storage.local` es ~10 MB y cuatro
  CVs de hasta 5 MB no entran.

38 campos, 385 aliases, 82 tests.

## 1.1.0

El perfil dejó de guardar texto plano y pasó a guardar **intención**. Un formulario no
pide «salario», pide *expected annual salary (USD)*; y no pregunta «permiso de trabajo»,
pregunta *are you authorized to work in the EU?* con dos radios.

**Nuevo**

- **Idioma.** Se detecta de `<html lang>` y, si el sitio no lo declara, contando palabras
  funcionales. Los campos de texto libre admiten variante en inglés; los enumerados se
  renderizan solos en cada idioma. Se puede forzar desde los ajustes.
- **Salario estructurado.** Monto + moneda + período, una entrada por moneda. Convierte
  entre hora, mes y año según lo que pida el label. Entre monedas no convierte.
- **Permiso de trabajo por regiones.** Contesta «¿podés trabajar en X?» por sí o por no.
  El patrocinio de visa se deduce de ahí, invertido.
- **Los sensibles se resuelven aunque no se rellenen.** El popup muestra el valor que
  corresponde a ese campo, con un botón para copiarlo.
- **12 campos nuevos**: pronombres, modalidad preferida, disposición a mudarse, salario
  actual, otros idiomas, situación migratoria, fecha de nacimiento, quién te refirió y
  los cuatro campos EEO de los formularios estadounidenses.
- Migración automática desde los perfiles de la 1.0.

**Arreglado**

- `similarity('1', 'c1')` daba 0.75 porque `'1'` está contenido en `'c1'`: un
  `<option value="1">` le ganaba a la opción correcta. La contención ahora exige tres
  caracteres y puntúa proporcional a cuánto cubre.
- Al leer un sueldo escrito a mano, el segundo monto de «2500 usd o 3500000» heredaba el
  `usd` del primero y se descartaba por duplicado.

38 campos, 385 aliases, 61 tests.

## 1.0.0

Primera versión completa.

- **Diccionario** de campos con aliases en cinco idiomas.
- **Cascada de cinco pasos** para identificar cada campo, comparando por token y no por
  substring.
- **Setter nativo del prototipo**, que es lo que hace que React registre el cambio en vez
  de descartarlo.
- **`activeTab` en vez de `host_permissions`**: el motor se inyecta bajo demanda en la
  pestaña activa y en sus iframes, así funciona en cualquier portal sin enumerar ninguno.
- **Aprendizaje**: los campos sin reconocer se asignan desde el popup y quedan guardados
  contra el hostname del frame.
- Exportar e importar el perfil en JSON.

**Arreglado antes de publicar**

- `action.openPopup()` desde `onInstalled` siempre fallaba: exige un gesto del usuario.
- Exportar se cancelaba solo, porque el diálogo de guardado cierra el popup y el blob
  muere con su documento.
- `autocomplete="given-name"` se resolvía como nombre completo: partir el valor por el
  guion convertía `given-name` en `name`.
