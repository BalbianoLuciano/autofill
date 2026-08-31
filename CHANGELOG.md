# Changelog

Las versiones siguen [SemVer](https://semver.org/lang/es/): se sube el **minor**
cuando entra funcionalidad y el **patch** cuando solo se arreglan cosas. La versión
del manifest sale de `package.json`, así que es la que se ve en `chrome://extensions`
y en el encabezado del popup.

Todavía no está publicada en la Chrome Web Store: se instala descomprimida.

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
