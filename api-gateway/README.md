# Laboratorio 11: API Gateway, Lambda y SQS

## Qué incluye

- `lambda/create-order.js`: valida pedidos y los envía a SQS.
- `lambda/health.js`: responde el estado de la API.
- `api-gateway/main.tf`, `variables.tf`, `outputs.tf`: cola, permisos IAM, funciones Lambda, API HTTP, rutas y permisos de invocación.
- `lambda/tests/handlers.test.js`: pruebas locales con SQS simulado.
- `api-gateway/tests/lab11.tftest.hcl`: contrato de rutas, cola e IAM con AWS simulado (Terraform >= 1.7 para esta prueba opcional).

Se mantiene la arquitectura del documento. Se usa Node.js 22 en Lambda en lugar de Node.js 20 para evitar el runtime antiguo. Se valida que `amount` sea un número positivo, se manejan cuerpos base64 y errores de SQS, y los pedidos tienen un identificador UUID. El SDK v3 se obtiene del runtime Lambda, como propone el laboratorio; no se empaquetan dependencias.

**Estado:** las pruebas locales no son evidencias de un despliegue AWS. El entorno cloud de preparación no tiene una identidad AWS utilizable, por lo que el despliegue y las capturas reales deben ejecutarse desde una sesión autenticada.

## 1. Preparar VS Code

Abre el repositorio. En Windows usa una terminal **Git Bash** o **WSL** para los comandos de esta guía. Necesitas Git, Node.js 20 o posterior, Terraform >= 1.5 y AWS CLI. Configura la autenticación AWS localmente mediante el método de tu cuenta (`aws configure` o AWS SSO); nunca pegues claves en el código, Git o capturas.

Desde la raíz del repositorio:

```bash
git pull origin main
node --version
terraform version
aws --version
aws sts get-caller-identity --region us-east-1
npm --prefix lambda test
```

Si utilizaste la preparación cloud, Terraform está en `/workspace/.onboarding/bin`; allí puedes activarlo con `export PATH="/workspace/.onboarding/bin:$PATH"`. Una instalación local normal no necesita esa ruta.

`npm --prefix lambda test` funciona independientemente del conflicto preexistente de `package.json` en la raíz. No necesitas ejecutar `npm install` para estas pruebas ni dentro de `lambda/`.

Comprueba que el usuario IAM existente coincida con el valor que pasarás al plan. El documento usa `devsecops-lab-user`, mientras que algunos archivos anteriores del repositorio usan `github-actions-devsecops`. No crees otro usuario para resolver un nombre incorrecto.

## 2. Desplegar el Laboratorio 11

**La carpeta correcta es `api-gateway/`, no `enviroments/dev/`.** Este laboratorio tiene un estado Terraform independiente y local. Conserva `terraform.tfstate` y su copia de seguridad; están ignorados por Git. En otro equipo necesitarás trasladar ese estado de forma segura o configurar un backend antes de administrar el despliegue existente. No vuelvas a aplicar desde un estado vacío sobre recursos existentes.

```bash
cd api-gateway
unset TF_DATA_DIR
terraform init
terraform validate
terraform test # Opcional: requiere Terraform >= 1.7; usa AWS simulado
terraform plan -var='iam_user_name=devsecops-lab-user' -out=lab11.tfplan
terraform apply lab11.tfplan
terraform output
```

Si tu usuario real es `github-actions-devsecops`, sustituye el nombre en el comando `plan`. El usuario que despliega necesita permisos IAM para gestionar los roles y adjuntar las políticas, además de los permisos Lambda, API Gateway y SQS. Terraform incluye las políticas del documento y la espera de propagación. Esa espera no garantiza la propagación en todos los casos.

El plan crea infraestructura en `us-east-1` y adjunta políticas al usuario indicado. Revísalo antes del `apply`. Los nombres son los del laboratorio; si ya existen recursos con esos nombres, revisa el estado previo antes de intentar desplegar otra vez. No cambies ni borres recursos de laboratorios anteriores.

La API es pública y no exige autenticación del cliente, tal como pide la práctica. No publiques datos sensibles. El costo depende de tu cuenta y uso; esta guía no garantiza una factura de cero.

## 3. Obtener las respuestas y tomar capturas

