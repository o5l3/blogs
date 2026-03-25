import { Link } from 'react-router-dom'

export default function About() {
  const milestones = [
    { date: '2023.11', title: '이피엠에스(주) 설립', desc: '엔드포인트 성능 분석 솔루션 개발 시작' },
    { date: '2024.04', title: '시드 투자 유치', desc: '부산 선보엔젤파트너스(주) 시드 투자' },
    { date: '2024.05', title: 'TIPS 선정', desc: '중소벤처기업부 TIPS 프로그램 선정' },
    { date: '2024.08', title: '오렌지랩스(주) 상호 변경', desc: '브랜드 리뉴얼 및 상호명 변경' },
    { date: '2024.12', title: '첫 매출 발생', desc: '한일네트웍스 첫 상용 매출' },
    { date: '2025.02', title: '신용보증기금 선정', desc: '뉴본펭귄 R&D 스타트업 선정' },
    { date: '2025.03', title: '벤처기업 인증', desc: '벤처기업 공식 인증 획득' },
    { date: '2025.07', title: 'GS인증 1등급 획득', desc: '소프트웨어 품질 최고 등급 인증' },
    { date: '2025.09', title: '한일시멘트 시범 적용', desc: '제조업 분야 첫 시범 적용' },
    { date: '2025.10', title: '고객사 확대', desc: '순천대학교 / 효성 ITX / 부천도시공사 시범 적용' },
    { date: '2025.12', title: '썬앳푸드 수주', desc: '나라장터 등록 완료' },
    { date: '2026.01', title: '교보 그룹 POC', desc: '대기업 그룹사 POC 진행' },
  ]

  const services = [
    {
      title: '실시간 성능 및 장애 모니터링',
      desc: 'PC 성능, 장애 문제 사항을 실시간 탐지, 분석해 원인을 도출합니다. 신속한 대응으로 운영 중단 시간을 최소화합니다.',
    },
    {
      title: '데이터 기반 분석',
      desc: '설치된 다양한 솔루션 간 영향도를 수치화하여 관리자에게 직관적으로 제시함으로써, 데이터에 기반한 의사 결정을 지원합니다.',
    },
    {
      title: '자동화된 데이터 집계',
      desc: '자동화 시스템을 통해 탐지, 분석 및 증적 자료를 자동으로 집계하고, 자원을 효율적으로 관리하며 인력 투입을 최소화합니다.',
    },
    {
      title: '다양한 대상 디바이스',
      desc: 'PC뿐 아니라 안드로이드, 네트워크 장비 등 모든 무인 기기를 대상으로 적용 범위를 확대합니다.',
    },
  ]

  const strengths = [
    {
      title: '풍부한 경험',
      desc: '무에서 국내 시장 1위까지 EDR을 개발하며 고전 분투한 리더 아래, 엔지니어들이 전체 시스템의 설계와 개발을 수행합니다.',
    },
    {
      title: '맞춤형 솔루션',
      desc: '고객의 요구 사항과 IT 환경에 최적화된 맞춤형 서비스를 제공합니다.',
    },
    {
      title: '기술 혁신',
      desc: '지속적인 연구 개발을 통해 최신 기술을 적용한 혁신적인 제품을 개발합니다.',
    },
    {
      title: '다양한 기술 영역',
      desc: 'Windows Kernel부터 네트워크, 서버, AI까지 IT 인프라 전 영역을 연구합니다.',
    },
  ]

  const B = import.meta.env.BASE_URL

  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="bg-[#fafafa] border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-6 py-20 md:py-28 text-center">
          <p className="text-sm text-orange-500 font-semibold tracking-wider mb-4">
            About Orange Labs
          </p>
          <h1 className="text-3xl md:text-[2.8rem] font-black text-gray-900 leading-tight mb-5 tracking-tight">
            IT 인프라의 성능을
            <br />
            <span className="relative inline-block">
              <span className="relative z-10">투명하게</span>
              <span className="absolute bottom-1 left-0 right-0 h-3 md:h-4 bg-orange-400/20 -z-0 rounded-sm" />
            </span>
            {' '}만듭니다
          </h1>
          <p className="text-base text-gray-400 max-w-lg mx-auto leading-relaxed">
            기업 IT 인프라 성능 및 장애 행위 기반 실시간 분석 시스템을 연구 개발합니다.
            세계적 수준의 제품으로 글로벌 시장을 선도하는 기업을 지향합니다.
          </p>
        </div>
      </section>

      {/* Story Link Card */}
      <section className="max-w-5xl mx-auto px-6 py-16 md:py-20">
        <Link
          to="/story"
          className="group block bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl overflow-hidden hover:shadow-2xl hover:shadow-orange-500/10 transition-all duration-500 relative"
        >
          <div className="absolute inset-0 opacity-[0.03]" style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.3) 1px, transparent 1px)',
            backgroundSize: '40px 40px'
          }} />
          <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-orange-500/5 rounded-full blur-[80px]" />

          <div className="relative p-8 md:p-12 flex flex-col md:flex-row items-center gap-8">
            <div className="flex-1">
              <span className="text-xs text-orange-400 font-bold tracking-widest uppercase">Our Story</span>
              <h3 className="text-xl md:text-2xl font-bold text-white mt-2 mb-3 group-hover:text-orange-300 transition-colors">
                IT 관리자의 숨겨진 고민
              </h3>
              <p className="text-sm text-gray-400 leading-relaxed mb-4">
                해킹보다 더 자주, 더 심각하게 발생하는 시스템 장애.
                왜 우리가 이 문제를 풀기로 했는지, EDR 국내 1위를 만든 팀의 이야기.
              </p>
              <span className="text-sm text-orange-400 font-semibold inline-flex items-center gap-1.5 group-hover:translate-x-1 transition-transform">
                스토리 읽기
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </span>
            </div>
            <div className="shrink-0 grid grid-cols-2 gap-3">
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                <p className="text-2xl font-black text-orange-400">95%</p>
                <p className="text-[11px] text-gray-500 mt-0.5">장애 비율</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                <p className="text-2xl font-black text-white">86%</p>
                <p className="text-[11px] text-gray-500 mt-0.5">EDR 점유율</p>
              </div>
            </div>
          </div>
        </Link>
      </section>

      {/* Solution - Orange Platform */}
      <section className="bg-gray-900">
        <div className="max-w-5xl mx-auto px-6 py-16 md:py-20">
          <div className="text-center mb-14">
            <p className="text-xs text-orange-400 font-bold tracking-widest uppercase mb-2">Solution</p>
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">Orange Platform</h2>
            <p className="text-sm text-gray-400 max-w-lg mx-auto leading-relaxed">
              가볍고 강력한 구독형 엔드포인트 성능 모니터링 및 장애 분석 플랫폼.
              합리적인 가격의 연간 구독 방식으로, 경량 구조를 통해 하드웨어 비용을 절감합니다.
            </p>
          </div>

          {/* 동작 프로세스 이미지 */}
          <img src={B + 'images/about/15.png'} alt="Orange Platform 동작 프로세스" className="w-full rounded-xl mb-10" />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {services.map((s, i) => (
              <div
                key={i}
                className="bg-white/5 border border-white/10 rounded-2xl p-7 hover:bg-white/10 hover:border-orange-500/30 transition-all duration-300 group"
              >
                <div className="w-8 h-8 bg-orange-500/15 text-orange-400 rounded-lg flex items-center justify-center mb-4 text-[12px] font-bold">
                  {String(i + 1).padStart(2, '0')}
                </div>
                <h3 className="text-[15px] font-bold text-white mb-2 group-hover:text-orange-300 transition-colors">
                  {s.title}
                </h3>
                <p className="text-[13px] text-gray-400 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>

          {/* BSOD 분석 이미지 */}
          <div className="mt-10">
            <img src={B + 'images/about/14.png'} alt="장애 분석 상세 화면" className="w-full rounded-xl border border-white/10" />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-5xl mx-auto px-6 py-16 md:py-20">
        <div className="text-center mb-14">
          <p className="text-xs text-orange-500 font-bold tracking-widest uppercase mb-2">How It Works</p>
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900">이렇게 동작합니다</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            {
              step: '01',
              title: '에이전트 설치',
              desc: '관리 대상 PC에 경량 에이전트를 설치합니다. 설치 후 자동으로 데이터 수집이 시작됩니다.',
            },
            {
              step: '02',
              title: '데이터 수집 및 분석',
              desc: 'CPU, 메모리, 디스크, 프로세스 등 핵심 지표를 실시간 수집하고 이상 패턴을 자동 감지합니다.',
            },
            {
              step: '03',
              title: '리포트 및 대응',
              desc: '분석 결과를 리포트로 자동 생성하고, 장애 원인과 해결 방안을 제시합니다.',
            },
          ].map((item, i) => (
            <div key={i} className="relative">
              <span className="text-6xl font-black text-gray-100 absolute -top-6 -left-2">{item.step}</span>
              <div className="relative pt-8">
                <h3 className="text-lg font-bold text-gray-900 mb-2">{item.title}</h3>
                <p className="text-[13px] text-gray-500 leading-relaxed">{item.desc}</p>
              </div>
              {i < 2 && (
                <div className="hidden md:block absolute top-10 -right-4 text-gray-200">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Competitiveness */}
      <section className="border-y border-gray-100 bg-[#fafafa]">
        <div className="max-w-5xl mx-auto px-6 py-16 md:py-20">
          <div className="text-center mb-12">
            <p className="text-xs text-orange-500 font-bold tracking-widest uppercase mb-2">Strength</p>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900">경쟁력</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {strengths.map((s, i) => (
              <div key={i} className="bg-white rounded-2xl p-7 border border-gray-100 hover:border-orange-200 hover:shadow-md transition-all">
                <div className="flex items-center gap-3 mb-3">
                  <span className="w-8 h-8 bg-orange-50 text-orange-500 rounded-lg flex items-center justify-center text-[12px] font-bold">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3 className="text-[15px] font-bold text-gray-900">{s.title}</h3>
                </div>
                <p className="text-[13px] text-gray-500 leading-relaxed pl-11">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section className="max-w-3xl mx-auto px-6 py-16 md:py-20">
        <div className="text-center mb-14">
          <p className="text-xs text-orange-500 font-bold tracking-widest uppercase mb-2">History</p>
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900">걸어온 길</h2>
        </div>

        <div className="relative">
          <div className="absolute left-[18px] md:left-1/2 top-0 bottom-0 w-px bg-gray-200 md:-translate-x-px" />

          {milestones.map((m, i) => (
            <div key={i} className={`relative flex items-start gap-6 mb-6 last:mb-0 ${
              i % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'
            }`}>
              <div className={`hidden md:flex flex-1 ${i % 2 === 0 ? 'justify-end pr-10' : 'justify-start pl-10'}`}>
                <div className="bg-white rounded-xl px-5 py-4 border border-gray-100 shadow-sm max-w-[260px] hover:border-orange-200 hover:shadow-md transition-all">
                  <p className="text-[11px] font-bold text-orange-500 mb-0.5">{m.date}</p>
                  <h3 className="text-[14px] font-bold text-gray-900 mb-0.5">{m.title}</h3>
                  <p className="text-[12px] text-gray-400">{m.desc}</p>
                </div>
              </div>

              <div className="absolute left-[18px] md:left-1/2 w-[10px] h-[10px] bg-orange-500 rounded-full -translate-x-[4px] md:-translate-x-[5px] mt-5 ring-4 ring-white z-10" />

              <div className="md:hidden ml-10">
                <p className="text-[11px] font-bold text-orange-500 mb-0.5">{m.date}</p>
                <h3 className="text-[14px] font-bold text-gray-900 mb-0.5">{m.title}</h3>
                <p className="text-[12px] text-gray-400">{m.desc}</p>
              </div>

              <div className="hidden md:block flex-1" />
            </div>
          ))}
        </div>
      </section>

      {/* Company Info */}
      <section className="border-y border-gray-100 bg-[#fafafa]">
        <div className="max-w-5xl mx-auto px-6 py-16 md:py-20">
          <div className="text-center mb-14">
            <p className="text-xs text-orange-500 font-bold tracking-widest uppercase mb-2">Company</p>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900">회사 구성</h2>
            <p className="text-sm text-gray-400 mt-2">오렌지시스(모회사, 업력 12년)와 오렌지랩스(자회사)로 구성</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Orange Labs */}
            <div className="bg-white rounded-2xl border border-gray-100 p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="flex items-center gap-1.5">
                  <img src={B + 'images/symbol.png'} alt="" className="h-6 w-6" />
                  <span className="text-[14px] font-bold tracking-tight">
                    <span className="text-orange-500">Orange</span>
                    <span className="text-gray-400 font-medium"> labs</span>
                  </span>
                </div>
                <span className="text-[11px] text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full font-bold">자회사</span>
              </div>
              <dl className="space-y-3 text-[13px]">
                <div className="flex gap-2">
                  <dt className="text-gray-400 shrink-0 w-20">역할</dt>
                  <dd className="text-gray-900 font-medium">제품 연구 개발, 마케팅</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-gray-400 shrink-0 w-20">위치</dt>
                  <dd className="text-gray-900 font-medium">서울 강남구 테헤란로 2길 27 패스트파이브 8층</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-gray-400 shrink-0 w-20">대표</dt>
                  <dd className="text-gray-900 font-medium">김범진</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-gray-400 shrink-0 w-20">인력</dt>
                  <dd className="text-gray-900 font-medium">연구 개발 6명 (전원 개발자)</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-gray-400 shrink-0 w-20">설립</dt>
                  <dd className="text-gray-900 font-medium">2023년 11월</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-gray-400 shrink-0 w-20">인증</dt>
                  <dd className="text-gray-900 font-medium">GS인증 1등급, 벤처기업 인증, TIPS</dd>
                </div>
              </dl>
              <p className="text-[12px] text-gray-400 mt-5 leading-relaxed border-t border-gray-50 pt-4">
                소수 정예의 고성과 인재를 통해 수익률과 성과 배분을 극대화합니다. 뛰어난 개발자가 필요하지만 급하게 채용하지 않습니다.
              </p>
            </div>

            {/* OrangeSys */}
            <div className="bg-white rounded-2xl border border-gray-100 p-8">
              <div className="flex items-center gap-2 mb-6">
                <span className="text-[15px] font-bold text-gray-900">(주)오렌지시스</span>
                <span className="text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full font-bold">모회사</span>
              </div>
              <dl className="space-y-3 text-[13px]">
                <div className="flex gap-2">
                  <dt className="text-gray-400 shrink-0 w-20">역할</dt>
                  <dd className="text-gray-900 font-medium">제품 사업/영업, 기술 지원</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-gray-400 shrink-0 w-20">위치</dt>
                  <dd className="text-gray-900 font-medium">서울 금천구 디지털로 178, 가산퍼블릭 B동</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-gray-400 shrink-0 w-20">대표</dt>
                  <dd className="text-gray-900 font-medium">김성식</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-gray-400 shrink-0 w-20">인력</dt>
                  <dd className="text-gray-900 font-medium">전국 8개 지점, 약 40명</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-gray-400 shrink-0 w-20">파트너</dt>
                  <dd className="text-gray-900 font-medium">지니언스, 파이오링크, 주니퍼네트웍스, 시스코 등</dd>
                </div>
              </dl>
              <div className="grid grid-cols-2 gap-3 mt-5 border-t border-gray-50 pt-5">
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-lg font-extrabold text-gray-900">80+</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">우수 고객사</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-lg font-extrabold text-gray-900">12년</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">업력</p>
                </div>
              </div>
              <a
                href="https://orangesys.co.kr/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[13px] text-orange-500 font-semibold hover:text-orange-600 transition-colors mt-4"
              >
                오렌지시스 홈페이지
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Documents */}
      <section className="max-w-5xl mx-auto px-6 py-16 md:py-20">
        <div className="text-center mb-10">
          <p className="text-xs text-orange-500 font-bold tracking-widest uppercase mb-2">Documents</p>
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900">사업 계획 및 기술 문서</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
          <a
            href="https://o5l3.com/o5l3s.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 bg-[#fafafa] rounded-xl p-5 border border-gray-100 hover:border-orange-200 hover:shadow-md transition-all group"
          >
            <div className="w-10 h-10 bg-orange-50 text-orange-500 rounded-lg flex items-center justify-center shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <p className="text-[14px] font-bold text-gray-900 group-hover:text-orange-500 transition-colors">개요 문서</p>
              <p className="text-[12px] text-gray-400">사업 개요 및 제품 소개</p>
            </div>
          </a>
          <a
            href="https://o5l3.com/o5l3d.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 bg-[#fafafa] rounded-xl p-5 border border-gray-100 hover:border-orange-200 hover:shadow-md transition-all group"
          >
            <div className="w-10 h-10 bg-orange-50 text-orange-500 rounded-lg flex items-center justify-center shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <p className="text-[14px] font-bold text-gray-900 group-hover:text-orange-500 transition-colors">상세 문서</p>
              <p className="text-[12px] text-gray-400">기술 아키텍처 및 상세 설명</p>
            </div>
          </a>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-5xl mx-auto px-6 pb-20">
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-8 md:p-12 text-center">
          <h3 className="text-xl md:text-2xl font-bold text-white mb-3">
            Orange Platform이 궁금하신가요?
          </h3>
          <p className="text-sm text-orange-100 mb-8 max-w-md mx-auto">
            엔드포인트 성능 모니터링의 새로운 기준을 경험해보세요.
            도입 상담 및 데모를 요청하실 수 있습니다.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <a
              href="https://o5l3.notion.site/"
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3 bg-white text-orange-600 font-semibold rounded-lg hover:bg-orange-50 transition-colors text-sm"
            >
              자세히 알아보기
            </a>
            <Link
              to="/"
              className="px-6 py-3 bg-white/20 text-white font-medium rounded-lg hover:bg-white/30 transition-colors text-sm"
            >
              블로그 둘러보기
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
