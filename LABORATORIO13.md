# Laboratorio 13: plataforma de eventos en Kubernetes

Este laboratorio corre **localmente en Docker**, sin AWS ni Terraform. Continúa los conceptos de Kafka del Lab 12 y deja el clúster preparado para el Lab 14. Los archivos de entrega están en `k8s/` y `k8s-app/`.

## 1. Preparar Windows y VS Code

Inicia Docker Desktop y espera a que indique **Engine running**. Debe usar contenedores Linux. Como referencia, asigna al menos 4 CPU y 6 GB de memoria si tu equipo lo permite. Necesitas espacio para descargar las imágenes de Kubernetes, Kafka y Node.js.

Abre una terminal **PowerShell** en la **raíz del repositorio**, donde están `k8s/` y `k8s-app/`. No ejecutes estos pasos desde `api-gateway/` ni `k8s-app/`.

```powershell
git pull origin main
docker version
docker ps
Test-Path .\k8s\kind-cluster-config.yaml
```

`docker version` debe mostrar cliente y servidor; el último comando debe devolver `True`. Si Docker no conecta, resuelve eso antes de continuar.

## 2. Instalar kind y kubectl

Se fijaron versiones probadas juntas: **kind v0.30.0**, **Kubernetes v1.34.0** y **kubectl v1.34.0**. Se usan versiones distintas de las propuestas en el documento para reproducir la combinación validada. No combines el clúster 1.34 con un kubectl separado por varias versiones menores.

Si ya tienes las herramientas adecuadas, verifica `kind version` y `kubectl version --client` y pasa al siguiente apartado. De lo contrario, este bloque descarga las versiones para **Windows x64** y comprueba sus hashes oficiales. No requiere modificar el PATH permanentemente ni usar `setx`.

```powershell
$bin = Join-Path $env:USERPROFILE "bin"
New-Item -ItemType Directory -Force -Path $bin | Out-Null

curl.exe -fL --retry 2 -o "$bin\kind.exe" "https://github.com/kubernetes-sigs/kind/releases/download/v0.30.0/kind-windows-amd64"
if ($LASTEXITCODE -ne 0) { throw "Falló la descarga de kind" }
curl.exe -fL --retry 2 -o "$bin\kind.sha256sum" "https://github.com/kubernetes-sigs/kind/releases/download/v0.30.0/kind-windows-amd64.sha256sum"
if ($LASTEXITCODE -ne 0) { throw "Falló la descarga del checksum de kind" }
$expected = ((Get-Content "$bin\kind.sha256sum" -Raw).Trim() -split '\s+')[0]
if ((Get-FileHash "$bin\kind.exe" -Algorithm SHA256).Hash -ne $expected) { throw "Checksum de kind incorrecto" }

curl.exe -fL --retry 2 -o "$bin\kubectl.exe" "https://dl.k8s.io/release/v1.34.0/bin/windows/amd64/kubectl.exe"
if ($LASTEXITCODE -ne 0) { throw "Falló la descarga de kubectl" }
curl.exe -fL --retry 2 -o "$bin\kubectl.sha256" "https://dl.k8s.io/release/v1.34.0/bin/windows/amd64/kubectl.exe.sha256"
if ($LASTEXITCODE -ne 0) { throw "Falló la descarga del checksum de kubectl" }
$expected = (Get-Content "$bin\kubectl.sha256" -Raw).Trim()
if ((Get-FileHash "$bin\kubectl.exe" -Algorithm SHA256).Hash -ne $expected) { throw "Checksum de kubectl incorrecto" }

$env:Path = "$bin;$env:Path"
kind version
kubectl version --client
```

Si abres otra terminal, activa de nuevo la ruta con `$env:Path = "$env:USERPROFILE\bin;$env:Path"`. No ejecutes un binario cuya verificación haya fallado.

## 3. Crear el clúster

Desde la raíz:

```powershell
kind get clusters
kind create cluster --config k8s/kind-cluster-config.yaml --name devsecops-lab --image kindest/node:v1.34.0 --wait 120s
kubectl config use-context kind-devsecops-lab
kubectl cluster-info
kubectl get nodes
kubectl get nodes -L ingress-ready
```

Si `devsecops-lab` ya existe, **no lo borres ni lo vuelvas a crear**: selecciona su contexto y revisa su estado. El nodo debe aparecer `Ready`. La configuración asigna la etiqueta `ingress-ready=true` y reserva los puertos 80 y 443 para el Lab 14; todavía no instala un Ingress.

