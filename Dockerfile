FROM node:14

# Install app
WORKDIR /app/api
# RUN pwd
COPY package*.json ./
COPY tsconfig*.json ./
COPY src /app/api/src

RUN yarn
RUN yarn run tsc

# Expose correct ports
EXPOSE 3030

# Start the server
CMD ["node", "build/index.js"]