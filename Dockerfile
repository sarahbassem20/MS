FROM node:18-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 8080
CMD ["node", "dist/server.cjs"]