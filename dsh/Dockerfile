FROM node:22-bookworm AS build

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/deepseek-harness
COPY deepseek-harness/ ./
COPY patches/ha-ingress.patch /tmp/ha-ingress.patch

RUN git apply --unidiff-zero --whitespace=nowarn /tmp/ha-ingress.patch \
    && rm /tmp/ha-ingress.patch

RUN corepack enable \
    && corepack prepare pnpm@11.7.0 --activate \
    && pnpm install --frozen-lockfile \
    && pnpm run build

FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl git ripgrep \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    DSH_HOME=/data/dsh \
    DSH_TELEMETRY_DISABLED=1

WORKDIR /data/workspace

COPY --from=build /opt/deepseek-harness /opt/deepseek-harness
COPY patches/ha.patch.yml /etc/dsh/ha.patch.yml
COPY rootfs/usr/local/bin/dsh-ha.mjs /usr/local/bin/dsh-ha.mjs

RUN chmod 0755 /usr/local/bin/dsh-ha.mjs \
    && mkdir -p /data/dsh /data/workspace

EXPOSE 3080

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3080/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

LABEL \
  io.hass.type="app" \
  io.hass.name="DeepSeek Harness" \
  io.hass.description="Run DeepSeek Harness in Home Assistant."

CMD ["node", "/usr/local/bin/dsh-ha.mjs"]
