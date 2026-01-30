---
title: "WMIPrvSE.exe 고CPU 사용 원인 추적 가이드"
date: 2026-01-24T22:11:00+09:00
categories: [Analysis,Development]
tags: [Windows,WMIPrvSE.exe]
excerpt: "WMIPrvSE.exe CPU 사용 원인 추적 가이드"
author_profile: true
read_time: true
comments: true
share: true
related: true
---

## 개요

WMIPrvSE.exe (WMI Provider Host)가 높은 CPU를 사용할 때 원인이 되는 프로세스를 찾는 방법을 정리합니다.

## 1단계: WMIPrvSE 인스턴스별 CPU 사용량 확인

여러 WMIPrvSE.exe 인스턴스 중 어떤 것이 CPU를 많이 사용하는지 확인합니다.

```powershell
Get-Process WmiPrvSE | ForEach-Object {
    Write-Host "PID: $($_.Id), CPU: $([math]::Round($_.CPU,1))s"
}
```

## 2단계: 특정 PID의 CPU 증가량 모니터링

문제가 되는 PID를 찾았으면, 5초 간격으로 CPU 증가량을 모니터링합니다.

```powershell
# 예: PID 63556이 의심되는 경우
for ($i=0; $i -lt 10; $i++) {
    $cpu = (Get-Process WmiPrvSE | Where-Object {$_.Id -eq 63556}).CPU
    Write-Host "$(Get-Date -Format 'HH:mm:ss') - CPU: $([math]::Round($cpu,1))s"
    Start-Sleep 5
}
```

## 3단계: WMI Provider 확인

해당 WMIPrvSE가 어떤 provider를 호스팅하는지 확인합니다.

```powershell
# 커맨드라인 확인
(Get-CimInstance Win32_Process -Filter "ProcessId=63556").CommandLine

# 관련 로그 확인
Get-WinEvent -LogName "Microsoft-Windows-WMI-Activity/Operational" -MaxEvents 500 | 
    Where-Object { $_.Message -match "63556" } | 
    Select-Object -First 5 TimeCreated, Message
```

## 4단계: WMI 이벤트 로그에서 클라이언트 찾기

WMI를 호출하는 클라이언트 프로세스 ID를 찾습니다.

```powershell
# 최근 WMI 활동 로그 확인
Get-WinEvent -LogName "Microsoft-Windows-WMI-Activity/Operational" -MaxEvents 20 | 
    Select-Object TimeCreated, Message | Format-List

# 클라이언트 PID 추출 및 프로세스 이름 확인
Get-WinEvent -LogName "Microsoft-Windows-WMI-Activity/Operational" -MaxEvents 200 | 
    ForEach-Object {
        if ($_.Message -match "ClientProcessId\s*=\s*(\d+)") {
            $Matches[1]
        }
    } | Sort-Object -Unique | ForEach-Object {
        $proc = Get-Process -Id $_ -ErrorAction SilentlyContinue
        if ($proc) { "$_ : $($proc.Name) - $($proc.Path)" }
    }
```

## 5단계: 특정 쿼리 (예: Win32_Process) 호출자 찾기

System Informer의 Thread Stack에서 `cimwin32.dll!Process::Enumerate`가 보이면 Win32_Process 쿼리가 원인입니다.

```powershell
# Win32_Process 쿼리하는 클라이언트 찾기
Get-WinEvent -LogName "Microsoft-Windows-WMI-Activity/Operational" -MaxEvents 300 | 
    Where-Object { $_.Message -match "Win32_Process" } |
    ForEach-Object {
        if ($_.Message -match "ClientProcessId\s*=\s*(\d+)") {
            $cpid = $Matches[1]
            $proc = Get-Process -Id $cpid -ErrorAction SilentlyContinue
            [PSCustomObject]@{
                Time = $_.TimeCreated
                PID = $cpid
                Name = $proc.Name
                Path = $proc.Path
            }
        }
    } | Format-Table -AutoSize
```

## 6단계: System Informer로 스레드 스택 확인

