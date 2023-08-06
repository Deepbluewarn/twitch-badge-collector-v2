import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import { resolve } from 'path';
import manifest from './manifest.json'

export default defineConfig({
  build: {
    minify: false,
    rollupOptions: {
      input: {
        welcome: resolve(__dirname, 'src', 'welcome', 'welcome.html'),
        setting: resolve(__dirname, 'src', 'setting', 'setting.html'),
      }
    }
  },
  plugins: [
    react(),
    crx({ manifest }),
  ],
})