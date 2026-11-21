FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY --chown=node:node server.js package.json ./
COPY --chown=node:node public ./public
RUN mkdir data && chown node:node data
USER node
VOLUME ["/app/data"]
EXPOSE 3000
CMD ["node","server.js"]
