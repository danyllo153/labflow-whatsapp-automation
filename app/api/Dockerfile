# Imagem da API do app LabFlow (APP-011). Spec: 06-api-e-auth.md (v1.0), "Arquitetura".
# Roda como usuário sem privilégios; a porta 8000 só é alcançada pela rede interna da stack (labflow-net).
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY labflow_api ./labflow_api

RUN useradd --create-home --uid 10001 labflow
USER labflow

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/saude', timeout=4).status == 200 else 1)"

# --proxy-headers: o Tailscale entrega o HTTPS e repassa para cá em HTTP dentro da rede interna.
CMD ["uvicorn", "labflow_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