Todos los comandos siguientes suponen que el contexto es **`kind-devsecops-lab`** y que usas el namespace **`default`**. Verifícalo antes de aplicar los manifiestos:

```powershell
kubectl config current-context
kubectl config set-context --current --namespace=default
```

## 4. Desplegar Kafka

Se usa la misma imagen oficial Kafka del Lab 12, con configuración KRaft para un broker. La aplicación accede mediante el Service `kafka`; no mediante una IP ni `localhost`.

```powershell
docker pull apache/kafka:3.9.1
kind load docker-image apache/kafka:3.9.1 --name devsecops-lab
kubectl apply -f k8s/kafka-deployment.yaml
kubectl rollout status deployment/kafka --timeout=300s
kubectl get pods
kubectl get service kafka
kubectl logs deployment/kafka --tail=100
```

La comprobación de readiness consulta el broker real, además de comprobar el arranque TCP. Si los Pods no llegan a estar listos, consulta el apartado de diagnóstico; no continúes suponiendo que `Running` garantiza que Kafka ya acepta peticiones.

En otro comando puedes observar los reinicios:

```powershell
kubectl get pods --watch
```

Observa Kafka durante unos tres minutos, como pide el documento, y sal con **Ctrl+C**. Debe permanecer `Running`, listo y sin aumentar `RESTARTS`.

El listener anunciado a los clientes es **`PLAINTEXT://kafka:9092`**. El `localhost:9093` de la configuración es exclusivamente el controlador KRaft dentro del mismo Pod; no es la conexión del productor o consumidor. La probe entra por el puerto local y Kafka devuelve su dirección anunciada en los metadatos. Por eso el Service permite direcciones antes de readiness (`publishNotReadyAddresses`), evitando un ciclo durante el arranque. Espera siempre el rollout antes de desplegar la aplicación.

## 5. Construir y cargar la aplicación

Sin cambiar de la raíz:

```powershell
docker build -t devsecops-lab/k8s-app:1.0 k8s-app
kind load docker-image devsecops-lab/k8s-app:1.0 --name devsecops-lab
```

No necesitas ejecutar `npm install` en la raíz. La imagen usa un proyecto independiente en `k8s-app/`, un lockfile y `npm ci --omit=dev`. Ejecuta Node.js 22 Alpine con usuario sin privilegios. El productor y el consumidor crean el tópico `order-events` si todavía no existe.

El Dockerfile acepta opcionalmente un certificado CA como secreto de BuildKit (`npm_ca`) para entornos con proxy corporativo. En este entorno cloud se necesitó ese certificado de confianza; no se desactivó TLS ni se incluyó la CA en la imagen. En tu PC normalmente basta el comando anterior. Si falla por certificados, utiliza únicamente la CA validada de tu organización mediante `docker build --secret id=npm_ca,src=RUTA_AL_CERTIFICADO ...`; no uses `strict-ssl=false` ni desactives la validación TLS.

## 6. Desplegar consumidor y productor

```powershell
kubectl apply -f k8s/consumer-deployment.yaml
kubectl rollout status deployment/billing-consumer --timeout=180s
kubectl apply -f k8s/producer-job.yaml
kubectl wait --for=condition=complete job/order-producer --timeout=150s
kubectl logs job/order-producer
kubectl logs deployment/billing-consumer --tail=50
kubectl get pods
```

El productor debe mostrar `Evento publicado en Kafka` con un `orderId` `KAFKA-...`. El consumidor debe mostrar **ese mismo identificador** en una línea como:

```text
[billing-service] Orden recibida desde la partición 0: KAFKA-... ($25)
```

La aplicación también imprime `Service Discovery: brokers=kafka:9092`. Los Pods Kafka y billing-consumer deben estar `Running` y listos; el Pod order-producer debe aparecer `Completed`.

Si el Job ya estaba completado, volver a aplicar su YAML **no publica otro evento**. Para repetir solo la tarea y obtener una evidencia nueva:

```powershell
kubectl delete job order-producer --ignore-not-found
kubectl apply -f k8s/producer-job.yaml
kubectl wait --for=condition=complete job/order-producer --timeout=150s
kubectl logs job/order-producer
kubectl logs deployment/billing-consumer --tail=50
```

Esto elimina únicamente el Job anterior, no Kafka ni el clúster.

## 7. Comprobar Service Discovery

Estos comandos se ejecutan dentro del Pod consumidor:

```powershell
kubectl exec deployment/billing-consumer -- printenv KAFKA_BROKERS
kubectl exec deployment/billing-consumer -- nslookup kafka.default.svc.cluster.local.
kubectl get service kafka
```

