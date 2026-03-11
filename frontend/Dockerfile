FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Variável de ambiente injetada em build-time pelo Docker Compose
ARG VITE_API_URL=/sigp-api
ENV VITE_API_URL=$VITE_API_URL

COPY package*.json ./
RUN npm ci

COPY . .

# Builda a aplicação React com Vite
RUN npm run build

# --- Estágio 2: Servir arquivos estáticos via Nginx ---
FROM nginx:alpine

# Copia os arquivos buildados do estágio anterior
COPY --from=builder /usr/src/app/dist /usr/share/nginx/html

# Copia a configuração customizada do nginx (SPA-friendly)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
