import { useParams, Link } from 'react-router-dom'
import PostCard from '../components/PostCard'
import { categories, getPostsByCategory } from '../data/posts'

export default function Category() {
  const { id } = useParams()
  const currentCategory = categories.find(c => c.id === id) || categories[0]
  const filteredPosts = getPostsByCategory(id || 'all')

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      {/* Category Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">{currentCategory.name}</h1>
        <p className="text-gray-500">{currentCategory.description}</p>
      </div>

      {/* Category Tabs */}
      <div className="flex flex-wrap gap-2 mb-10 border-b border-gray-100 pb-4">
        {categories.map(cat => (
          <Link
            key={cat.id}
            to={`/category/${cat.id}`}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
              cat.id === id
                ? 'bg-orange-500 text-white shadow-sm'
                : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            {cat.name}
          </Link>
        ))}
      </div>

      {/* Posts Grid */}
      {filteredPosts.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPosts.map(post => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      ) : (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg">아직 게시글이 없습니다.</p>
          <p className="text-sm mt-2">곧 새로운 콘텐츠가 올라올 예정입니다.</p>
        </div>
      )}
    </div>
  )
}