El primero debe devolver `kafka:9092`; el segundo resuelve el Service. La IP mostrada es evidencia del DNS, **no un valor que debas copiar al código**.

Se usa el nombre DNS completo terminado en punto para que `nslookup` de Alpine no muestre errores de búsquedas alternativas aunque el nombre corto `kafka` ya funcione en la aplicación.

La recepción de la orden demuestra además que la resolución y la conexión funcionaron, no solo que existe un Service.

## 8. Capturas que debes entregar

### Evidencia 1: Kafka y consumidor ejecutándose

Ejecuta:

```powershell
kubectl config current-context
kubectl get pods
```

Amplía la terminal hasta ver los nombres completos, las columnas **READY, STATUS y RESTARTS**, Kafka y billing-consumer en **Running**, preferiblemente `1/1`, y order-producer en **Completed**. Presiona **Win + Shift + S** y guarda la selección como **`lab13-01-pods.png`**. No uses una captura de Docker Compose: el entregable requiere Pods de Kubernetes.

### Evidencia 2: orden del Job recibida por el consumidor

Ejecuta consecutivamente:

```powershell
kubectl logs job/order-producer
kubectl logs deployment/billing-consumer --tail=30
```

Captura ambos comandos y sus resultados, con el **mismo `orderId`** legible en la publicación y en `[billing-service] Orden recibida...`. Guarda **`lab13-02-evento-recibido.png`**. Si no cabe, toma dos capturas relacionadas por el mismo identificador.

La comprobación DNS del apartado anterior puede entregarse como evidencia adicional; las dos anteriores son las requeridas por el documento. No captures certificados, tokens ni el contenido de tu kubeconfig.

## 9. Conservar para el Laboratorio 14

**No ejecutes `kind delete cluster`, no elimines los manifiestos y no borres el Pod Kafka.** El Lab 14 reutiliza este clúster. Kafka usa almacenamiento temporal de laboratorio (`emptyDir`): si se reemplaza su Pod, se pierde su log; no es almacenamiento de producción. Puedes volver a producir pedidos, pero conserva antes tus evidencias.

## Diagnóstico

| Síntoma | Acción |
| --- | --- |
| `kind` o `kubectl` no reconocido | Activa la carpeta `bin` en el PATH de esa terminal y verifica las versiones. |
| Docker instalado pero no conecta | Inicia Docker Desktop, confirma Linux containers y repite `docker ps`. |
| Puertos 80/443 ocupados al crear kind | Identifica el servicio que los usa antes de detenerlo. No cambies los puertos sin considerar el Ingress del Lab 14. |
| `ImagePullBackOff` en la aplicación | Construye la imagen y vuelve a ejecutar `kind load docker-image ... --name devsecops-lab`; comprueba contexto e imagen `:1.0`. |
| `CrashLoopBackOff` | Usa `kubectl logs deployment/kafka --previous` o `kubectl logs deployment/billing-consumer --previous` y `kubectl describe pod NOMBRE_DEL_POD`. |
| Kafka no queda listo | Revisa recursos de Docker Desktop, logs y `kubectl describe deployment kafka`. No reinicies todo el clúster como primer paso. |
| El consumidor no conecta | Espera el rollout de Kafka; revisa `kubectl get service kafka` y que `KAFKA_BROKERS` sea `kafka:9092`. |
| Job `Failed` | Revisa `kubectl logs job/order-producer` y `kubectl describe job order-producer`; corrige la causa antes de recrear solo ese Job. |
| No hay un evento nuevo | Un Job completado no se vuelve a ejecutar con `apply`; repite los pasos de recreación del Job del apartado 6. |

Los manifiestos mantienen las piezas solicitadas por el documento. Se agregaron límites de recursos, probes y apagado ordenado del consumidor para verificar el funcionamiento y evitar tratar un proceso arrancado como una conexión exitosa.

## Validación realizada

Se construyó la imagen y se ejecutó como UID 10001. En un clúster kind real, el Job terminó correctamente y el consumidor recibió el mismo `orderId` por `kafka:9092`; también se comprobó DNS. Kafka y billing-consumer permanecieron listos y con cero reinicios durante 180 segundos. El servidor Kubernetes validó los manifiestos finales.

El host cloud necesitó ajustes locales de IPv4, `/dev/kmsg` y el snapshotter nativo de containerd; no se incorporaron al manifiesto estándar para Docker Desktop. Esta validación no instala el clúster en tu PC ni sustituye tus capturas de entrega. El clúster de pruebas se conservó para el Lab 14.
