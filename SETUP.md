# Preparación local en VS Code

Abre este repositorio en VS Code. En Windows usa VS Code con WSL; el script requiere Linux x86_64, Bash, Node.js 20 o posterior, npm, Python 3 y curl.

Desde la terminal, en la raíz del repositorio:

```bash
bash scripts/setup-dev.sh
```

El script instala las dependencias exactas del lockfile en el repositorio con `npm ci`. Descarga Terraform 1.13.5, verifica su checksum oficial y valida `enviroments/dev` y `api-gateway` sin conectar el backend AWS. Ejecuta las pruebas Jest, Lambda, mensajería y Terraform con AWS simulado, además de la demo Saga con trazas en consola. Las compensaciones de Saga son fallos simulados esperados.

Las herramientas, caches y datos locales de Terraform se guardan en `.onboarding`, junto al repositorio. Puedes elegir otra carpeta mediante `DEVSECOPS_SETUP_DIR` (ruta absoluta). Las pruebas usan directamente las fuentes del checkout.

## Dependencias y laboratorios

El conflicto de `package.json` fue resuelto conservando las dependencias de ambas ramas y agregando SNS y KafkaJS. El lockfile actualizado permite instalar en la raíz desde PowerShell con `npm ci`. La carpeta auxiliar antigua con copias de fuentes ya no es necesaria.

Consulta [Laboratorio 12](LABORATORIO12.md) para desplegar el fan-out en tu AWS, ejecutar Kafka local opcionalmente y obtener las capturas y la evidencia de limpieza.

El script no despliega recursos. Las integraciones con AWS y SonarQube requieren configuración y autenticación adicionales. No incluyas credenciales en Git.

La configuración guardada en la plataforma cloud se publica por separado desde sus ajustes; este script permite reproducir las comprobaciones locales.
