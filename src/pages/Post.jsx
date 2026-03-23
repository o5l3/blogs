import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import rehypeRaw from 'rehype-raw'
import { getPostById, getPostContent, posts, categories } from '../data/posts'

const categoryColors = {
  report: 'bg-blue-50 text-blue-600',
  tech: 'bg-emerald-50 text-emerald-600',
  news: 'bg-orange-50 text-orange-600',
}

function getReadingTime(content) {
  const words = content.replace(/[#*`\[\]()>|_~-]/g, '').trim().split(/\s+/).length
  const mins = Math.max(1, Math.ceil(words / 200))
  return mins
}

function extractHeadings(content) {
  const headings = []
  const lines = content.split('\n')
  for (const line of lines) {
    const match = line.match(/^(#{2,3})\s+(.+)/)
    if (match) {
      const level = match[1].length
      const text = match[2].replace(/[*`]/g, '').trim()
      const id = text.replace(/\s+/g, '-').replace(/[^\wㄱ-ㅎㅏ-ㅣ가-힣-]/g, '').toLowerCase()
      headings.push({ level, text, id })
    }
  }
  return headings
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={handleCopy}
      className="absolute top-3 right-3 text-[11px] text-gray-400 bg-gray-800 hover:bg-gray-700 px-2.5 py-1 rounded-md transition-colors font-medium"
    >
      {copied ? '복사됨!' : '복사'}
    </button>
  )
}

export default function Post() {
  const { id } = useParams()
  const post = getPostById(id)
  const [progress, setProgress] = useState(0)
  const [tocOpen, setTocOpen] = useState(false)
  const articleRef = useRef(null)

  const handleScroll = useCallback(() => {
    if (!articleRef.current) return
    const el = articleRef.current
    const rect = el.getBoundingClientRect()
    const total = el.scrollHeight - window.innerHeight
    const scrolled = -rect.top
    setProgress(Math.min(100, Math.max(0, (scrolled / total) * 100)))
  }, [])

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  if (!post) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-20 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">게시글을 찾을 수 없습니다</h1>
        <Link to="/" className="text-orange-500 hover:underline">홈으로 돌아가기</Link>
      </div>
    )
  }

  const content = getPostContent(post.id)
  const cat = categories.find(c => c.id === post.category)
  const colorClass = categoryColors[post.category] || 'bg-gray-50 text-gray-600'
  const readingTime = getReadingTime(content)
  const headings = extractHeadings(content)

  // Prev/Next posts
  const sorted = [...posts].sort((a, b) => new Date(b.date) - new Date(a.date))
  const currentIndex = sorted.findIndex(p => p.id === post.id)
  const prevPost = currentIndex < sorted.length - 1 ? sorted[currentIndex + 1] : null
  const nextPost = currentIndex > 0 ? sorted[currentIndex - 1] : null

  // Related posts (same category, exclude current)
  const relatedPosts = posts
    .filter(p => p.category === post.category && p.id !== post.id)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 2)

  const scrollToHeading = (headingId) => {
    const el = document.getElementById(headingId)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setTocOpen(false)
    }
  }

  return (
    <div className="bg-white" ref={articleRef}>
      {/* Reading progress bar */}
      <div className="fixed top-16 left-0 right-0 z-40 h-[2px] bg-gray-100">
        <div
          className="h-full bg-gradient-to-r from-orange-400 to-orange-500 transition-all duration-150 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Post Header */}
      <div className="bg-[#fafafa] border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-6 pt-10 pb-12">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-[13px] text-gray-400 mb-8">
            <Link to="/" className="hover:text-orange-500 transition-colors">홈</Link>
            <svg className="w-3 h-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <Link to={`/category/${post.category}`} className="hover:text-orange-500 transition-colors">{cat?.name}</Link>
            <svg className="w-3 h-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="text-gray-500 truncate max-w-[200px]">{post.title}</span>
          </nav>

          <span className={`inline-block text-[11px] font-bold px-3 py-1 rounded-full mb-5 ${colorClass}`}>
            {cat?.name}
          </span>
          <h1 className="text-[1.75rem] md:text-[2.2rem] font-extrabold text-gray-900 leading-tight mb-5">
            {post.title}
          </h1>
          <div className="flex items-center gap-3 text-[13px] text-gray-400">
            <span className="font-medium text-gray-500">{post.author}</span>
            <span className="w-1 h-1 bg-gray-300 rounded-full" />
            <span>{post.date}</span>
            <span className="w-1 h-1 bg-gray-300 rounded-full" />
            <span>{readingTime}분 읽기</span>
          </div>
        </div>
      </div>

      {/* TOC (collapsible) */}
      {headings.length > 2 && (
        <div className="max-w-3xl mx-auto px-6 pt-8">
          <button
            onClick={() => setTocOpen(!tocOpen)}
            className="flex items-center gap-2 text-[13px] font-semibold text-gray-500 hover:text-orange-500 transition-colors"
          >
            <svg className={`w-4 h-4 transition-transform ${tocOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            목차
          </button>
          {tocOpen && (
            <nav className="mt-3 mb-2 pl-6 border-l-2 border-orange-200 space-y-1.5">
              {headings.map((h, i) => (
                <button
                  key={i}
                  onClick={() => scrollToHeading(h.id)}
                  className={`block text-left text-[13px] hover:text-orange-500 transition-colors leading-relaxed ${
                    h.level === 3 ? 'pl-4 text-gray-400' : 'text-gray-600 font-medium'
                  }`}
                >
                  {h.text}
                </button>
              ))}
            </nav>
          )}
        </div>
      )}

      {/* Post Content */}
      <article className="max-w-3xl mx-auto px-6 py-12">
        <div className="post-content">
          <Markdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight, rehypeRaw]}
            components={{
              h1: ({ children }) => (
                <h1 className="text-[1.6rem] font-extrabold text-gray-900 mt-14 mb-5 first:mt-0">
                  {children}
                </h1>
              ),
              h2: ({ children }) => {
                const text = String(children).replace(/[*`]/g, '').trim()
                const hid = text.replace(/\s+/g, '-').replace(/[^\wㄱ-ㅎㅏ-ㅣ가-힣-]/g, '').toLowerCase()
                return (
                  <h2 id={hid} className="text-[1.3rem] font-bold text-gray-900 mt-12 mb-4 pb-3 border-b border-gray-100 scroll-mt-20">
                    {children}
                  </h2>
                )
              },
              h3: ({ children }) => {
                const text = String(children).replace(/[*`]/g, '').trim()
                const hid = text.replace(/\s+/g, '-').replace(/[^\wㄱ-ㅎㅏ-ㅣ가-힣-]/g, '').toLowerCase()
                return (
                  <h3 id={hid} className="text-[1.1rem] font-bold text-gray-900 mt-8 mb-3 scroll-mt-20">
                    {children}
                  </h3>
                )
              },
              p: ({ children }) => (
                <p className="text-[15px] text-gray-600 leading-[1.85] mb-5">
                  {children}
                </p>
              ),
              ul: ({ children }) => (
                <ul className="my-4 ml-1 space-y-2">
                  {children}
                </ul>
              ),
              ol: ({ children }) => (
                <ol className="my-4 ml-1 space-y-2 list-decimal list-inside">
                  {children}
                </ol>
              ),
              li: ({ children }) => (
                <li className="text-[14px] text-gray-600 leading-[1.8] pl-1 relative before:content-['•'] before:text-orange-400 before:mr-2.5 before:font-bold">
                  {children}
                </li>
              ),
              strong: ({ children }) => (
                <strong className="font-bold text-gray-900">{children}</strong>
              ),
              a: ({ href, children }) => (
                <a href={href} className="text-orange-500 hover:text-orange-600 underline underline-offset-2 decoration-orange-200 hover:decoration-orange-400 transition-colors" target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
              ),
              code: ({ className, children, ...props }) => {
                const isInline = !className
                if (isInline) {
                  return (
                    <code className="text-[13px] text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded font-mono" {...props}>
                      {children}
                    </code>
                  )
                }
                return (
                  <code className={className} {...props}>
                    {children}
                  </code>
                )
              },
              pre: ({ children }) => {
                const codeText = children?.props?.children || ''
                return (
                  <div className="relative group my-6">
                    <CopyButton text={String(codeText)} />
                    <pre className="bg-gray-900 text-gray-100 rounded-xl p-5 overflow-x-auto text-[13px] leading-relaxed">
                      {children}
                    </pre>
                  </div>
                )
              },
              table: ({ children }) => (
                <div className="my-6 overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full text-[13px]">
                    {children}
                  </table>
                </div>
              ),
              thead: ({ children }) => (
                <thead className="bg-gray-50 border-b border-gray-200">
                  {children}
                </thead>
              ),
              th: ({ children }) => (
                <th className="px-5 py-3 text-left font-bold text-gray-700 text-[12px] uppercase tracking-wider">
                  {children}
                </th>
              ),
              td: ({ children }) => (
                <td className="px-5 py-3.5 text-gray-600 border-b border-gray-50">
                  {children}
                </td>
              ),
              blockquote: ({ children }) => (
                <blockquote className="my-6 pl-5 border-l-[3px] border-orange-400 bg-orange-50/30 py-4 pr-5 rounded-r-lg text-[14px] text-gray-600 italic">
                  {children}
                </blockquote>
              ),
              hr: () => (
                <hr className="my-10 border-gray-100" />
              ),
              img: ({ src, alt }) => (
                <img src={src} alt={alt} className="rounded-xl shadow-md my-6 max-w-full" />
              ),
            }}
          >
            {content}
          </Markdown>
        </div>

        {/* Tags */}
        <div className="mt-14 pt-8 border-t border-gray-100">
          <p className="text-[11px] text-gray-400 font-bold tracking-widest uppercase mb-3">Tags</p>
          <div className="flex flex-wrap gap-2">
            {post.tags.map(tag => (
              <span key={tag} className="text-[12px] text-gray-500 bg-gray-50 px-3 py-1.5 rounded-full border border-gray-100">
                #{tag}
              </span>
            ))}
          </div>
        </div>

        {/* Prev / Next navigation */}
        <div className="mt-10 pt-8 border-t border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-4">
          {prevPost ? (
            <Link
              to={`/post/${prevPost.id}`}
              className="group flex flex-col p-5 rounded-xl border border-gray-100 hover:border-orange-200 hover:shadow-md transition-all"
            >
              <span className="text-[11px] text-gray-400 font-medium mb-1.5 flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                이전 글
              </span>
              <span className="text-[14px] font-bold text-gray-900 group-hover:text-orange-500 transition-colors line-clamp-2">
                {prevPost.title}
              </span>
            </Link>
          ) : <div />}
          {nextPost ? (
            <Link
              to={`/post/${nextPost.id}`}
              className="group flex flex-col items-end text-right p-5 rounded-xl border border-gray-100 hover:border-orange-200 hover:shadow-md transition-all"
            >
              <span className="text-[11px] text-gray-400 font-medium mb-1.5 flex items-center gap-1">
                다음 글
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </span>
              <span className="text-[14px] font-bold text-gray-900 group-hover:text-orange-500 transition-colors line-clamp-2">
                {nextPost.title}
              </span>
            </Link>
          ) : <div />}
        </div>

        {/* Related Posts */}
        {relatedPosts.length > 0 && (
          <div className="mt-10 pt-8 border-t border-gray-100">
            <h3 className="text-[15px] font-bold text-gray-900 mb-4">관련 글</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {relatedPosts.map(rp => (
                <Link
                  key={rp.id}
                  to={`/post/${rp.id}`}
                  className="group p-5 rounded-xl border border-gray-100 hover:border-orange-200 hover:shadow-md transition-all"
                >
                  <span className="text-[11px] font-bold text-gray-300 mb-1.5 block">{rp.date}</span>
                  <span className="text-[14px] font-bold text-gray-900 group-hover:text-orange-500 transition-colors line-clamp-2 leading-snug">
                    {rp.title}
                  </span>
                  <span className="text-[12px] text-gray-400 mt-1.5 block line-clamp-2">{rp.excerpt}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Back button */}
        <div className="mt-10">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-[13px] text-gray-400 hover:text-orange-500 transition-colors font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            목록으로 돌아가기
          </Link>
        </div>
      </article>
    </div>
  )
}
