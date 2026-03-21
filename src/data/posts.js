export const categories = [
  { id: 'all', name: '전체', description: '모든 게시글' },
  { id: 'report', name: '리포트', description: '고객사 분석 보고서 및 사례' },
  { id: 'tech', name: '기술', description: '기술 아티클 및 개발 가이드' },
  { id: 'news', name: '소식', description: '회사 소식 및 공지사항' },
]

export const posts = [
  {
    id: 'pc-performance-report-1',
    title: '고객사 PC 성능 저하 사례 분석 보고서',
    excerpt: '2025년 10월 고객사 24대 PC에서 발견된 198건의 성능 저하 증상을 분석한 보고서입니다. 파일 시스템 지연, 비정상 프로세스 종료, CPU 과다 사용, BSOD 등의 사례를 다룹니다.',
    category: 'report',
    date: '2025-11-17',
    author: 'Orange Labs',
    thumbnail: null,
    tags: ['성능분석', 'PC', '고객사보고서', 'Orange Platform'],
    content: `# 고객사 PC 성능 저하 사례 분석 보고서

## 개요

2025년 10월, 고객사 환경에서 Orange Platform을 통해 수집된 데이터를 기반으로 **24대의 PC**에서 총 **198건의 성능 저하 증상**을 분석하였습니다.

## 주요 발견 사항

### 1. 파일 시스템 지연
- 특정 프로세스에서 파일 I/O 응답 시간이 비정상적으로 증가
- 디스크 큐 길이가 임계치를 초과하는 사례 다수 발견
- 안티바이러스 실시간 스캔과의 충돌이 주요 원인으로 분석됨

### 2. 비정상 프로세스 종료
- 메모리 부족으로 인한 강제 종료 사례 **47건**
- 핸들 릭으로 인한 점진적 성능 저하 후 종료 **23건**
- 특정 DLL 충돌로 인한 크래시 **15건**

### 3. CPU 과다 사용
- 백그라운드 서비스의 비정상적 CPU 점유 사례 분석
- WMI Provider Host(WMIPrvSE.exe)의 고CPU 사용 패턴 발견
- 특정 시간대에 집중되는 스케줄 작업과의 연관성 확인

### 4. BSOD 발생
- 드라이버 호환성 문제로 인한 블루스크린 **8건**
- 메모리 하드웨어 오류 의심 사례 **3건**

## 권장 조치사항

1. 안티바이러스 예외 정책 최적화
2. 메모리 사용량 모니터링 임계치 설정
3. 드라이버 업데이트 일괄 적용
4. Orange Platform 실시간 알림 설정 강화

## 결론

Orange Platform의 실시간 모니터링 데이터를 활용하여 사전에 성능 저하 징후를 포착하고, 선제적 대응이 가능함을 확인하였습니다.
`,
  },
  {
    id: 'pc-performance-report-2',
    title: '고객사 PC 성능 분석 보고서 2',
    excerpt: '2025년 12월 17개 노드에 대한 성능 분석 보고서입니다. CPU, 메모리, 디스크, 핸들 메트릭을 종합 분석하고, 메모리 과다 사용 프로그램을 식별합니다.',
    category: 'report',
    date: '2026-01-08',
    author: 'Orange Labs',
    thumbnail: null,
    tags: ['성능분석', 'PC', '고객사보고서', '메모리', 'CPU'],
    content: `# 고객사 PC 성능 분석 보고서 2

## 분석 개요

- **분석 기간**: 2025년 12월
- **대상 노드**: 17대
- **수집 메트릭**: CPU, 메모리, 디스크 I/O, 핸들 수

## CPU 사용률 분석

| 구간 | 노드 수 | 비율 |
|------|---------|------|
| 0~30% | 8대 | 47% |
| 30~60% | 5대 | 29% |
| 60~90% | 3대 | 18% |
| 90% 이상 | 1대 | 6% |

평균 CPU 사용률은 **35.2%**로 전반적으로 양호하나, 1대의 PC에서 지속적인 90% 이상 사용률이 관측되었습니다.

## 메모리 사용 분석

### 메모리 과다 사용 프로그램 TOP 5
1. **Chrome.exe** - 평균 2.1GB (다수 탭 사용)
2. **Teams.exe** - 평균 850MB
3. **Outlook.exe** - 평균 620MB
4. **사내 ERP 클라이언트** - 평균 580MB
5. **Visual Studio** - 평균 1.4GB (개발자 PC 한정)

## 디스크 I/O 분석

- SSD 장착 PC(12대): 평균 응답 시간 **2.3ms** (양호)
- HDD 장착 PC(5대): 평균 응답 시간 **18.7ms** (개선 필요)
- HDD PC에서 부팅 시간이 SSD 대비 **3.2배** 느린 것으로 확인

## 특이사항

### PC-017 상세 분석
- 지속적인 메모리 부족 현상 (물리 메모리 8GB, 상시 95% 이상 사용)
- 페이지 파일 사용량 급증으로 디스크 I/O 병목 발생
- **권장**: 메모리 16GB로 증설 또는 불필요 상주 프로그램 정리

## 결론 및 권장사항

1. HDD → SSD 교체를 통한 I/O 성능 개선 (5대)
2. 메모리 8GB 미만 PC의 메모리 증설 검토
3. Chrome 탭 관리 정책 수립
4. Orange Platform 대시보드를 통한 주간 모니터링 리포트 자동화
`,
  },
  {
    id: 'wmiprvse-high-cpu-guide',
    title: 'WMIPrvSE.exe 고CPU 사용 원인 추적 가이드',
    excerpt: 'Windows WMI Provider Host(WMIPrvSE.exe)가 높은 CPU를 사용할 때의 원인 분석 및 해결 방법을 PowerShell 명령어와 함께 상세히 안내합니다.',
    category: 'tech',
    date: '2026-01-24',
    author: 'Orange Labs',
    thumbnail: null,
    tags: ['Windows', 'WMI', 'CPU', '트러블슈팅', 'PowerShell'],
    content: `# WMIPrvSE.exe 고CPU 사용 원인 추적 가이드

## WMIPrvSE.exe란?

**WMI Provider Host** (WMIPrvSE.exe)는 Windows Management Instrumentation의 핵심 프로세스로, 시스템 관리 정보를 제공하는 WMI 프로바이더를 호스팅합니다.

이 프로세스가 높은 CPU를 사용하는 경우, 특정 WMI 쿼리가 과도하게 실행되고 있음을 의미합니다.

## 원인 분석 절차

### Step 1: WMI 활동 확인

\`\`\`powershell
# 현재 WMI 프로세스 확인
Get-Process WmiPrvSE | Select-Object Id, CPU, WorkingSet64, StartTime
\`\`\`

### Step 2: WMI 쿼리 추적

\`\`\`powershell
# WMI 트레이싱 활성화
wevtutil sl Microsoft-Windows-WMI-Activity/Trace /e:true

# 최근 WMI 작업 로그 확인
Get-WinEvent -LogName "Microsoft-Windows-WMI-Activity/Operational" -MaxEvents 50 |
  Select-Object TimeCreated, Message |
  Format-List
\`\`\`

### Step 3: 어떤 프로세스가 WMI를 호출하는지 확인

\`\`\`powershell
# WMI 쿼리를 실행하는 클라이언트 프로세스 추적
Get-WmiObject -Query "SELECT * FROM __InstanceOperationEvent WITHIN 5" |
  ForEach-Object { $_.TargetInstance }
\`\`\`

### Step 4: 특정 WMI 프로바이더 식별

\`\`\`powershell
# 로드된 WMI 프로바이더 목록
Get-WmiObject -Class __Win32Provider |
  Select-Object Name, CLSID, HostingModel |
  Format-Table -AutoSize
\`\`\`

## 일반적인 원인과 해결방법

### 1. 모니터링 소프트웨어의 과도한 폴링
- **증상**: 주기적으로 CPU 스파이크 발생
- **해결**: 폴링 간격 조정 (5초 → 30초 이상)

### 2. 손상된 WMI 리포지토리
- **증상**: 지속적인 높은 CPU 사용
- **해결**:
\`\`\`powershell
# WMI 리포지토리 무결성 검사
winmgmt /verifyrepository

# 필요시 리포지토리 재구축
winmgmt /salvagerepository
\`\`\`

### 3. 잘못된 WMI 이벤트 구독
- **증상**: 특정 이벤트 발생 시 CPU 급증
- **해결**:
\`\`\`powershell
# 영구 WMI 이벤트 구독 확인
Get-WmiObject -Namespace root\\subscription -Class __EventFilter
Get-WmiObject -Namespace root\\subscription -Class __EventConsumer
\`\`\`

## Orange Platform에서의 모니터링

Orange Platform은 WMIPrvSE.exe의 CPU 사용률을 실시간으로 추적하며, 임계치 초과 시 자동으로 알림을 발생시킵니다. 또한 어떤 WMI 쿼리가 성능에 영향을 주는지 상세 분석 데이터를 제공합니다.
`,
  },
]

export function getPostsByCategory(categoryId) {
  if (categoryId === 'all') return posts
  return posts.filter(p => p.category === categoryId)
}

export function getPostById(id) {
  return posts.find(p => p.id === id)
}

export function searchPosts(query) {
  const q = query.toLowerCase()
  return posts.filter(p =>
    p.title.toLowerCase().includes(q) ||
    p.excerpt.toLowerCase().includes(q) ||
    p.tags.some(t => t.toLowerCase().includes(q))
  )
}
