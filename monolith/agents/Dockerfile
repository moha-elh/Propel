# Light image (~2 GB): all agents, no torch. Local embeddings fall back to the
# API providers. For local sentence-transformers embeddings use Dockerfile.embeddings.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Runtime libs for weasyprint (pango/cairo/gdk-pixbuf) + fonts. LaTeX CV
# compilation is NOT bundled — it shells out to a dockerized texlive and only
# works in native dev (see shared/tools/latex_compile.py).
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpango-1.0-0 libpangocairo-1.0-0 libcairo2 libgdk-pixbuf-2.0-0 \
        libffi8 shared-mime-info fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependency layer — cached until pyproject.toml changes. Stub packages let the
# editable install resolve all (heavy) deps without re-running on every source edit.
COPY pyproject.toml ./
RUN mkdir -p shared agents \
    && touch shared/__init__.py agents/__init__.py \
    && pip install -e .

# Real source (editing this does NOT re-trigger the heavy pip layer above).
COPY shared ./shared
COPY agents ./agents
COPY main.py ./

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
