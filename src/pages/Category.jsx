import { useParams, Link } from 'react-router-dom'
import PostCard from '../components/PostCard'
import { categories, getPostsByCategory } from '../data/posts'

const categoryHero = {
  all: {
    subtitle: '모든 게시글을 한눈에',
    gradient: 'from-gray-50 to-white',
  },
  report: {
    subtitle: 'Orange Platform이 현장에서 수집한 데이터 기반 분석 보고서',
    gradient: 'from-blue-50/50 to-white',
  },
  tech: {
    subtitle: '엔드포인트 성능 분석과 Windows 트러블슈팅 기술 가이드',
    gradient: 'from-emerald-50/50 to-white',
  },
  news: {
    subtitle: '오렌지랩스의 성장 이야기와 제품 업데이트 소식',
    gradient: 'from-orange-50/50 to-white',
  },
}

export default function Category() {
  const { id } = useParams()
  const currentCategory = categories.find(c => c.id === id) || categories[0]
  const hero = categoryHero[id] || categoryHero.all
  const filteredPosts = getPostsByCategory(id || 'all')
    .sort((a, b) => new Date(b.date) - new Date(a.date))

  return (
    <div className="bg-white min-h-screen">
      {/* Category Hero */}
      <section className={`bg-gradient-to-b ${hero.gradient} border-b border-gray-100`}>
        <div className="max-w-5xl mx-auto px-6 pt-12 pb-8">
          <h1 className="text-2xl md:text-3xl font-black text-gray-900 mb-2 tracking-tight">
            {currentCategory.name}
          </h1>
          <p className="text-sm text-gray-400 leading-relaxed max-w-lg">
            {hero.subtitle}
          </p>

          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 mt-8 overflow-x-auto pb-1">
            {categories.map(cat => (
              <Link
                key={cat.id}
                to={`/category/${cat.id}`}
                className={`px-4 py-2 rounded-full text-[13px] font-semibold transition-all whitespace-nowrap ${
                  cat.id === id
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                }`}
              >
                {cat.name}
                {cat.id !== 'all' && (
                  <span className={`ml-1.5 text-[11px] ${
                    cat.id === id ? 'text-gray-400' : 'text-gray-300'
                  }`}>
                    {getPostsByCategory(cat.id).length}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Posts */}
      <section className="max-w-5xl mx-auto px-6 py-10">
        {filteredPosts.length > 0 ? (
          <>
            {/* Stats bar */}
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-100">
              <p className="text-[13px] text-gray-400">
                총 <span className="font-bold text-gray-900">{filteredPosts.length}</span>개의 게시글
              </p>
              <div className="flex items-center gap-1.5 text-[12px] text-gray-300">
                <span>최신순</span>
              </div>
            </div>

            {/* Grid for all */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredPosts.map(post => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-24">
            <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <svg className="w-7 h-7 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
              </svg>
            </div>
            <p className="text-base font-semibold text-gray-900 mb-1">아직 게시글이 없습니다</p>
            <p className="text-sm text-gray-400">곧 새로운 콘텐츠가 올라올 예정입니다.</p>
          </div>
        )}
      </section>
    </div>
  )
}
