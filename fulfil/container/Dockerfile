# TripMyWay print file converter. Build context: the repository root
# (fulfil/wrangler.jsonc sets image_build_context to "..").

# 1. Bundle the converter with the site's own print renderer.
FROM oven/bun:1.4.2 AS build
WORKDIR /repo
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
COPY fulfil/container ./fulfil/container
RUN bun build fulfil/container/server.ts --target=node --outfile=/out/server.mjs

# 2. Run it with pdftoppm (Poppler) and libvips.
FROM node:22.22.0-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends poppler-utils libvips-tools ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /out/server.mjs ./server.mjs
COPY public/fonts/print ./fonts/print
ENV PORT=8080 NODE_ENV=production
EXPOSE 8080
CMD ["node", "server.mjs"]
