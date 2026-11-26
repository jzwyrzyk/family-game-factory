FROM node:22-bookworm-slim AS builder
WORKDIR /source
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY index.html ./
COPY src ./src
COPY public ./public
COPY scripts/beta/build.mjs ./scripts/beta/build.mjs
COPY server/beta/web ./server/beta/web
RUN node scripts/beta/build.mjs
COPY --chown=node:node server ./server
RUN rm -f server/coach/private-provider.ts server/coach/private-executor.ts server/coach/private-speech-provider.ts server/coach/cloud-token.ts
FROM node:22-bookworm-slim
WORKDIR /app
COPY --from=builder --chown=node:node /source/node_modules ./node_modules
COPY --from=builder --chown=node:node /source/dist-family-beta ./dist-family-beta
COPY --chown=node:node package.json ./
COPY --from=builder --chown=node:node /source/server ./server
COPY --chown=node:node src/runtime/types.ts src/runtime/manifests.ts ./src/runtime/
COPY --chown=node:node src/builder/submission.ts ./src/builder/
COPY --chown=node:node src/storage/record-contract.ts src/storage/sync-contract.ts src/storage/cloud-recovery.ts src/storage/recovery-format.ts ./src/storage/
COPY --chown=node:node src/learning/grades.ts ./src/learning/
COPY --chown=node:node src/studio/design.ts src/studio/creation-readiness.ts src/studio/conversation-view.ts ./src/studio/
COPY --chown=node:node src/creation/model.ts src/creation/projects.ts src/creation/illustrated-art.ts src/creation/movement-worlds.ts ./src/creation/
COPY --chown=node:node src/drawing/animation-path.ts ./src/drawing/
COPY --chown=node:node src/pals/catalog.ts src/pals/catalog-artwork.generated.ts src/pals/historical-scene-art.json ./src/pals/
ENV NODE_ENV=production
USER node
EXPOSE 8080
CMD ["node","--import","tsx","server/gateway.ts"]
