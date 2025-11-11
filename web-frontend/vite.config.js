import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    // 添加历史API回退支持，处理SPA路由
    historyApiFallback: true,
    // 允许特定的主机名访问
    allowedHosts: [
      'gmic.top',
      'localhost',
      '127.0.0.1'
    ],
    // 添加代理配置，将GraphQL请求代理到Linera服务
    proxy: {
      '/chains': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
        changeOrigin: true,
      }
    }
  },
  build: {
    outDir: 'build',
  },
  define: {
    global: 'globalThis',
  },
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.[tj]sx?$/,
    exclude: [],
  },
  optimizeDeps: {
    // Exclude Linera client from optimization to prevent issues
    exclude: ['@linera/client'],
    esbuildOptions: {
      loader: {
        '.js': 'jsx',
      },
    },
  },
});