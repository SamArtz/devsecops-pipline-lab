FROM node:22-alpine

WORKDIR /app

COPY --chmod=644 package.json package-lock.json ./
RUN --mount=type=secret,id=npm_ca \
    if [ -f /run/secrets/npm_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca; fi; \
    npm ci --omit=dev && npm cache clean --force

COPY --chmod=644 client.js kafka-producer.js kafka-consumer.js ./

RUN addgroup -S -g 10001 appgroup && adduser -S -u 10001 appuser -G appgroup
USER 10001:10001

CMD ["node", "kafka-consumer.js"]
