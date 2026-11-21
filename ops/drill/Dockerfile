FROM docker.io/library/node:22-bookworm-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee
ARG DRILL_MARKER=baseline
ENV DRILL_MARKER=$DRILL_MARKER
WORKDIR /app
COPY --chmod=0444 server.cjs .
USER node
CMD ["node", "/app/server.cjs"]
