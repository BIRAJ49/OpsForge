FROM python:3.12-alpine@sha256:6d43704baacd1bfbe7c295d7f13079d5d8104ed33568873133f8fc69980419df AS python-dependencies

WORKDIR /build

COPY requirements.txt .

RUN apk add --no-cache build-base cargo \
    && CARGO_HOME=/tmp/opsforge-cargo pip wheel --no-cache-dir \
      --wheel-dir /wheels -r requirements.txt \
    && rm -rf /tmp/opsforge-cargo

FROM python:3.12-alpine@sha256:6d43704baacd1bfbe7c295d7f13079d5d8104ed33568873133f8fc69980419df

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
COPY --from=python-dependencies /wheels /wheels

RUN apk add --no-cache ca-certificates libffi libgcc libstdc++ \
    && pip install --no-cache-dir --no-index --find-links=/wheels -r requirements.txt \
    && python -m pip check \
    && python -c "import bcrypt, cryptography, greenlet, httptools, psycopg2, pydantic_core, uvloop, watchfiles, websockets, yaml" \
    && rm -rf /wheels

RUN addgroup -S -g 10001 opsforge \
    && adduser -S -D -H -u 10001 -G opsforge opsforge

COPY --chown=opsforge:opsforge . .

USER 10001:10001

EXPOSE 8000

CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
