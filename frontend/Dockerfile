FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run lint && npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY package.json server.js ./
USER node
ENV PORT=3000 BACKEND_URL=http://backend:4000
EXPOSE 3000
CMD ["node", "server.js"]
