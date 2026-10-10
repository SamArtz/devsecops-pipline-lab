# Preparación local en VS Code

Abre este repositorio en VS Code. En Windows usa VS Code con WSL; el script requiere Linux x86_64, Bash, Node.js 20 o posterior, npm, Python 3 y curl.

Desde la terminal, en la raíz del repositorio:

```bash
bash scripts/setup-dev.sh
```

El script instala las dependencias exactas del lockfile en una carpeta auxiliar `.onboarding`, junto al repositorio. Descarga Terraform 1.13.5, verifica su checksum oficial y valida `enviroments/dev` sin conectar el backend AWS. Ejecuta las cuatro pruebas Jest y la demo Saga con trazas en consola. Las compensaciones de Saga son fallos simulados esperados.

Puedes elegir otra carpeta auxiliar mediante `DEVSECOPS_SETUP_DIR` (ruta absoluta). Vuelve a ejecutar el script después de editar las fuentes para actualizar las copias usadas por las pruebas.

## Limitación del repositorio

`package.json` contiene marcadores de un conflicto de merge. Por eso `npm ci` directamente en el checkout falla. La carpeta auxiliar genera su manifest a partir de `package-lock.json` y copia las fuentes sin modificarlas; valida solamente las dependencias del lockfile. El conflicto debe resolverse en una tarea de código separada. No se validó la rama de dependencias de CloudWatch.

El script no despliega recursos. Las integraciones con AWS y SonarQube requieren configuración y autenticación adicionales. No incluyas credenciales en Git.

La configuración guardada en la plataforma cloud se publica por separado desde sus ajustes; este script permite reproducir las comprobaciones locales.
