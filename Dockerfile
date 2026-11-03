# Zeitstrahl – schlankes Image: Node 22 (führt TypeScript direkt aus) + ffmpeg.
FROM node:22-alpine

RUN apk add --no-cache ffmpeg tini

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY src ./src
COPY public ./public
COPY data ./data

ENV NODE_ENV=production \
    PORT=3700 \
    HOST=0.0.0.0 \
    ZEITSTRAHL_MUSIK=/musik \
    ZEITSTRAHL_DATEN=/daten

RUN mkdir -p /daten /musik && chown node:node /daten
USER node
VOLUME ["/daten"]
EXPOSE 3700

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3700/healthz >/dev/null || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "--disable-warning=ExperimentalWarning", "src/server.ts"]
