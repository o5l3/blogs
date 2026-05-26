import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import postsPlugin from './vite-plugin-posts.js'
import seoPlugin from './vite-plugin-seo.js'

export default defineConfig({
  plugins: [react(), tailwindcss(), postsPlugin(), seoPlugin()],
  base: '/blogs/',
})
