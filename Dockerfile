# --- Build stage: backend deps installed into /usr/local ---
FROM python:3.11-slim AS base

WORKDIR /app
COPY pyproject.toml README.md ./
COPY agent ./agent
COPY app ./app
RUN pip install --no-cache-dir .

# --- Build stage: web UI ---
FROM node:20-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json* ./
RUN npm install
COPY web ./
RUN npm run build

# --- Final image: backend + built SPA ---
FROM python:3.11-slim
WORKDIR /app
COPY --from=base /usr/local /usr/local
COPY --from=web /web/dist ./web/dist
COPY pyproject.toml README.md ./
COPY agent ./agent
COPY app ./app
ENV PATH=/usr/local/bin:$PATH

# Seed the demo dataset on first boot so a hosted instance is never an empty
# screen. Seeding is skipped when the store already has rows, and the whole
# behaviour is off with -e BLACKBOOK_SEED_DEMO=0.
ENV BLACKBOOK_SEED_DEMO=1

EXPOSE 8080

# Shell form on purpose: Cloud Run, Render and Fly all inject the port to bind
# through $PORT, and the exec form would treat "${PORT}" as a literal.
CMD uvicorn app.api:app --host 0.0.0.0 --port ${PORT:-8080}
