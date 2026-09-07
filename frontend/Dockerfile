# --------- Stage 1: Build Angular app ----------
FROM node:20-alpine AS build

WORKDIR /app

# Copy dependencies first (better caching)
COPY package*.json ./
# --legacy-peer-deps: committed lock has @angular/core 21.2.16 vs animations 21.2.22
# (exact peer), an upstream skew; ci keeps the build reproducible from the lockfile.
RUN npm ci --legacy-peer-deps

# Copy the rest of the project
COPY . .

# Build the Angular app (production)
RUN npm run build

# --------- Stage 2: Serve with Nginx ----------
FROM nginx:alpine

# Install envsubst (gettext)
RUN apk add --no-cache gettext

# Copy built Angular files to nginx
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html

# Copy nginx template (to be substituted at runtime)
COPY nginx.conf.template /etc/nginx/conf.d/default.conf.template

# Expose port
EXPOSE 80

# Start nginx with envsubst
CMD envsubst '${GATEWAY_HOST} ${GATEWAY_PORT} ${FRONTEND_HOST} ${FRONTEND_PORT}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'
