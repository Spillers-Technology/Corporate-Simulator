FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
USER node
ENV PORT=4000 DATA_DIR=/data
EXPOSE 4000
CMD ["node", "src/server.js"]
