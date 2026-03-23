import { useParams, Link } from 'react-router-dom'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import rehypeRaw from 'rehype-raw'
import { getPostById, getPostContent, categories } from '../data/posts'

const categoryColors = {
  report: 'bg-blue-50 text-blue-600',
  tech: 'bg-emerald-50 text-emerald-600',
  news: 'bg-orange-50 text-orange-600',
}

export default function Post() {
  const { id } = useParams()
  const post = getPostById(id)

  if (!post) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-20 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">게시글을 찾을 수 없습니다</h1>
        <Link to="/" className="text-orange-500 hover:underline">홈으로 돌아가기</Link>
      </div>
    )
  }

  const cat = categories.find(c => c.id === post.category)
  const colorClass = categoryColors[post.category] || 'bg-gray-50 text-gray-600'

  return (
    <div className="bg-white">
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
          </div>
        </div>
      </div>

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
              h2: ({ children }) => (
                <h2 className="text-[1.3rem] font-bold text-gray-900 mt-12 mb-4 pb-3 border-b border-gray-100">
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3 className="text-[1.1rem] font-bold text-gray-900 mt-8 mb-3">
                  {children}
                </h3>
              ),
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
              pre: ({ children }) => (
                <pre className="bg-gray-900 text-gray-100 rounded-xl p-5 my-6 overflow-x-auto text-[13px] leading-relaxed">
                  {children}
                </pre>
              ),
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
            {getPostContent(post.id)}
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
