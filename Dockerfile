FROM node:12.0.0-alpine
COPY app /app
RUN cd /app && yarn install
RUN mkdir -p /app/uploads
RUN chown -R node:node /app/uploads
WORKDIR /app
VOLUME ["/app/data"]
ENTRYPOINT su node -c "node app.js"
