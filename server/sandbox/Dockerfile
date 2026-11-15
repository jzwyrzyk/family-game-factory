FROM node:22-bookworm-slim
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /worker
COPY --chmod=644 server/sandbox/package.json server/sandbox/package-lock.json server/sandbox/worker.cjs server/sandbox/preview.cjs ./
RUN npm ci --ignore-scripts --no-audit --no-fund \
 && npx playwright install --with-deps --only-shell chromium \
 && rm -rf /ms-playwright/chromium-* /var/lib/apt/lists/* \
 && npm cache clean --force
USER node
ENV NODE_ENV=production
ENTRYPOINT ["node", "/worker/worker.cjs"]
