FROM node:22-bookworm-slim
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app/server/sandbox
COPY --chmod=644 server/sandbox/package.json server/sandbox/package-lock.json server/sandbox/worker.cjs server/sandbox/preview.cjs server/sandbox/preview-v2.cjs server/sandbox/bundle-v2.cjs server/sandbox/playtest-v2.cjs server/sandbox/intent-playtest-v2.cjs server/sandbox/source-validator.cjs server/sandbox/language-v2.cjs ./
COPY --chmod=644 server/sandbox/trusted/ ./trusted/
RUN find trusted -type d -exec chmod 755 {} + \
 && npm ci --ignore-scripts --no-audit --no-fund \
 && npx playwright install --with-deps --only-shell chromium \
 && rm -rf /ms-playwright/chromium-* /var/lib/apt/lists/* \
 && npm cache clean --force
USER node
ENV NODE_ENV=production
ENTRYPOINT ["node", "/app/server/sandbox/worker.cjs"]
