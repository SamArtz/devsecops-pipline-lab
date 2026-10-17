# Laboratorio 14: API multi-stage, probes, Ingress y escalado

Continúa el **mismo clúster `devsecops-lab` del Laboratorio 13**. No usa AWS ni Terraform. Los comandos de esta guía son para **PowerShell en VS Code**, desde la raíz del repositorio, donde están `k8s/` y `status-api/`. No ejecutes los comandos desde `k8s/` ni `k8s-app/`.

## A. Comprobar el clúster existente

```powershell
git pull origin main
docker ps
kind get clusters
kubectl config use-context kind-devsecops-lab
kubectl config set-context --current --namespace=default
kubectl cluster-info
kubectl get pods
```

Docker Desktop debe estar iniciado en modo Linux containers. Kafka y el consumidor del Lab 13 deben seguir en `Running`. Si `kind` no se reconoce, activa la ruta que instalaste antes:

```powershell
$env:Path = "$env:USERPROFILE\bin;$env:Path"
```

Si el nodo está detenido pero existe, inicia Docker Desktop y revisa `docker ps -a`; no borres el clúster como primera solución. Si realmente lo eliminaste, reconstruye el Lab 13 siguiendo `LABORATORIO13.md` antes de continuar.

## B. Construir y cargar la imagen

Desde la raíz:

```powershell
docker buildx build --load -t devsecops-lab/status-api:1.0 status-api
kind load docker-image devsecops-lab/status-api:1.0 --name devsecops-lab
```

**Es `status-api`, no `k8s-app`.** Si estás dentro de `status-api/`, el contexto de build sería `.`; vuelve a la raíz antes de los comandos de Kubernetes de esta guía.

La imagen tiene dos etapas: `deps` instala únicamente dependencias de producción con `npm ci` y el lockfile; `runtime` copia las dependencias y el servidor, sin el cache de instalación ni los tests. Usa Node.js 22 Alpine y UID/GID 10001. No necesita instalar las dependencias del `package.json` de la raíz.

Prueba opcional de la API desde Node.js, sin Kubernetes:

```powershell
npm ci --prefix status-api
npm --prefix status-api test
```

El test comprueba HTTP 200, formato de salud, incremento del contador, que `/health` no incremente el contador y que una ruta inexistente devuelva 404.

El Dockerfile acepta opcionalmente el secreto BuildKit `npm_ca` para una CA de confianza en entornos con proxy corporativo. En este cloud se necesitó; en tu PC normalmente no. No desactives TLS para resolver un problema de certificados.

## C. Desplegar las dos réplicas

```powershell
kubectl apply -f k8s/status-api-deployment.yaml
kubectl rollout status deployment/status-api --timeout=180s
kubectl get pods -l app=status-api
kubectl get service status-api
```

Debes ver **dos Pods**, ambos `1/1 Running`. El manifiesto define requests, límites, probes HTTP de readiness y liveness sobre `/health`, usuario sin privilegios y filesystem de solo lectura.

### Captura 1: dos réplicas listas

Amplía la terminal y ejecuta:

```powershell
kubectl get pods -l app=status-api
```

Presiona **Win + Shift + S** y captura el comando, nombres de ambos Pods y columnas **READY, STATUS y RESTARTS**. Guarda **`lab14-01-dos-replicas.png`** antes de escalar.

## D. Instalar ingress-nginx y crear el Ingress

Se incluye una copia del manifiesto oficial de kind en `k8s/ingress-nginx-kind.yaml`, fijada a **controller v1.14.0**, cuya matriz oficial incluye Kubernetes 1.34 (la versión del Lab 13). Las imágenes están fijadas por digest. Esto evita depender de cambios en la rama `main` del proyecto.

El documento utiliza ingress-nginx, retirado en marzo de 2026. Se conserva para esta práctica local y desechable; no es una recomendación para un despliegue nuevo de producción.

```powershell
kubectl apply -f k8s/ingress-nginx-kind.yaml
kubectl -n ingress-nginx rollout status deployment/ingress-nginx-controller --timeout=300s
kubectl -n ingress-nginx wait --for=condition=complete job/ingress-nginx-admission-create --timeout=180s
kubectl -n ingress-nginx wait --for=condition=complete job/ingress-nginx-admission-patch --timeout=180s
```

**Continúa solo cuando terminen sin errores.** Los Jobs preparan los certificados y el webhook de admisión. Si el controlador está `ImagePullBackOff`, revisa el diagnóstico al final; aplicar el Ingress repetidamente no arregla una imagen que no se pudo descargar.

Después:

```powershell
kubectl apply -f k8s/status-api-ingress.yaml
kubectl get ingress
kubectl get pods -n ingress-nginx
curl.exe -i http://localhost/health
curl.exe -i http://localhost/
```

`/health` debe devolver **200** y un JSON con `status: "ok"` y `timestamp`. `/` debe devolver **200** con `message`, `hostname` y `requestCount`.

**Corrección respecto al documento:** el Ingress no contiene `rewrite-target: /`, porque esa regla convertiría `/health` en `/` y devolvería el contenido incorrecto. Se conserva la ruta original.

Puedes abrir `http://localhost/` en el navegador. No necesitas `kubectl port-forward`: los puertos 80 y 443 ya se mapearon al crear kind en el Lab 13. Usa HTTP para esta práctica; aquí no se configuró un certificado HTTPS para la aplicación.

## E. Evidencia del balanceo

Ejecuta varias solicitudes independientes:

```powershell
1..12 | ForEach-Object {
    curl.exe -fsS -H "Connection: close" http://localhost/
    Write-Host ""
}
```

