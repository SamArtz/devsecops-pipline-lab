# Laboratorio 12: mensajería empresarial y evidencias

Esta práctica continúa el Laboratorio 11. **Se conserva la misma cola `devsecops-lab-orders-api-queue` y el mismo estado Terraform de `api-gateway/`.** No borres el estado ni ejecutes Terraform desde otra carpeta. SNS agrega dos colas: facturación y envíos.

## Qué está preparado y qué falta ejecutar en tu AWS

El repositorio incluye `api-gateway/fanout.tf`, el consumidor `sns-fanout-consumer.js`, las dependencias con lockfile, pruebas del consumidor y la parte opcional de Kafka.

Las pruebas locales usan AWS simulado. El entorno donde se preparó el código no tiene una identidad AWS utilizable; aquí no se desplegó ni destruyó tu infraestructura. Los mensajes en tus colas y la limpieza deben comprobarse desde tu sesión AWS. Las capturas de las pruebas locales no sustituyen las evidencias del documento.

## A. Instalar y agregar SNS a la infraestructura existente

Todos los siguientes comandos están escritos para **PowerShell en VS Code**, igual que tu terminal anterior. Comienza en la raíz de `devsecops-pipline-lab`.

```powershell
git pull origin main
npm ci
npm test -- --runInBand
npm run test:lambda
npm run test:messaging
aws sts get-caller-identity --region us-east-1
```

Se resolvió el conflicto de `package.json` conservando las dependencias de ambas ramas. Ahora `npm ci` funciona en la raíz, sin la carpeta auxiliar del onboarding.

La identidad de AWS CLI debe tener acceso a la cola de pedidos (`sqs:ReceiveMessage`, `sqs:DeleteMessage`) y al tema SNS (`sns:Publish`). **Adjuntar permisos a `github-actions-devsecops` no otorga esos permisos automáticamente a otra identidad con la que ejecutes Node.js.** Si usas un perfil, actívalo en esta misma terminal, por ejemplo `$env:AWS_PROFILE = "nombre-de-tu-perfil"`, con el nombre real. No compartas claves ni las captures.

Entra en la carpeta Terraform y conserva el estado que usaste para el `apply` del Laboratorio 11:

```powershell
Set-Location api-gateway
terraform init
terraform validate
terraform plan "-var=iam_user_name=github-actions-devsecops" "-out=lab12.tfplan"
terraform apply "lab12.tfplan"
```

Se utiliza `github-actions-devsecops`, cuya existencia confirmaste en IAM. Revisa el plan: debe agregar SNS, suscripciones, las colas billing/shipping y sus políticas, manteniendo la API y la cola original. Si propone recrear recursos del Lab 11 inesperadamente, revisa primero que estás usando el estado correcto. No apliques un plan de eliminación en esta etapa.

No reutilices `lab11.tfplan`: después de cambiar archivos o estado siempre debes generar un plan nuevo. Si aparece un error de propagación IAM, comprueba primero los permisos y luego genera un plan nuevo.

Guarda los outputs en variables de **la misma terminal PowerShell**:

```powershell
$api = (terraform output -raw api_url).Trim()
$env:QUEUE_URL = (terraform output -raw queue_url).Trim()
$env:TOPIC_ARN = (terraform output -raw order_events_topic_arn).Trim()
$env:AWS_REGION = "us-east-1"
$api
$env:QUEUE_URL
$env:TOPIC_ARN
Set-Location ..
```

Ahora estás otra vez en la raíz del repositorio. No necesitas pegar URLs ni ARN dentro del código. Tu URL conocida es `https://k4lbd6f4kk.execute-api.us-east-1.amazonaws.com`; usa preferentemente el output por si cambia.

## B. Crear un pedido y ejecutar la difusión

En la raíz, en esa misma terminal:

```powershell
[System.IO.File]::WriteAllText("$PWD\lab12-pedido.json", '{"productId":"sku-200","amount":40}')
curl.exe -i -X POST "$api/orders" -H "Content-Type: application/json" --data-binary "@lab12-pedido.json"
node sns-fanout-consumer.js
```

