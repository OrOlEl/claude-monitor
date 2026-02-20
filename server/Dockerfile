FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY src/ ./src/
ENV HOME=/home/node
ENV HOST=0.0.0.0
USER node
EXPOSE 3847
CMD ["node", "src/index.js"]
