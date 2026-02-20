FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV HOME=/home/node
USER node
EXPOSE 3848
CMD ["npm", "start"]
