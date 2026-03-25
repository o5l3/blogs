import { Link } from 'react-router-dom'

export default function Story() {
  const B = import.meta.env.BASE_URL

  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="bg-[#fafafa] border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-6 py-20 md:py-28 text-center">
          <p className="text-sm text-orange-500 font-semibold tracking-wider mb-4">Our Story</p>
          <h1 className="text-3xl md:text-[2.8rem] font-black text-gray-900 leading-tight mb-5 tracking-tight">
            IT 관리자의 숨겨진 고민
          </h1>
          <p className="text-base text-gray-400 max-w-lg mx-auto leading-relaxed">
            상상해보세요. 어느 아침, 갑자기 걸려온 전화 한 통...
            <br />
            <span className="text-gray-900 font-semibold">"팀장님! 해킹 당했어요!"</span>
          </p>
        </div>
      </section>

      {/* 스토리 본문 */}
      <section className="max-w-4xl mx-auto px-6 py-16 md:py-24">
        <div className="space-y-14">
          {/* 과보호의 역설 */}
          <div className="bg-[#fafafa] rounded-2xl p-8 md:p-10 border border-gray-100">
            <h3 className="text-lg font-bold text-gray-900 mb-4">보안의 역설</h3>
            <p className="text-[14px] text-gray-500 leading-[1.8] mb-6">
              IT 관리자라면 누구나 해킹이라는 악몽 같은 시나리오에 식은땀을 흘립니다.
              그래서 수많은 보안 솔루션을 도입하죠. 마치 철갑을 두른 듯이.
            </p>
            <p className="text-[14px] text-gray-500 leading-[1.8] mb-6">
              하지만 여기서 반전이 시작됩니다. <strong className="text-gray-900">과한 보안도 문제가 될 수 있습니다.</strong>{' '}
              PC가 느려지고, 여러 보안 프로그램들이 서로 충돌을 시작합니다.
            </p>
            <img src={B + 'images/about/2.png'} alt="보안 솔루션 간 충돌 사례" className="w-full rounded-xl border border-gray-200 mb-6" />
            <div className="bg-white rounded-xl p-5 border border-orange-100">
              <p className="text-[13px] text-gray-600 leading-relaxed">
                <span className="text-orange-500 font-bold">발견한 IT 관리자들의 투톱 고민:</span>
                <br />
                <span className="font-semibold text-gray-900">1. 해킹</span> &mdash; 안랩, 시만텍 같은 유명한 보안 회사들이 방어해줍니다.
                <br />
                <span className="font-semibold text-gray-900">2. 장애</span> &mdash; 그런데 PC가 느려지고 고장 나면? <span className="text-red-500 font-semibold">전문적으로 해결해주는 제품이 없습니다.</span>
              </p>
            </div>
          </div>

          {/* 장애의 현실 */}
          <div>
            <h3 className="text-lg font-bold text-gray-900 mb-4">장애의 현실</h3>
            <p className="text-[14px] text-gray-500 leading-[1.8] mb-6">
              아직도 전문가가 직접 와서 수작업으로 해결해야 합니다.
              마치 의사를 기다리는 환자처럼, 문제가 다시 발생할 때까지 기다려야 하죠.
              인터넷이 안 된다고요? 전문가가 와도 해결이 쉽지 않습니다.
              이게 PC 문제인지 네트워크 문제인지 어떻게 알겠습니까.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <img src={B + 'images/about/1.png'} alt="PC 장애 탐지의 어려움" className="w-full rounded-xl border border-gray-200" />
              <img src={B + 'images/about/3.png'} alt="네트워크 장애 사례" className="w-full rounded-xl border border-gray-200" />
            </div>
            <img src={B + 'images/about/4.png'} alt="강제 종료 사례" className="w-full rounded-xl border border-gray-200" />
          </div>

          {/* 장애 >> 해킹 통계 */}
          <div className="bg-gray-900 rounded-2xl p-8 md:p-10 text-white">
            <div className="flex items-center gap-3 mb-6">
              <span className="text-xs text-orange-400 font-bold tracking-widest uppercase">Fact</span>
              <span className="h-px flex-1 bg-white/10" />
            </div>
            <h3 className="text-xl font-bold mb-4">장애 &gt;&gt; 해킹</h3>
            <p className="text-[14px] text-gray-400 leading-[1.8] mb-6">
              실제로 해킹과 장애 중 어느 것이 더 자주 발생할까요?
              조사에 따르면 <strong className="text-white">전자 금융 사고의 95%가 시스템 장애</strong>로 발생했으며,
              해킹은 5% 미만에 불과합니다.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <img src={B + 'images/about/5.png'} alt="전자금융사고 95% 전산장애" className="w-full rounded-xl" />
              <img src={B + 'images/about/13.png'} alt="전산장애 통계" className="w-full rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/5 border border-white/10 rounded-xl p-5 text-center">
                <p className="text-3xl font-black text-orange-400 mb-1">95%</p>
                <p className="text-[12px] text-gray-400">시스템 장애</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-5 text-center">
                <p className="text-3xl font-black text-gray-500 mb-1">5%</p>
                <p className="text-[12px] text-gray-400">해킹</p>
              </div>
            </div>
          </div>

          {/* 장애 관리 전문 솔루션 부재 */}
          <div>
            <h3 className="text-lg font-bold text-gray-900 mb-4">장애관리 전문 솔루션 부재</h3>
            <p className="text-[14px] text-gray-500 leading-[1.8] mb-6">
              해킹의 경우 국내 최고 보안 기업인 안랩이 방어해주지만,
              시스템 장애를 전문적으로 예방하고 해결해주는 솔루션은 현재 없는 상황입니다.
              장애가 발생되는 영역도 하드웨어, 소프트웨어, 관리자 설정 오류 등 매우 다양합니다.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <img src={B + 'images/about/6.png'} alt="장애 관리 수요" className="w-full rounded-xl border border-gray-200" />
              <img src={B + 'images/about/7.png'} alt="장애관리 전문 솔루션 부재" className="w-full rounded-xl border border-gray-200" />
            </div>
            <img src={B + 'images/about/11.png'} alt="장애 현황 요약" className="w-full rounded-xl border border-gray-200" />
          </div>
        </div>
      </section>

      {/* 리더 & 팀 스토리 */}
      <section className="border-y border-gray-100 bg-[#fafafa]">
        <div className="max-w-4xl mx-auto px-6 py-16 md:py-20">
          <div className="text-center mb-14">
            <p className="text-xs text-orange-500 font-bold tracking-widest uppercase mb-2">Origin</p>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900">왜 우리가 만드는가</h2>
          </div>

          <div className="space-y-10">
            <div className="bg-white rounded-2xl p-8 border border-gray-100">
              <h3 className="text-lg font-bold text-gray-900 mb-4">EDR 국내 1위를 만든 경험</h3>
              <p className="text-[14px] text-gray-500 leading-[1.8] mb-4">
                맨 땅에서 시작해 EDR(Endpoint Detection & Response)을 5.5년 동안 개발하며
                <strong className="text-gray-900"> 국내 시장 점유율 86%</strong>를 달성한 경험이 있습니다.
                EDR은 해킹 위협을 행위 기반으로 탐지하는 최신 보안 기술입니다.
              </p>
              <p className="text-[14px] text-gray-500 leading-[1.8] mb-6">
                이 과정에서 보안 위협 탐지를 위해 다양한 행위 데이터를 수집하고 분석하다 보니,
                예상치 못한 문제점들이 드러났습니다. 소프트웨어 간 충돌과 지연, 비정상 종료 등
                시스템 부하를 일으키는 여러 행위들을 발견한 것입니다.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <img src={B + 'images/about/8.png'} alt="리더 경력" className="w-full rounded-xl border border-gray-200" />
                <img src={B + 'images/about/9.png'} alt="EDR 창업과 매각" className="w-full rounded-xl border border-gray-200" />
                <img src={B + 'images/about/10.png'} alt="지니언스 EDR 시장 1위" className="w-full rounded-xl border border-gray-200" />
              </div>
            </div>

            <div className="bg-orange-500 rounded-2xl p-8 md:p-10 text-white">
              <p className="text-xs text-orange-200 font-bold tracking-widest uppercase mb-3">Vision</p>
              <h3 className="text-xl md:text-2xl font-bold mb-4 leading-snug">
                세계 최초, 행위 기반 IT 자원 모니터링 시스템
              </h3>
              <p className="text-[14px] text-orange-100 leading-[1.8]">
                성능과 장애의 원인을 분석하고, 나아가 데이터 분석을 통해 문제를 예측합니다.
                이는 전 세계 기업들이 필요로 하는 필수 솔루션이 될 것이며,
                이를 통해 글로벌 시장을 선점할 수 있을 것입니다.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-6 py-16 md:py-20">
        <div className="flex flex-col md:flex-row gap-4">
          <Link
            to="/about"
            className="flex-1 bg-[#fafafa] rounded-2xl p-8 border border-gray-100 hover:border-orange-200 hover:shadow-md transition-all group text-center"
          >
            <p className="text-xs text-orange-500 font-bold tracking-widest uppercase mb-2">Company</p>
            <h3 className="text-lg font-bold text-gray-900 group-hover:text-orange-500 transition-colors mb-2">회사 소개 보기</h3>
            <p className="text-[13px] text-gray-400">Orange Platform과 팀을 알아보세요</p>
          </Link>
          <Link
            to="/"
            className="flex-1 bg-[#fafafa] rounded-2xl p-8 border border-gray-100 hover:border-orange-200 hover:shadow-md transition-all group text-center"
          >
            <p className="text-xs text-orange-500 font-bold tracking-widest uppercase mb-2">Blog</p>
            <h3 className="text-lg font-bold text-gray-900 group-hover:text-orange-500 transition-colors mb-2">블로그 둘러보기</h3>
            <p className="text-[13px] text-gray-400">기술 인사이트와 분석 리포트</p>
          </Link>
        </div>
      </section>
    </div>
  )
}
