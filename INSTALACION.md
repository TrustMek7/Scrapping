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

El historial muestra solo publicaciones con `relevant: true`; los demas registros se conservan internamente para deduplicacion. Cada publicacion nueva conserva el numero de la revision que la incorporo. Se puede filtrar por revision y ese numero se incluye en el Excel. Los datos anteriores a esta funcion aparecen como "Registro anterior"; no se inventan numeros retroactivos. Las etiquetas Nueva/Ya registrada son relativas al inicio de la ultima revision del proceso actual y no indican aprobacion humana.

Al actualizar una instalacion existente, ejecuta `pnpm db:generate` y `pnpm build` antes de arrancar. `init.bat` aplica las migraciones pendientes despues de iniciar PostgreSQL. La migracion de revisiones agrega ReviewRun y una relacion opcional; no borra publicaciones existentes. El instalador inicial ya ejecuta estos pasos.

El aviso de progreso es global y permanece al navegar entre Alertas, Fuentes y Parametros. Iniciar revision aparece en verde y Detener revision en rojo. Categorias y severidades se muestran en espanol. El resaltado marca nombres/alias y afirmaciones que coinciden literalmente con el texto mostrado; el motivo de la IA se presenta aparte, identificado como interpretacion y no como un hecho comprobado.

## Desconexion y apagado

Si no se puede consultar el backend, el aviso conserva el ultimo progreso y el boton aparece amarillo como "Verificando estado". No se interpreta una peticion fallida como una revision terminada. Cuando el backend confirma el resultado, se muestra completada, detenida o interrumpida, con la causa y el numero de fuentes completadas. Ese aviso se cierra manualmente. El ultimo estado se conserva en `apps/backend/.review-state.local`; un reinicio inesperado convierte una revision pendiente en interrumpida.

El boton **Apagar sistema** solicita al supervisor local cerrar las revisiones, los servidores y el contenedor PostgreSQL. Se permite un margen de 15 segundos para terminar la operacion en curso antes de cerrar los procesos registrados. El navegador de extraccion tambien pertenece a esos procesos. Docker Desktop queda abierto; no se borran datos ni volumenes.

Si el frontend o el backend no responde, ejecuta **detener.bat**. Puede repetirse si Docker no responde en el primer intento. El apagado usa `.runtime.local`, creado por el `init.bat` actualizado, y verifica PID, fecha de creacion y comando antes de cerrar un proceso. No cierra procesos encontrados solamente por nombre o puerto. Una ejecucion iniciada con un lanzador antiguo debe cerrarse una vez por el metodo anterior y luego iniciarse con el nuevo `init.bat`.

El supervisor recibe las solicitudes locales mediante `.shutdown-request.local`. Estos archivos estan excluidos de Git. Los resultados del apagado solicitado desde la aplicacion quedan en `logs/shutdown.log` y `logs/shutdown-error.log`. El boton confirma que se solicito el apagado; una vez que los servidores se cierran la pagina ya no puede consultar su estado. Ante dudas usa detener.bat o revisa esos registros.
