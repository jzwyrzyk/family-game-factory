# Build the dedicated stateless, keyless private coach service.
# This Dockerfile is not run by the public Pages or factory-generation pipeline.
FROM node:22-bookworm-slim AS build
WORKDIR /work
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY src ./src
COPY server ./server
COPY scripts/deployment/build-private-coach.mjs ./scripts/deployment/build-private-coach.mjs
RUN node scripts/deployment/build-private-coach.mjs

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY --from=build --chown=10001:10001 /work/dist-private/coach-server.mjs ./coach-server.mjs
USER 10001:10001
EXPOSE 8080
CMD ["node","/app/coach-server.mjs"]
