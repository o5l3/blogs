import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import { marked } from 'marked'

const SITE = 'https://o5l3.github.io/blogs'

// 카테고리 메타 (이름 — sitemap·프리렌더 head용)
const CATEGORY_NAMES = {
  all: '전체',
  report: '리포트',
  tech: '기술',
  'dev-log': '개발로그',
  news: '소식',
}

function esc(s = '') {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function readPosts(postsDir) {
  if (!fs.existsSync(postsDir)) return []
  return fs.readdirSync(postsDir).filter(f => f.endsWith('.md')).map(file => {
    const raw = fs.readFileSync(path.join(postsDir, file), 'utf-8')
    const { data, content } = matter(raw)
    const id = file.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, '')
    return {
      id,
      title: data.title || '',
      excerpt: data.excerpt || '',
      category: data.category || '',
      date: data.date ? String(data.date).split('T')[0] : '',
      author: data.author || 'Orange Labs',
      tags: data.tags || [],
      content,
    }
  })
}

// dist/index.html 템플릿에 head 치환 + #root에 본문 주입
function renderPage(template, { title, description, url, bodyHtml, type = 'article' }) {
  let html = template
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
  html = html.replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(description)}" />`)
  html = html.replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${esc(title)}" />`)
  html = html.replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${esc(description)}" />`)
  html = html.replace(/<meta property="og:type"[^>]*>/, `<meta property="og:type" content="${esc(type)}" />`)
  html = html.replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${esc(url)}" />`)
  // 정규 URL
  if (!/rel="canonical"/.test(html)) {
    html = html.replace('</head>', `    <link rel="canonical" href="${esc(url)}" />\n  </head>`)
  }
  // 크롤러용 본문을 #root 안에 주입 (React createRoot가 마운트 시 교체 — 사용자엔 영향 없음)
  html = html.replace('<div id="root"></div>', `<div id="root">${bodyHtml}</div>`)
  return html
}

export default function seoPlugin() {
  return {
    name: 'vite-plugin-seo',
    apply: 'build',
    closeBundle() {
      const root = process.cwd()
      const dist = path.join(root, 'dist')
      const tplPath = path.join(dist, 'index.html')
      if (!fs.existsSync(tplPath)) return
      const template = fs.readFileSync(tplPath, 'utf-8')
      const posts = readPosts(path.join(root, '_posts'))
        .sort((a, b) => new Date(b.date) - new Date(a.date))

      // 1) 각 글 정적 HTML 프리렌더 → dist/post/{id}/index.html
      for (const p of posts) {
        const article = `
<article>
  <p>${esc(CATEGORY_NAMES[p.category] || p.category)} · ${esc(p.author)} · ${esc(p.date)}</p>
  <h1>${esc(p.title)}</h1>
  <p>${esc(p.excerpt)}</p>
  ${marked.parse(p.content)}
  <p>${(p.tags || []).map(t => `#${esc(t)}`).join(' ')}</p>
</article>`.trim()
        const pageHtml = renderPage(template, {
          title: `${p.title} | Orange Labs`,
          description: p.excerpt || p.title,
          url: `${SITE}/post/${p.id}`,
          bodyHtml: article,
          type: 'article',
        })
        const outDir = path.join(dist, 'post', p.id)
        fs.mkdirSync(outDir, { recursive: true })
        fs.writeFileSync(path.join(outDir, 'index.html'), pageHtml)
      }

      // 2) 카테고리 페이지 head 프리렌더 → dist/category/{id}/index.html
      const cats = [...new Set(['all', ...posts.map(p => p.category)])]
      for (const c of cats) {
        const list = (c === 'all' ? posts : posts.filter(p => p.category === c))
        const body = `
<section>
  <h1>${esc(CATEGORY_NAMES[c] || c)}</h1>
  <ul>${list.map(p => `<li><a href="${SITE}/post/${p.id}">${esc(p.title)}</a> — ${esc(p.excerpt)}</li>`).join('')}</ul>
</section>`.trim()
        const pageHtml = renderPage(template, {
          title: `${CATEGORY_NAMES[c] || c} | Orange Labs Blog`,
          description: `오렌지랩스 ${CATEGORY_NAMES[c] || c} 글 모음`,
          url: `${SITE}/category/${c}`,
          bodyHtml: body,
          type: 'website',
        })
        const outDir = path.join(dist, 'category', c)
        fs.mkdirSync(outDir, { recursive: true })
        fs.writeFileSync(path.join(outDir, 'index.html'), pageHtml)
      }

      // 3) sitemap.xml 자동생성
      const today = new Date().toISOString().split('T')[0]
      const urls = []
      urls.push({ loc: `${SITE}/`, lastmod: today, priority: '1.0' })
      for (const c of cats) urls.push({ loc: `${SITE}/category/${c}`, lastmod: today, priority: '0.6' })
      const tags = [...new Set(posts.flatMap(p => p.tags || []))]
      for (const t of tags) urls.push({ loc: `${SITE}/tag/${encodeURIComponent(t)}`, lastmod: today, priority: '0.4' })
      for (const p of posts) urls.push({ loc: `${SITE}/post/${p.id}`, lastmod: p.date || today, priority: '0.8' })
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <priority>${u.priority}</priority>\n  </url>`).join('\n')}
</urlset>
`
      fs.writeFileSync(path.join(dist, 'sitemap.xml'), xml)

      console.log(`[seo] prerendered ${posts.length} posts, ${cats.length} categories; sitemap ${urls.length} urls`)
    },
  }
}
