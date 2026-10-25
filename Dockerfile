FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --only=production

COPY dist ./dist

EXPOSE 8080
CMD ["node", "dist/server.cjs"]