Cada línea debe contener un JSON con `hostname`. Identifica al menos **dos hostnames distintos** y compáralos con los nombres de los Pods de la captura 1. El contador es independiente por Pod; no es un contador global y puede reiniciarse si se reemplaza el Pod.

No se garantiza alternancia exacta en cada par de solicitudes; si las primeras respuestas vienen del mismo Pod, repite la secuencia. No cambies el JSON ni el nombre del Pod para construir la evidencia.

### Captura 2: dos respuestas con hostnames distintos

Deja visibles al menos dos respuestas reales con nombres de Pod diferentes, junto con el comando o la URL. Captura con **Win + Shift + S** y guarda **`lab14-02-balanceo.png`**. El navegador es una alternativa, pero la terminal permite mostrar ambas respuestas juntas con más facilidad.

## F. Escalar a cuatro réplicas

Después de guardar las capturas de dos réplicas y balanceo:

```powershell
kubectl scale deployment status-api --replicas=4
kubectl rollout status deployment/status-api --timeout=180s
kubectl get pods -l app=status-api
kubectl get pods
```

Debes ver **cuatro Pods status-api**, todos `1/1 Running`. Puedes repetir las solicitudes HTTP; deberían aparecer hasta cuatro hostnames distintos. El YAML mantiene el estado inicial de dos réplicas: volver a aplicar ese archivo después de escalar puede devolver el Deployment a dos.

### Captura 3: cuatro réplicas

Captura el comando `kubectl get pods` y sus resultados, mostrando las **cuatro filas de status-api en `1/1 Running`**. Si es posible, incluye arriba el comando de escalado. Guarda **`lab14-03-cuatro-replicas.png`**.

## G. Limpieza final — solo después de las capturas

Antes de borrar, guarda todas las evidencias de los Labs 13 y 14 fuera del clúster. Comprueba qué clúster estás eliminando:

```powershell
kind get clusters
kubectl config current-context
```

Cuando termines la entrega:

```powershell
kind delete cluster --name devsecops-lab
kind get clusters
docker ps
```

Esto elimina Kafka, consumidor, productor, las réplicas de status-api y el Ingress de ese clúster. Guarda opcionalmente una captura adicional **`lab14-04-limpieza.png`** de la eliminación y la ausencia de `devsecops-lab` en la lista. El documento exige realizar la limpieza, aunque solo enumera tres capturas como entregables.

Opcionalmente, cuando ya no necesites las imágenes:

```powershell
docker rmi devsecops-lab/k8s-app:1.0 devsecops-lab/status-api:1.0
```

No uses `docker system prune`, no borres imágenes ajenas a la práctica ni restablezcas Docker Desktop para realizar esta limpieza.

## Diagnóstico

| Error | Qué revisar |
| --- | --- |
| Docker devuelve EOF o error en `/_ping` | Comprueba Docker Desktop y `docker version` antes de repetir el build. |
| `ErrImagePull` / `ImagePullBackOff` en status-api | Primero construye con `--load`, luego carga la imagen en kind. Después usa `kubectl rollout restart deployment/status-api`. |
| Imagen nueva con la misma etiqueta | Después del build, vuelve a cargarla con kind y reinicia el Deployment; `IfNotPresent` no fuerza un cambio por sí solo. |
| Ingress controller o admission Jobs no descargan sus imágenes | Usa `kubectl describe pod NOMBRE -n ingress-nginx`; permite acceso a `registry.k8s.io` y sus destinos de descarga. No son credenciales de AWS. |
| Webhook no responde al aplicar el Ingress | Espera el controlador y ambos admission Jobs; revisa sus logs. No desactives el webhook para ocultar el error. |
| `localhost` no conecta | Comprueba controlador, contexto kind, puertos 80/443 del nodo y posibles procesos locales ocupando el puerto 80. |
| HTTP 404 de nginx | Revisa `kubectl get ingress`, su clase `nginx` y el backend `status-api:80`. Puede tardar unos segundos en propagarse una regla nueva. |
| HTTP 503 | Revisa `kubectl get pods -l app=status-api` y `kubectl describe deployment status-api`; normalmente faltan endpoints listos. |
| `/health` muestra `message` y `hostname` | Hay una regla de reescritura incorrecta; aplica el `status-api-ingress.yaml` de este repositorio, que preserva la ruta. |

## Entregables

- `status-api/server.js`, `package.json`, **`package-lock.json`**, `Dockerfile` y `.dockerignore`.
- `k8s/status-api-deployment.yaml` y `k8s/status-api-ingress.yaml`.
- El manifiesto auxiliar `k8s/ingress-nginx-kind.yaml` deja fijada la dependencia de la práctica.
- Capturas 1, 2 y 3. La limpieza se realiza al final.

## Validación en este entorno

La imagen multi-stage se construyó y el test HTTP pasó. Se desplegaron dos y luego cuatro réplicas reales en el clúster del Lab 13, se comprobó `/health` y se verificaron respectivamente dos y cuatro hostnames por HTTP a través del **Service interno**. El servidor Kubernetes validó los manifiestos de la API e Ingress.

**Pendiente:** el proxy de este entorno devuelve 403 para `registry.k8s.io`; no se descargó el controlador ni se verificó el acceso por Ingress desde `localhost`. El balanceo interno comprobado no sustituye esa prueba ni tus capturas de entrega. La limpieza cloud queda pendiente mientras se resuelve ese bloqueo. Se guardó la ampliación de red en el borrador del entorno; guardarla no la aplica automáticamente al proceso actual.
