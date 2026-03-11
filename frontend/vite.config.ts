import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Permite acesso externo à rede do container
    port: 80,
    strictPort: true, // Garante que não irá procurar outra porta aleatória
  }
})
