# Docker Hub python:3.13-slim-bookworm multi-platform manifest, resolved 2026-11-24.
# The trusted controller supplies only these reviewed files and verified site/.
FROM python:3.13-slim-bookworm@sha256:a5a7017efc5969e00ae2b91c8eb0631049a569652aa4ffc4501769049ae45c72
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY --chown=65532:65532 site_server.py /app/site_server.py
COPY --chown=65532:65532 site/ /site/
USER 65532:65532
EXPOSE 8080
ENTRYPOINT ["python", "-I", "/app/site_server.py", "--directory", "/site"]
