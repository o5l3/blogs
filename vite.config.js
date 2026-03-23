import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import postsPlugin from './vite-plugin-posts.js'

export default defineConfig({
  plugins: [react(), tailwindcss(), postsPlugin()],
  base: '/blogs/',
})
