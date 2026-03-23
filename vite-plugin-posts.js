import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'

const VIRTUAL_MODULE_ID = 'virtual:posts'
const RESOLVED_VIRTUAL_MODULE_ID = '\0' + VIRTUAL_MODULE_ID

export default function postsPlugin() {
  return {
    name: 'vite-plugin-posts',

    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) {
        return RESOLVED_VIRTUAL_MODULE_ID
      }
    },

    load(id) {
      if (id === RESOLVED_VIRTUAL_MODULE_ID) {
        const postsDir = path.resolve(process.cwd(), '_posts')

        if (!fs.existsSync(postsDir)) {
          return 'export const posts = []; export const postContents = {};'
        }

        const files = fs.readdirSync(postsDir).filter(f => f.endsWith('.md'))
        const posts = []
        const contents = {}

        for (const file of files) {
          const raw = fs.readFileSync(path.join(postsDir, file), 'utf-8')
          const { data, content } = matter(raw)

          // Generate id from filename: 2026-01-08-my-post.md -> my-post
          const id = file.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, '')

          posts.push({
            id,
            title: data.title || '',
            excerpt: data.excerpt || '',
            category: data.category || '',
            date: data.date ? String(data.date).split('T')[0] : '',
            author: data.author || 'Orange Labs',
            tags: data.tags || [],
            thumbnail: data.thumbnail || null,
          })

          contents[id] = content
        }

        // Sort by date descending
        posts.sort((a, b) => new Date(b.date) - new Date(a.date))

        return `
export const posts = ${JSON.stringify(posts, null, 2)};
export const postContents = ${JSON.stringify(contents, null, 2)};
`
      }
    },

    handleHotUpdate({ file, server }) {
      if (file.includes('_posts') && file.endsWith('.md')) {
        const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_MODULE_ID)
        if (mod) {
          server.moduleGraph.invalidateModule(mod)
          server.ws.send({ type: 'full-reload' })
        }
      }
    },
  }
}