Ejecuta los comandos en la misma terminal Git Bash/WSL, estando en `api-gateway/`:

```bash
API_URL="$(terraform output -raw api_url)"
curl -i "$API_URL/health"
```

Debe aparecer `200` y un JSON con `status: "ok"`. La URL del output ya incluye `https://`; no lo agregues otra vez. Esta prueba de salud es útil, pero el documento no la exige como captura entregable.

### Evidencia 1: pedido válido, HTTP 201

```bash
curl -i -X POST "$API_URL/orders" \
  -H 'Content-Type: application/json' \
  -d '{"productId":"sku-100","amount":25}'
```

Amplía la terminal hasta que se vea el comando, la línea `HTTP/2 201` o `HTTP/1.1 201`, y el JSON completo con `message`, `orderId`, `productId` y `amount`. **Anota el `orderId` exacto:** debe coincidir con el mensaje de SQS de la evidencia 3.

En Windows presiona **Win + Shift + S**, selecciona esa zona y guarda la imagen como `lab11-01-orders-201.png`. No captures solo el cuerpo JSON: debe verse el código HTTP. Evita mostrar otras terminales con credenciales.

### Evidencia 2: pedido incompleto, HTTP 400

```bash
curl -i -X POST "$API_URL/orders" \
  -H 'Content-Type: application/json' \
  -d '{"productId":"sku-100"}'
```

Debe aparecer `400` y `Se requieren los campos productId y amount`. Captura el comando, el estado HTTP y el mensaje. Guarda `lab11-02-orders-400.png`.

No modifiques la respuesta ni uses las pruebas locales como reemplazo de estas evidencias. Un error 500 no cumple la validación requerida.

### Evidencia 3: el mismo pedido en SQS

1. Abre la consola AWS y selecciona **US East (N. Virginia) / us-east-1**.
2. Busca **SQS**, entra en **Queues** y abre `devsecops-lab-orders-api-queue`.
3. Selecciona **Send and receive messages**.
4. En **Receive messages**, pulsa **Poll for messages**.
5. Abre el mensaje correspondiente al pedido válido. En **Body** debe aparecer el JSON con el mismo `orderId` de la respuesta 201, `productId: "sku-100"` y `amount: 25`.
6. Toma una captura donde se vea el nombre de la cola y el cuerpo del mensaje. Si la interfaz no permite mostrar ambos legiblemente, toma una captura adicional de la cola. Guarda `lab11-03-sqs-order.png`.

No confundas el **Message ID de SQS** con `orderId`; son distintos. No pulses **Delete**. Recibir un mensaje lo oculta temporalmente según el visibility timeout; si vuelves a buscarlo inmediatamente, espera ese plazo. La cola guarda pedidos válidos; la solicitud rechazada con 400 no debe producir un mensaje.

## 4. Entrega

Entrega los dos archivos `lambda/*.js`, los tres archivos `.tf` de `api-gateway/` y las tres capturas anteriores. Los ZIP se generan automáticamente con Terraform y no se suben a Git. El código está en el repositorio; las capturas deben mostrar tu ejecución real en AWS.

**Conserva la API, las funciones Lambda, la cola y el estado Terraform para el Laboratorio 12. No ejecutes `terraform destroy` al terminar el Laboratorio 11.**

## Diagnóstico rápido

| Problema | Qué revisar |
| --- | --- |
| AWS CLI no obtiene identidad | Autenticación local, perfil o sesión SSO; no compartas claves en chat. |
| `NoSuchEntity` al adjuntar políticas | `iam_user_name` debe ser el usuario existente. |
| `AccessDenied` al crear roles | La identidad que despliega necesita los permisos IAM previos indicados por el laboratorio. |
| Lambda no puede asumir el rol | Espera la propagación IAM y revisa la política de confianza; reintenta solo tras comprobar la causa. |
| POST responde 500 | Revisa el log group `/aws/lambda/devsecops-lab-create-order`, `QUEUE_URL`, el permiso `sqs:SendMessage` y los permisos de invocación API Gateway. |
| 404 | Usa el output `api_url` con `/orders` o `/health` y el método correcto. |
| No aparece el mensaje | Revisa región y cola; confirma primero el 201 y compara `orderId`; considera el visibility timeout. |
