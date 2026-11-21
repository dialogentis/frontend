FROM node:24-alpine@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html tsconfig.json vite.config.ts ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM build AS development
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

FROM caddy:2-alpine@sha256:e70b164da81ef698b3ad19af799ea6086ce6d9e48ed4079eb9fe26f6fbf14ee5
ENV XDG_CONFIG_HOME=/tmp/caddy-config XDG_DATA_HOME=/tmp/caddy-data
RUN mkdir -p /var/lib/dialogentis-caddy/data /var/lib/dialogentis-caddy/config \
    && chown -R 10001:10001 /var/lib/dialogentis-caddy \
    && chmod 0700 /var/lib/dialogentis-caddy/data /var/lib/dialogentis-caddy/config
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /usr/share/caddy
EXPOSE 8080
USER 10001
