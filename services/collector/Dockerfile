FROM python:3.12-slim

WORKDIR /workspace
COPY requirements-dev.txt ./
RUN python -m pip install --no-cache-dir -r requirements-dev.txt
COPY scripts scripts
COPY packages/schemas packages/schemas
COPY fixtures/market fixtures/market
COPY services/collector/collector services/collector/collector
ENV PYTHONPATH=/workspace:/workspace/services/collector
ENTRYPOINT ["python", "-m", "collector.cli"]
