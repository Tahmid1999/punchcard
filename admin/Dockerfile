FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Next inlines NEXT_PUBLIC_* into the browser bundle at build time, so these
# have to be build args. Setting them on the running container does nothing.
ARG NEXT_PUBLIC_PHONE_API_URL
ARG NEXT_PUBLIC_TIMEZONE=Asia/Dhaka
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/.next ./.next
COPY next.config.mjs ./
EXPOSE 3202
CMD ["npm", "run", "start"]
