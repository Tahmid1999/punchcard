FROM node:22-alpine AS build
WORKDIR /app
# The schema is copied before npm ci because the postinstall hook runs
# prisma generate, which needs it.
COPY package*.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json prisma.config.ts ./
COPY prisma ./prisma
# --ignore-scripts because prisma is a devDependency and the CLI is absent
# here; the client generated in the build stage is copied in instead.
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=build /app/node_modules/prisma ./node_modules/prisma
COPY --from=build /app/node_modules/.bin ./node_modules/.bin
EXPOSE 3200
CMD ["node", "dist/main"]
