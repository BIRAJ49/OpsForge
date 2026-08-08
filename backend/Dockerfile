FROM python:3.12-slim@sha256:229a2c5bfa27522db7815ea81f9bed70af17ccb9de9fc7ad142b1877b5830d36

ARG TRIVY_VERSION=0.70.0
ARG TRIVY_AMD64_SHA256=8b4376d5d6befe5c24d503f10ff136d9e0c49f9127a4279fd110b727929a5aa9
ARG TRIVY_ARM64_SHA256=2f6bb988b553a1bbac6bdd1ce890f5e412439564e17522b88a4541b4f364fc8d
ARG TARGETARCH=amd64

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && case "$TARGETARCH" in \
      amd64) trivy_arch="64bit"; trivy_sha="$TRIVY_AMD64_SHA256" ;; \
      arm64) trivy_arch="ARM64"; trivy_sha="$TRIVY_ARM64_SHA256" ;; \
      *) echo "Unsupported target architecture: $TARGETARCH" >&2; exit 1 ;; \
    esac \
    && curl -fsSL "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_Linux-${trivy_arch}.tar.gz" \
      -o /tmp/trivy.tar.gz \
    && echo "${trivy_sha}  /tmp/trivy.tar.gz" | sha256sum --check --strict \
    && tar -xzf /tmp/trivy.tar.gz -C /usr/local/bin trivy \
    && chmod 0755 /usr/local/bin/trivy \
    && apt-get purge -y --auto-remove curl \
    && rm -f /tmp/trivy.tar.gz \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

RUN useradd --create-home --uid 10001 --shell /usr/sbin/nologin opsforge

COPY --chown=opsforge:opsforge . .

USER 10001

EXPOSE 8000

CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
