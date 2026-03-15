# syntax=docker/dockerfile:1

FROM node:24 AS setup
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/ packages/
RUN find packages/ -type f \! \( -name "package.json" \) -delete && \
find . -type d -empty -delete

FROM node:24 AS build
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate
WORKDIR /app
COPY --from=setup /app .
RUN pnpm install --frozen-lockfile
COPY . .
WORKDIR /app/packages/apollo-collaboration-server
RUN pnpm build

FROM node:24
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate
LABEL org.opencontainers.image.source=https://github.com/GMOD/Apollo3
LABEL org.opencontainers.image.description="Apollo collaboration server"
WORKDIR /app
COPY --from=setup /app .
COPY --from=build /app/packages/apollo-collaboration-server/dist /app/packages/apollo-collaboration-server/dist
COPY --from=build /app/packages/apollo-common/dist /app/packages/apollo-common/dist
COPY --from=build /app/packages/apollo-mst/dist /app/packages/apollo-mst/dist
COPY --from=build /app/packages/apollo-shared/dist /app/packages/apollo-shared/dist
COPY --from=build /app/packages/apollo-entities/dist /app/packages/apollo-entities/dist
RUN pnpm install --frozen-lockfile --prod
EXPOSE 3999
CMD ["node", "packages/apollo-collaboration-server/dist/main.js"]
