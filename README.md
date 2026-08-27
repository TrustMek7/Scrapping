# PostScope

Piloto local para obtener una única publicación de Facebook a partir de una URL introducida manualmente. Extrae y muestra autor, texto e imágenes; ignora videos, comentarios, publicaciones relacionadas y el resto del feed.

## Requisitos

- Node.js `>=20.9.0`. Se recomienda Node 24 LTS (`.nvmrc`); el piloto también fue probado con Node 26.7.0.
- npm `>=10`.
- Linux, macOS o Windows/WSL con entorno gráfico para el login manual.
- Una cuenta de Facebook y acceso legítimo a las publicaciones consultadas.

Versiones principales:

- Next.js `16.3.3`.
- React `19.2.8`.
- Playwright `1.62.1`.
- TypeScript 5.
- Tailwind CSS 4.

## Instalación

```bash
nvm use
npm install
npx playwright install chromium
```

En Linux, si faltan dependencias del sistema:

```bash
npx playwright install --with-deps chromium
```

Playwright muestra una advertencia y usa su build fallback de Ubuntu 24.04 en Arch Linux; el smoke test y el flujo real fueron verificados correctamente en ese entorno.

## Ejecución

```bash
npm run dev
```

Abre `http://localhost:3000`.

No hay variables de entorno obligatorias, por lo que el proyecto no necesita `.env` ni `.env.example`. `FACEBOOK_SESSION_PROFILE` se usa internamente para aislar el perfil E2E `test` del perfil real `default`.

## Uso

1. Pulsa **Iniciar sesión** si la sesión figura como no iniciada o expirada.
2. Completa email, contraseña, 2FA, CAPTCHA o checkpoint manualmente en la ventana de Facebook.
3. Pega una URL de publicación soportada.
4. Pulsa **Obtener publicación**.
5. Revisa autor, texto, imágenes y URL original.

El navegador de login se cierra automáticamente cuando la app detecta una sesión activa. La aplicación nunca solicita, almacena ni automatiza credenciales.

Formatos soportados:

- `https://www.facebook.com/share/p/<id>/`
- `https://www.facebook.com/share/<id>/`
- URLs cuyo path contiene `/posts/<id>`.
- `story.php` o `permalink.php` con `story_fbid`.
- `photo.php` o `/photo/` con `fbid`.

Se rechazan HTTP, credenciales embebidas, puertos personalizados, dominios similares a Facebook y formatos explícitos de video como `share/v`, `reel`, `watch` o `videos`.

## Sesión local

El perfil persistente está en:

```text
.facebook-session/default/
```

Contiene cookies y tokens sensibles de Facebook. Está excluido por `.gitignore`; no debe copiarse, registrarse ni subirse a Git.

Para eliminar la sesión usa **Cerrar sesión local** en la interfaz. Con la aplicación detenida también puedes borrar `.facebook-session/default/` manualmente.

El perfil de pruebas se mantiene separado en `.facebook-session/test/` y nunca modifica la sesión real.

## Comandos

```bash
npm run dev           # servidor de desarrollo
npm run lint          # ESLint
npm run typecheck     # TypeScript sin emitir archivos
npm run test:browser  # smoke de apertura/cierre de Chromium
npm test              # tests API, extractor, UI y validadores
npm run build         # build de producción
npm start             # ejecutar el build
```

Los tests levantan Next.js en el puerto 3100. Next.js 16 no permite ejecutar dos servidores `next dev` del mismo proyecto simultáneamente; detén el servidor del puerto 3000 antes de lanzar `npm test`.

## Arquitectura

```text
src/
  app/
    api/facebook/session/       check, login manual y reset
    api/facebook/post/          validación y extracción
    api/facebook/images/[id]/   imágenes temporales
  components/
    facebook-post-app.tsx       estados y flujo de UI
    post-result.tsx             modelo normalizado
  lib/facebook/
    browser.ts                  contexto persistente y exclusión mutua
    session.ts                  estado de autenticación
    validators.ts               allowlist y normalización de URLs
    navigation.ts               navegación restringida
    extractor.ts                autor, texto e imágenes
    image-cache.ts              caché local temporal
    errors.ts                   códigos y respuestas seguras
    types.ts                    FacebookPost
tests/
  api.spec.ts
  extractor.spec.ts
  image-cache.spec.ts
  ui.spec.ts
  validators.spec.ts
```

El frontend solo consume `FacebookPost`; no conoce selectores de Facebook. Playwright se importa exclusivamente desde módulos backend Node.js.

## Seguridad

- Solo se permite HTTPS y los hosts exactos `facebook.com` y `www.facebook.com`.
- Las redirecciones del documento principal fuera de esos hosts se bloquean.
- Las solicitudes se limitan a una publicación y se serializan en un proceso local.
- No se registran cookies, tokens, contraseñas ni contenido de `storageState`.
- No hay stealth, proxies, rotación de User-Agent, evasión de CAPTCHA ni automatización de 2FA.
- Las imágenes se descargan solo desde el CDN de Facebook, se limitan a 10 MiB y se sirven mediante IDs opacos.
- La caché de imágenes vive en memoria durante 15 minutos, con un máximo de 20 elementos; reiniciar la app la elimina.
- Este piloto es local y de un solo usuario. No debe exponerse directamente a Internet.

## Errores

La API utiliza códigos diferenciados:

- `INVALID_URL`
- `SESSION_REQUIRED`
- `SESSION_EXPIRED`
- `POST_NOT_FOUND`
- `POST_NOT_ACCESSIBLE`
- `EXTRACTION_FAILED`
- `BROWSER_ERROR`
- `UNKNOWN_ERROR`

El frontend muestra mensajes seguros. Los detalles técnicos se registran en desarrollo sin incluir secretos.

## Validación realizada

Pruebas automatizadas:

- UI desktop y móvil, loading, vacío, éxito y error.
- API con URL vacía, inválida, dominio externo, video y sesión ausente.
- Sesión expirada simulada en UI.
- Aislamiento de autor frente a comentarios.
- Texto con saltos de línea y emojis.
- Caché e imagen temporal desconocida.
- Validadores SSRF y smoke de Chromium sin procesos huérfanos.

Pruebas reales verificadas el 27 de agosto de 2026:

- Login manual y persistencia después de reiniciar Next.js.
- Navegación desde una URL `share/p` al permalink canónico.
- Extracción real de autor, texto completo y una imagen.
- Flujo completo desde la UI hasta la imagen renderizada.
- URL inexistente que Facebook respondió como `POST_NOT_ACCESSIBLE`.

No se probaron con casos reales controlados una publicación privada, una publicación eliminada ni una sesión expirada. Esos estados tienen cobertura automatizada o manejo conservador, pero necesitan URLs/cuentas de prueba específicas para validación real.

## Limitaciones conocidas

- Facebook cambia su DOM con frecuencia. Las heurísticas están centralizadas, pero pueden requerir ajustes.
- La publicación objetivo se identifica actualmente por el diálogo visible del permalink, usando encabezados semánticos y `data-ad-preview="message"`.
- Las imágenes de comentarios se excluyen por `role="article"`; avatares, iconos y emojis se filtran por contexto, host y tamaño.
- Publicaciones solo de video no forman parte del piloto. En publicaciones mixtas se ignoran videos y se conservan texto e imágenes.
- No hay base de datos, usuarios de la app, despliegue cloud, crawler, IA ni almacenamiento permanente.
- Si Facebook presenta CAPTCHA, checkpoint o reautenticación, el usuario debe resolverlo manualmente; la app no intenta evadirlo.
