import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // 1. 添加 base 路径，填写你的 GitHub 仓库名
  base: '/AI-Innovator/', 
  
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      // 这里的代理只在本地 'npm run dev' 时生效
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
})

