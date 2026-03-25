import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="bg-gray-900">
      <div className="max-w-5xl mx-auto px-6 py-14">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
          {/* Brand */}
          <div className="md:col-span-5">
            <div className="flex items-center gap-1.5 mb-4">
              <img
                src={import.meta.env.BASE_URL + 'images/symbol.png'}
                alt=""
                className="h-6 w-6"
              />
              <span className="text-[14px] font-bold tracking-tight">
                <span className="text-orange-400">Orange</span>
                <span className="text-gray-300 font-medium"> labs</span>
              </span>
            </div>
            <p className="text-[13px] text-gray-400 leading-relaxed max-w-xs">
              기업 엔드포인트의 성능을 실시간으로 모니터링하고
              장애 원인을 분석하는 Orange Platform을 개발합니다.
            </p>
          </div>

          {/* Menu */}
          <div className="md:col-span-3">
            <h4 className="text-[11px] text-gray-400 font-bold tracking-widest uppercase mb-4">Menu</h4>
            <ul className="space-y-2.5">
              <li><Link to="/category/report" className="text-[13px] text-gray-300 hover:text-orange-400 transition-colors">리포트</Link></li>
              <li><Link to="/category/tech" className="text-[13px] text-gray-300 hover:text-orange-400 transition-colors">기술</Link></li>
              <li><Link to="/about" className="text-[13px] text-gray-300 hover:text-orange-400 transition-colors">회사소개</Link></li>
            </ul>
          </div>

          {/* Contact */}
          <div className="md:col-span-4">
            <h4 className="text-[11px] text-gray-400 font-bold tracking-widest uppercase mb-4">Contact</h4>
            <ul className="space-y-2 text-[13px] text-gray-300">
              <li>서울 강남구 테헤란로 2길 27</li>
              <li>패스트파이브 빌딩 8층</li>
              <li className="pt-2">
                <a href="https://orangesys.co.kr/" target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-orange-400 transition-colors text-[12px]">
                  (주)오렌지시스 ↗
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-10 pt-6 flex flex-col md:flex-row items-center justify-between gap-3 text-[11px] text-gray-400">
          <span>© {new Date().getFullYear()} 오렌지랩스(주). All rights reserved.</span>
          <a
            href="https://o5l3.notion.site/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-orange-400 transition-colors"
          >
            오렌지랩스 공식 페이지 ↗
          </a>
        </div>
      </div>
    </footer>
  )
}
