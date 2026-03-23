import { Link } from 'react-router-dom'
import { categories } from '../data/posts'

const categoryMeta = {
  report: {
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    accent: 'border-blue-200',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  tech: {
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    accent: 'border-emerald-200',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    ),
  },
  news: {
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    accent: 'border-orange-200',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
      </svg>
    ),
  },
}

export default function PostCard({ post, variant = 'default' }) {
  const cat = categories.find(c => c.id === post.category)
  const meta = categoryMeta[post.category] || categoryMeta.news

  if (variant === 'list') {
    return (
      <Link
        to={`/post/${post.id}`}
        className="group flex items-start gap-5 py-6 border-b border-gray-100 last:border-0 hover:bg-gray-50/50 -mx-4 px-4 rounded-xl transition-colors"
      >
        <div className={`shrink-0 w-10 h-10 rounded-lg ${meta.bg} ${meta.color} flex items-center justify-center mt-0.5`}>
          {meta.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${meta.bg} ${meta.color} uppercase tracking-wider`}>
              {cat?.name}
            </span>
            <span className="text-[11px] text-gray-300">{post.date}</span>
          </div>
          <h3 className="text-[15px] font-bold text-gray-900 group-hover:text-orange-500 transition-colors leading-snug mb-1 truncate">
            {post.title}
          </h3>
          <p className="text-[12px] text-gray-400 line-clamp-1 leading-relaxed">
            {post.excerpt}
          </p>
        </div>
        <svg className="w-4 h-4 text-gray-300 group-hover:text-orange-400 transition-colors shrink-0 mt-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </Link>
    )
  }

  return (
    <Link
      to={`/post/${post.id}`}
      className={`group block bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg hover:shadow-gray-200/60 hover:-translate-y-0.5 transition-all duration-300`}
    >
      {/* Category accent top bar */}
      <div className={`h-0.5 ${meta.bg}`} />

      <div className="p-6">
        {/* Category badge with icon */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className={`w-7 h-7 rounded-lg ${meta.bg} ${meta.color} flex items-center justify-center`}>
              {meta.icon}
            </span>
            <span className={`text-[11px] font-bold ${meta.color} uppercase tracking-wider`}>
              {cat?.name}
            </span>
          </div>
          <span className="text-[11px] text-gray-300 font-medium tabular-nums">{post.date}</span>
        </div>

        <h3 className="text-[16px] font-bold text-gray-900 mb-2.5 group-hover:text-orange-500 transition-colors leading-snug line-clamp-2">
          {post.title}
        </h3>

        <p className="text-[13px] text-gray-400 mb-5 line-clamp-2 leading-relaxed">
          {post.excerpt}
        </p>

        <div className="flex items-center justify-between pt-4 border-t border-gray-50">
          <div className="flex gap-1.5 overflow-hidden">
            {post.tags.slice(0, 2).map(tag => (
              <span key={tag} className="text-[10px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded-md font-medium">
                {tag}
              </span>
            ))}
          </div>
          <span className="text-[11px] text-gray-300 group-hover:text-orange-400 transition-colors font-semibold shrink-0 flex items-center gap-1">
            읽기
            <svg className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          </span>
        </div>
      </div>
    </Link>
  )
}
