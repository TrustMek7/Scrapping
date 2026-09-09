# Instalacion en Windows

Descarga `instalar.bat` y ejecutalo. Si faltan Node.js (22 o superior), Git o Docker Desktop, ofrece instalarlos con winget. Vuelve a abrir el instalador despues de instalar cada requisito para renovar PATH; Windows o Docker pueden requerir reinicio.

El archivo puede ejecutarse solo: pregunta la carpeta de destino y clona el repositorio publico. Si esta dentro del repositorio utiliza esa copia. No sobrescribe carpetas ajenas ni actualiza automaticamente copias existentes.

Recibe el `.env` por un canal privado y colocalo en la raiz del repositorio, junto a `package.json`. El instalador indica la carpeta y espera a que lo copies. No descarga, crea ni solicita credenciales: verifica que las necesarias esten presentes y conserva sus lineas. `.env` esta excluido de Git y no debe publicarse.

Para modificar el `.env`, pregunta solamente por confirmacion de destinatarios, correos adicionales y confianza minima (0.6 si falta ese valor). Enter conserva los valores existentes. Solo actualiza EMAIL_TO y ALERT_MIN_CONFIDENCE. Verifica puertos y URLs sin cambiarlos; si hay inconsistencias indica que corregir manualmente. Los correos se validan por formato; no se envia un mensaje de prueba. No usarlo para reconfigurar una instalacion con una base remota.

Comprueba puertos, inicia PostgreSQL, espera su disponibilidad, aplica las migraciones existentes e instala Chromium y la compilacion. Si falla, corrige la causa y ejecutalo nuevamente. No elimina bases ni volumenes. No cambies credenciales de PostgreSQL en un volumen ya creado: las variables de Docker no cambian las credenciales de ese volumen.

Ejecuta `init.bat` para el uso diario. Detecta la carpeta del proyecto y Docker Desktop (pregunta la ruta si no lo encuentra). Inicia la compilacion del backend y la vista previa local del frontend en segundo plano, y abre http://localhost:5173 cuando ambos responden. Los registros quedan en `logs`. Para cambios de codigo o de variables VITE, vuelve a compilar antes del siguiente arranque. No ejecutes dos instancias a la vez.

Puedes mover la carpeta completa sin editar rutas. Una ruta personalizada de Docker queda en `docker-path.local`, excluido de Git.

Ayuda para Docker/WSL (terminal como administrador si Windows lo requiere): `wsl --install` y `wsl --update`. Reinicia cuando se solicite. Referencias: https://docs.docker.com/desktop/setup/install/windows-install/ y https://learn.microsoft.com/en-us/windows/wsl/install

Se usan `npm.cmd` y `pnpm.cmd` para evitar el bloqueo de scripts `.ps1`. Los lanzadores aplican Bypass solo al proceso actual; no cambian la politica del usuario. Para otros usos de PowerShell, la solucion opcional al error de scripts es `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`.

Las etiquetas del historial son relativas al inicio de la ultima revision del backend: **Nueva** si se incorporo desde entonces y **Ya registrada** si existia antes. No indican lectura o aprobacion humana. Al reiniciar el backend se pierde ese punto de referencia y todas aparecen como ya registradas.