El POST debe responder **201**. Anota su `orderId`. El consumidor debe mostrar:

```text
[fan-out] Pedido API-... republicado en SNS para todos los interesados.
[resumen] recibidos=1, publicados=1, eliminados=1, fallidos=0
```

El contador puede ser mayor si quedaban pedidos del Lab 11. Busca el `orderId` del pedido nuevo. El consumidor procesa hasta 10 mensajes por ejecución; si hay más, vuelve a ejecutarlo.

El mensaje de origen se elimina **solo después** de que SNS confirma la publicación. Por eso debes buscar la evidencia en billing y shipping, no esperar que el mismo mensaje permanezca en `orders-api-queue`.

SQS/SNS ofrecen entrega al menos una vez: pueden existir duplicados. Si SNS publicó pero falló el borrado en la cola original, un reintento puede republicar el pedido. En un sistema real, los consumidores de billing/shipping necesitan idempotencia por `orderId`.

### Evidencia obligatoria 1: el MISMO pedido en las DOS colas

1. Abre AWS Console y selecciona **N. Virginia (`us-east-1`)**.
2. Busca **SQS → Queues / Colas → `devsecops-lab-billing-queue`**.
3. Entra en **Send and receive messages / Enviar y recibir mensajes**.
4. Pulsa **Poll for messages / Sondear mensajes** y abre el mensaje.
5. En **Body / Cuerpo**, busca el campo **`Message`**. Dentro de él está el pedido con `orderId`, `productId: "sku-200"` y `amount: 40`.
6. Captura el nombre de la cola y el cuerpo del mensaje. Guarda **`lab12-01-billing.png`**.
7. Repite los pasos con **`devsecops-lab-shipping-queue`** y guarda **`lab12-02-shipping.png`**.

**Las dos capturas deben mostrar el mismo `orderId`, también coincidente con el POST 201.** El Message ID de SQS y el MessageId del sobre SNS no son el identificador de tu pedido.

Las suscripciones mantienen el comportamiento del documento: SNS envía un sobre JSON, así que `Message` es una cadena JSON y puede aparecer con comillas escapadas. Eso es normal. No necesitas borrar el sobre ni modificar el mensaje.

Para facilitar una sola evidencia conjunta, abre billing y shipping en dos ventanas del navegador y colócalas lado a lado. Amplía sus cuerpos para que sea legible el mismo `orderId`. Si no caben, entrega las dos capturas separadas con ese identificador visible. No uses mensajes de pedidos diferentes.

En Windows presiona **Win + Shift + S**, selecciona la zona y guarda cada imagen. Si el nombre de la cola y el cuerpo no caben juntos, agrega una captura de contexto. No captures claves, tokens o formularios de credenciales. Una captura adicional de la terminal con el 201 y el log `[fan-out]` ayuda a mostrar la secuencia, aunque el entregable obligatorio es el pedido en ambas colas.

### Si no aparecen mensajes

- Comprueba que SNS ya se desplegó y tiene las dos suscripciones SQS.
- Confirma que el POST devolvió 201 y el consumidor mostró `publicados > 0`, `fallidos=0`.
- Revisa región, nombre de cola y el `orderId`; no busques solo en la cola original.
- Si sondeaste el mensaje anteriormente, queda invisible temporalmente. Espera el visibility timeout de esa cola antes de volver a sondear. El consumidor reserva mensajes de origen durante 60 segundos.
- `No llegaron pedidos nuevos` no es una difusión exitosa: envía un pedido válido nuevo y vuelve a ejecutar el consumidor.
- Un `AccessDenied` requiere revisar los permisos de **la identidad usada por Node.js**, el tema y las políticas de las colas. No soluciones esto pegando claves en el script.

## C. Kafka local con Docker — parte opcional

