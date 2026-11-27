FROM python:3.12-slim-bookworm@sha256:44cf1793efa7c7a476bb0f2cff81443f4a072c90c1cb127e2924933daa3e8c64
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.lock /app/requirements.lock
RUN pip install --no-cache-dir --only-binary=:all: --require-hashes -r requirements.lock
COPY main.py /app/main.py
USER 65532:65532
CMD ["functions-framework", "--target=request_evidence", "--host=0.0.0.0", "--port=8080"]
