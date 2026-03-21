import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import SearchModal from './SearchModal'

const navItems = [
  { path: '/category/report', label: '리포트' },
  { path: '/category/tech', label: '기술' },
  { path: '/category/news', label: '소식' },
]

export default function Header() {
  const [searchOpen, setSearchOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const location = useLocation()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

  return (
    <>
      <header className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-white/95 backdrop-blur-md shadow-sm shadow-gray-100/50'
          : 'bg-white/80 backdrop-blur-sm'
      }`}>
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-1.5 shrink-0 group">
            <img
              src={import.meta.env.BASE_URL + 'images/symbol.png'}
              alt=""
              className="h-7 w-7"
            />
            <span className="text-[15px] font-bold tracking-tight">
              <span className="text-orange-500">Orange</span>
              <span className="text-gray-400 font-medium"> labs</span>
            </span>
          </Link>

          {/* Center Nav */}
          <nav className="hidden md:flex items-center gap-8">
            {navItems.map(item => (
              <Link
                key={item.path}
                to={item.path}
                className={`text-[14px] font-medium transition-colors relative py-1 ${
                  location.pathname === item.path
                    ? 'text-orange-500'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {item.label}
                {location.pathname === item.path && (
                  <span className="absolute -bottom-1 left-0 right-0 h-0.5 bg-orange-500 rounded-full" />
                )}
              </Link>
            ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2">
            <Link
              to="/about"
              className={`hidden md:inline-flex text-[13px] font-medium px-3.5 py-1.5 rounded-full transition-all ${
                location.pathname === '/about'
                  ? 'text-orange-500 bg-orange-50'
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
              }`}
            >
              회사소개
            </Link>

            <button
              onClick={() => setSearchOpen(true)}
              className="p-2 text-gray-400 hover:text-orange-500 transition-colors rounded-lg hover:bg-gray-50"
              aria-label="검색"
            >
              <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-gray-400 hover:text-gray-600 rounded-lg"
              aria-label="메뉴"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-100 bg-white">
            <nav className="flex flex-col px-6 py-3">
              {navItems.map(item => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`text-[15px] font-medium py-3 border-b border-gray-50 last:border-0 ${
                    location.pathname === item.path ? 'text-orange-500' : 'text-gray-600'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
              <Link
                to="/about"
                className={`text-[15px] font-medium py-3 ${
                  location.pathname === '/about' ? 'text-orange-500' : 'text-gray-600'
                }`}
              >
                회사소개
              </Link>
            </nav>
          </div>
        )}
      </header>

      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  )
}