Se incluye la imagen oficial `apache/kafka:3.9.1`, en lugar de la imagen Bitnami antigua del documento. Es un broker KRaft de un nodo para desarrollo; no es un despliegue de producción. El puerto solo se publica en loopback. Kafka es independiente de SNS: esta comparación local no consume ni modifica tus colas AWS.

Desde la raíz, con Docker Desktop iniciado:

```powershell
docker version
docker compose -f kafka-local/docker-compose.yml up -d --wait --wait-timeout 120
docker compose -f kafka-local/docker-compose.yml ps
node kafka-consumer.js
```

Deja esa terminal escuchando. En **otra terminal**, también en la raíz:

```powershell
node kafka-producer.js
node kafka-producer.js
```

La primera terminal debe mostrar ambas órdenes con sus identificadores `KAFKA-...`. El productor y consumidor aseguran que exista el tópico `order-events` con una partición. Puedes tomar una captura adicional de ambas terminales lado a lado; esta evidencia es opcional según el documento.

Kafka conserva los eventos en el log, pero un grupo que ya confirmó sus offsets no los relee simplemente por reiniciar el consumidor. Para demostrar relectura, detén el consumidor con **Ctrl+C** y usa un grupo nuevo:

```powershell
$env:KAFKA_GROUP_ID = "relectura-$(Get-Date -Format yyyyMMddHHmmss)"
node kafka-consumer.js --once
Remove-Item Env:KAFKA_GROUP_ID
```

`--once` recibe un evento y termina; devuelve error si no llega ninguno en 30 segundos. El consumidor normal permanece escuchando hasta Ctrl+C.

Al terminar, detén el consumidor y apaga solo los contenedores de esta práctica:

```powershell
docker compose -f kafka-local/docker-compose.yml down
```

Si Docker falla, consulta `docker compose -f kafka-local/docker-compose.yml logs kafka`. Un puerto 9092 ocupado o un Docker Desktop detenido son problemas locales; no impiden completar las partes obligatorias de SNS y limpieza. Esta configuración no guarda Kafka en un volumen persistente: `down` elimina este broker de práctica y sus datos locales.

## D. Limpieza final y evidencia obligatoria 2

**Haz esta parte únicamente después de guardar las evidencias de los Laboratorios 11 y 12.** Destruir elimina los mensajes y deja de funcionar la URL de la API. Aquí termina la secuencia; no destruyas desde `events/`, `observability/` ni `enviroments/dev/`.

Desde la raíz:

```powershell
Set-Location api-gateway
terraform plan -destroy "-var=iam_user_name=github-actions-devsecops"
terraform destroy "-var=iam_user_name=github-actions-devsecops"
```

Revisa la lista de recursos antes de escribir **`yes`**. Debe corresponder a la API del Lab 11 y el fan-out del Lab 12. Terraform eliminará también los adjuntos IAM que administra este estado; algunas políticas pueden haber sido utilizadas por laboratorios anteriores, así que revisa su impacto. No elimina al usuario IAM ni toda la cuenta AWS.

Espera la salida real:

```text
Destroy complete! Resources: ... destroyed.
```

Toma la captura **`lab12-03-destroy.png`** mostrando el comando, la ruta `api-gateway` y esa línea final. El número de recursos puede variar; no lo edites. Si hay errores, la limpieza no terminó: resuélvelos antes de darla por completada. Puedes comprobar después `terraform state list`, que debe quedar sin recursos administrados.

## Lista final de entrega

| Entregable del documento | Archivo o evidencia |
| --- | --- |
| Infraestructura de difusión | `api-gateway/fanout.tf` |
| Consumidor SQS → SNS | `sns-fanout-consumer.js` |
| Mismo pedido en dos colas | `lab12-01-billing.png` y `lab12-02-shipping.png`, o una captura conjunta legible |
| Limpieza final sin errores | `lab12-03-destroy.png` |

Kafka y su captura son adicionales. Guarda las evidencias originales de tu AWS; los tests simulados del repositorio no demuestran un despliegue ni una limpieza real.
