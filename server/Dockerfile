FROM node:12.18.3

RUN mkdir -p /teleplot
WORKDIR /teleplot

# Setup node envs
ARG NODE_ENV
ENV NODE_ENV $NODE_ENV

# Install dependencies
COPY . /teleplot/
RUN npm install && npm cache clean --force

# Expose required ports
EXPOSE 8080
EXPOSE 47269

# Start
ENTRYPOINT [ "node", "main.js" ]
