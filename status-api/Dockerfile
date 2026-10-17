FROM node:22-alpine AS deps
WORKDIR /app
COPY --chmod=644 package.json package-lock.json ./
RUN --mount=type=secret,id=npm_ca \
    if [ -f /run/secrets/npm_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca; fi; \
    npm ci --omit=dev

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --chmod=644 package.json server.js ./
RUN addgroup -S -g 10001 appgroup && adduser -S -u 10001 appuser -G appgroup
USER 10001:10001
EXPOSE 3000
CMD ["node", "server.js"]
