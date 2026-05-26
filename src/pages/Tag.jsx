import { useParams, Link } from 'react-router-dom'
import PostCard from '../components/PostCard'
import { getPostsByTag, getAllTags } from '../data/posts'

export default function Tag() {
  const { tag } = useParams()
  const decodedTag = decodeURIComponent(tag || '')
  const filteredPosts = getPostsByTag(decodedTag)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
  const allTags = getAllTags().slice(0, 30)

  return (
    <div className="bg-white min-h-screen">
      {/* Tag Hero */}
      <section className="bg-gradient-to-b from-violet-50/50 to-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-6 pt-12 pb-8">
          <p className="text-[13px] text-gray-400 mb-2">태그</p>
          <h1 className="text-2xl md:text-3xl font-black text-gray-900 mb-2 tracking-tight">
            #{decodedTag}
          </h1>
          <p className="text-sm text-gray-400 leading-relaxed max-w-lg">
            ‘{decodedTag}’ 태그가 달린 글 {filteredPosts.length}건
          </p>

          {/* Popular tags */}
          <div className="flex flex-wrap items-center gap-1.5 mt-8">
            {allTags.map(({ tag: t, count }) => (
              <Link
                key={t}
                to={`/tag/${encodeURIComponent(t)}`}
                className={`px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all whitespace-nowrap ${
                  t.toLowerCase() === decodedTag.toLowerCase()
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                }`}
              >
                #{t} <span className="opacity-50">{count}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Posts */}
      <section className="max-w-5xl mx-auto px-6 py-10">
        {filteredPosts.length === 0 ? (
          <p className="text-gray-400 text-sm py-20 text-center">이 태그의 글이 아직 없습니다.</p>
        ) : (
          <div className="space-y-1">
            {filteredPosts.map(post => (
              <PostCard key={post.id} post={post} variant="list" />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
