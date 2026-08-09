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

EXPOSE 8080

# Run the FastAPI app on Cloud Run (serves the SPA + API)
CMD ["uvicorn", "app.api:app", "--host", "0.0.0.0", "--port", "8080"]
