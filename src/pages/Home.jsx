import { Link } from 'react-router-dom'
import PostCard from '../components/PostCard'
import { posts, categories, getPostsByCategory } from '../data/posts'

export default function Home() {
  const sortedPosts = [...posts].sort((a, b) => new Date(b.date) - new Date(a.date))
  const featuredPost = sortedPosts[0]
  const restPosts = sortedPosts.slice(1)

  // Category stats
  const categoryStats = categories
    .filter(c => c.id !== 'all')
    .map(c => ({ ...c, count: getPostsByCategory(c.id).length }))

  return (
    <div className="bg-white">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-[#fafafa]">
        <div className="absolute top-20 left-[10%] w-3 h-3 rounded-full bg-orange-400/30 animate-float" />
        <div className="absolute top-40 right-[15%] w-2 h-2 rounded-full bg-orange-300/40 animate-float-delayed" />
        <div className="absolute bottom-32 left-[20%] w-4 h-4 rounded-full bg-orange-200/30 animate-float" />
        <div className="absolute top-28 right-[30%] w-2.5 h-2.5 rounded-full bg-orange-500/20 animate-float-delayed" />

        <div className="max-w-5xl mx-auto px-6 pt-20 pb-24 md:pt-28 md:pb-32 text-center">
          <p className="text-sm text-gray-400 tracking-wider mb-8">
            오렌지랩스의 블로그
          </p>
          <h1 className="text-[2.5rem] md:text-[3.5rem] lg:text-[4rem] font-black text-gray-900 leading-[1.15] mb-6 tracking-tight">
            탐지에서{' '}
            <span className="relative inline-block">
              <span className="relative z-10">분석</span>
              <span className="absolute bottom-1 left-0 right-0 h-3 md:h-4 bg-orange-400/20 -z-0 rounded-sm" />
            </span>
            까지,
            <br />
            엔드포인트의 모든 것
          </h1>
          <p className="text-base md:text-lg text-gray-400 max-w-lg mx-auto leading-relaxed mb-10">
            실시간 모니터링 · 데이터 기반 분석 · 자동화 리포트
          </p>

          {/* Category pills with count */}
          <div className="flex flex-wrap justify-center gap-2">
            {categoryStats.map(cat => (
              <Link
                key={cat.id}
                to={`/category/${cat.id}`}
                className="group px-5 py-2.5 text-sm font-medium text-gray-500 bg-white border border-gray-200 rounded-full hover:border-orange-300 hover:text-orange-500 hover:bg-orange-50/50 transition-all duration-200 flex items-center gap-2"
              >
                {cat.name}
                <span className="text-[11px] text-gray-300 group-hover:text-orange-400 font-bold tabular-nums">
                  {cat.count}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Post */}
      {featuredPost && (
        <section className="max-w-5xl mx-auto px-6 -mt-4 mb-14 relative z-10">
          <Link
            to={`/post/${featuredPost.id}`}
            className="group block bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl overflow-hidden hover:shadow-2xl hover:shadow-orange-500/10 transition-all duration-500 relative"
          >
            {/* Decorative grid */}
            <div className="absolute inset-0 opacity-[0.03]" style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.3) 1px, transparent 1px)',
              backgroundSize: '40px 40px'
            }} />
            <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-orange-500/5 rounded-full blur-[80px]" />

            <div className="relative p-8 md:p-12">
              <div className="flex items-center gap-3 mb-5">
                <span className="px-3 py-1 text-[11px] font-bold text-orange-400 bg-orange-400/10 rounded-full uppercase tracking-wider">
                  {categories.find(c => c.id === featuredPost.category)?.name}
                </span>
                <span className="text-xs text-gray-500 tabular-nums">{featuredPost.date}</span>
                <span className="px-2 py-0.5 text-[10px] font-bold text-emerald-400 bg-emerald-400/10 rounded-full tracking-wider">
                  LATEST
                </span>
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-4 group-hover:text-orange-300 transition-colors leading-snug max-w-2xl">
                {featuredPost.title}
              </h2>
              <p className="text-sm text-gray-400 mb-8 max-w-2xl leading-relaxed line-clamp-2">
                {featuredPost.excerpt}
              </p>
              <div className="flex items-center justify-between">
                <span className="text-sm text-orange-400 font-semibold group-hover:translate-x-1 transition-transform inline-flex items-center gap-1.5">
                  자세히 읽기
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </span>
                <div className="hidden md:flex gap-1.5">
                  {featuredPost.tags.slice(0, 3).map(tag => (
                    <span key={tag} className="text-[10px] text-gray-500 bg-white/5 px-2.5 py-1 rounded-full border border-white/10">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </Link>
        </section>
      )}

      {/* Posts by Category Section */}
      {categoryStats.filter(c => c.count > 0).map(cat => {
        const catPosts = getPostsByCategory(cat.id).sort((a, b) => new Date(b.date) - new Date(a.date))
        return (
          <section key={cat.id} className="max-w-5xl mx-auto px-6 mb-12">
            <div className="flex items-center justify-between mb-5 pb-3 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-gray-900">{cat.name}</h2>
                <span className="text-[11px] font-bold text-gray-300 bg-gray-50 px-2 py-0.5 rounded-full tabular-nums">
                  {cat.count}
                </span>
              </div>
              <Link
                to={`/category/${cat.id}`}
                className="text-[12px] text-gray-400 hover:text-orange-500 transition-colors font-medium flex items-center gap-1"
              >
                전체보기
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {catPosts.slice(0, 3).map(post => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          </section>
        )
      })}

      {/* About Banner */}
      <section className="border-t border-gray-100 bg-[#fafafa]">
        <div className="max-w-5xl mx-auto px-6 py-16 md:py-20">
          <div className="flex flex-col md:flex-row items-center gap-8 md:gap-14">
            <div className="flex-1">
              <p className="text-xs text-orange-500 font-bold tracking-widest uppercase mb-3">About Orange Labs</p>
              <h3 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4 leading-snug">
                IT 인프라의 성능을
                <br />
                투명하게 만듭니다
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed mb-6 max-w-md">
                오렌지랩스는 기업 엔드포인트의 성능을 실시간으로 모니터링하고
                장애 원인을 분석하는 Orange Platform을 개발합니다.
              </p>
              <Link
                to="/about"
                className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900 hover:text-orange-500 transition-colors"
              >
                더 알아보기
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4 shrink-0">
              {[
                { num: '2023', label: '설립연도' },
                { num: 'GS 1등급', label: '인증 획득' },
                { num: 'TIPS', label: '선정' },
                { num: '8개', label: '전국 거점' },
              ].map((stat, i) => (
                <div key={i} className="bg-white rounded-xl px-6 py-5 text-center min-w-[120px] border border-gray-100">
                  <p className="text-lg font-extrabold text-gray-900">{stat.num}</p>
                  <p className="text-[11px] text-gray-400 mt-1">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
