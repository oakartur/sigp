FROM node:20-alpine

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY . .

# Expõe porta 80 para mapeamento do docker-compose
EXPOSE 80

# Build pro Vite
# Para dev, podemos usar npm run dev. Para prod, usaríamos um Nginx.
# Com a proposta do docker-compose pedindo "80", faremos dev:
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "80"]
