# Imagem do app LabFlow: API (FastAPI) + telas (React). Tarefas APP-011 e APP-012. Spec: 06 §Arquitetura, 07 §Direção.
# Contexto do build = pasta app/ (docker build -f api/Dockerfile app). Roda como usuário sem privilégios;
# a porta 8000 só é alcançada pela rede interna da stack (labflow-net).

# 1) Monta as telas (só neste estágio existe Node; a imagem final não leva node_modules)
FROM node:20.18.1-alpine AS telas
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# 2) API, que também entrega as telas em /app/
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 LABFLOW_WEB_DIR=/app/web
WORKDIR /app

COPY api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY api/labflow_api ./labflow_api
COPY --from=telas /web/dist ./web

RUN useradd --create-home --uid 10001 labflow
USER labflow

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/saude', timeout=4).status == 200 else 1)"

# --proxy-headers: o Tailscale entrega o HTTPS e repassa para cá em HTTP dentro da rede interna.
CMD ["uvicorn", "labflow_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
