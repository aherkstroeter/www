FROM node:20-bookworm-slim AS build

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    chromium \
    curl \
  && rm -rf /var/lib/apt/lists/*

ARG HUGO_VERSION=0.170.1
RUN curl -fsSL -o /tmp/hugo.tar.gz \
      "https://github.com/gohugoio/hugo/releases/download/v${HUGO_VERSION}/hugo_${HUGO_VERSION}_linux-amd64.tar.gz" \
  && tar -C /usr/local/bin -xzf /tmp/hugo.tar.gz hugo \
  && rm /tmp/hugo.tar.gz \
  && hugo version

# Debian Chromium, not a second Chrome download. If mermaid-cli rejects this
# binary, drop PUPPETEER_SKIP_DOWNLOAD and PUPPETEER_EXECUTABLE_PATH so npm ci
# fetches the Chrome build Puppeteer expects.
ENV MERMAID_NO_SANDBOX=1 \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PUPPETEER_SKIP_DOWNLOAD=1

WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
LABEL org.opencontainers.image.source="https://github.com/aherkstroeter/www"
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/public /usr/share/nginx/html
