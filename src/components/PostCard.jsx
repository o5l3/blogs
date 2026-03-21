import { Link } from 'react-router-dom'
import { categories } from '../data/posts'

const categoryColors = {
  report: 'text-blue-600 bg-blue-50',
  tech: 'text-emerald-600 bg-emerald-50',
  news: 'text-orange-600 bg-orange-50',
}

export default function PostCard({ post }) {
  const cat = categories.find(c => c.id === post.category)
  const colorClass = categoryColors[post.category] || 'text-gray-600 bg-gray-50'

  return (
    <Link
      to={`/post/${post.id}`}
      className="group block bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg hover:shadow-gray-200/60 hover:-translate-y-0.5 transition-all duration-300"
    >
      {/* Content */}
      <div className="p-6">
        <div className="flex items-center gap-2.5 mb-4">
          <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${colorClass}`}>
            {cat?.name}
          </span>
          <span className="text-[12px] text-gray-300 font-medium">{post.date}</span>
        </div>

        <h3 className="text-[16px] font-bold text-gray-900 mb-2.5 group-hover:text-orange-500 transition-colors leading-snug line-clamp-2">
          {post.title}
        </h3>

        <p className="text-[13px] text-gray-400 mb-5 line-clamp-2 leading-relaxed">
          {post.excerpt}
        </p>

        <div className="flex items-center justify-between">
          <div className="flex gap-1.5 overflow-hidden">
            {post.tags.slice(0, 2).map(tag => (
              <span key={tag} className="text-[11px] text-gray-400 bg-gray-50 px-2.5 py-1 rounded-full">
                #{tag}
              </span>
            ))}
          </div>
          <span className="text-[12px] text-gray-300 group-hover:text-orange-400 transition-colors font-medium shrink-0">
            읽기 →
          </span>
        </div>
      </div>
    </Link>
  )
}