1. System Informer 실행
2. WmiPrvSE.exe (문제 PID) 더블클릭
3. **Threads** 탭 선택
4. CPU 사용 중인 스레드 선택 → **Stack** 버튼 클릭
5. 스택에서 어떤 provider/DLL이 호출되는지 확인

### 주요 스택 패턴

| 스택 패턴 | 의미 |
|-----------|------|
| `cimwin32.dll!Process::Enumerate` | Win32_Process 열거 |
| `cimwin32.dll!Win32_LogicalDisk` | 디스크 정보 쿼리 |
| `wmipcima.dll` | CIMWin32a provider |
| `NetAdapterCim.dll` | 네트워크 어댑터 쿼리 |

## 7단계: 의심 프로세스 종료 테스트

비시스템 프로세스 목록을 확인하고, 하나씩 종료하면서 CPU 변화를 확인합니다.

```powershell
# 비시스템 프로세스 목록 (CPU 사용량 순)
Get-Process | Where-Object { 
    $_.Path -and 
    $_.Path -notmatch "Windows|Microsoft|System32" -and
    $_.CPU -gt 1 
} | Sort-Object CPU -Descending | 
    Select-Object Name, Id, @{N='CPU(s)';E={[math]::Round($_.CPU,1)}}, Path |
    Format-Table -AutoSize
```

### 종료 테스트 스크립트

```powershell
# 의심 프로세스 종료 전후 비교
$targetPid = 63556  # WmiPrvSE PID

$before = (Get-Process WmiPrvSE | Where-Object {$_.Id -eq $targetPid}).CPU

# 의심 프로세스 종료 (예: LenovoVantage)
Get-Process | Where-Object { $_.Name -match "Lenovo" } | Stop-Process -Force

Start-Sleep 10

$after = (Get-Process WmiPrvSE | Where-Object {$_.Id -eq $targetPid}).CPU
Write-Host "Before: $before, After: $after, Diff: $($after - $before) (10초간)"
```

**Diff 값이 크게 줄어들면 해당 프로세스가 원인입니다.**

## 8단계: 모니터링 도구 없이 CPU 확인

작업관리자나 System Informer 자체가 WMI를 사용할 수 있으므로, PowerShell로만 모니터링합니다.

```powershell
# 5초 간격으로 WmiPrvSE CPU 사용량 체크 (10회)
for ($i=0; $i -lt 10; $i++) {
    $proc = Get-Process WmiPrvSE -ErrorAction SilentlyContinue
    $cpu = ($proc | Measure-Object -Property CPU -Sum).Sum
    Write-Host "$(Get-Date -Format 'HH:mm:ss') - WmiPrvSE CPU Time: $([math]::Round($cpu,2))s (Count: $($proc.Count))"
    Start-Sleep 5
}
```

## 자주 발견되는 원인 프로그램

| 프로그램 | 설명 |
|----------|------|
| **Incredibuild** | 분산 빌드 시스템, 프로세스 모니터링 |
| **LenovoVantage** | 하드웨어 모니터링 |
| **NVIDIA NvContainer** | GPU/밝기 모니터링 |
| **백신 (V3, etc.)** | 시스템 스캔 |
| **VMware 서비스** | 가상화 관련 모니터링 |
| **System Informer/Process Explorer** | 프로세스 모니터링 도구 |

## 요약 플로우차트

```
WmiPrvSE.exe 고CPU 발견
    ↓
1. 어떤 PID가 문제인지 확인
    ↓
2. 해당 PID의 CPU 증가량 모니터링
    ↓
3. WMI 이벤트 로그에서 클라이언트 PID 확인
    ↓
4. System Informer로 스레드 스택 확인
    ↓
5. 의심 프로세스 하나씩 종료하며 테스트
    ↓
6. CPU 증가량이 줄어드는 프로세스 = 범인
```

---

**작성일**: 2025-01-24  
**사례**: Incredibuild (Manager, CoordinatorService)가 Win32_Process를 반복 쿼리하여 WmiPrvSE.exe CPU 15% 사용 유발
