---
title: "블루투스 끊김의 숨겨진 원인: 배터리 전원 정책 추적 가이드"
excerpt: "재택근무 시 블루투스가 자꾸 끊기는 원인을 Windows 전원 정책과 배터리 방전 속도에서 찾고, PowerShell로 진단하는 방법을 안내합니다."
category: tech
date: 2026-03-25
author: Orange Labs
tags: [Windows, Bluetooth, 배터리, Modern Standby, PowerShell, 트러블슈팅]
---

# 블루투스 끊김의 숨겨진 원인: 배터리 전원 정책 추적 가이드

## 문제 상황

"회사에선 블루투스가 안 끊기는데, 재택에서 자꾸 끊겨요."

IT 관리자가 가장 많이 듣는 불만 중 하나입니다. 블루투스 마우스, 키보드, 헤드셋이 간헐적으로 끊기는 현상은 단순한 페어링 문제가 아닐 수 있습니다.

이 글에서는 **Windows의 배터리 전원 정책이 블루투스를 강제로 끊는 메커니즘**을 분석하고, 우리 회사제품에 있는 1:N 혹은 Powershell로 진단하는 방법을 안내합니다.

## 원인: Modern Standby의 배터리 긴축 모드

Windows 10/11의 **Modern Standby(S0 Low Power Idle)**는 노트북이 화면을 끄거나 유휴 상태에 들어갈 때 활성화됩니다. 이때 배터리 방전 속도가 허용 예산을 초과하면 다음 체인이 발동합니다:

```text
Modern Standby 진입
  → 배터리 방전 속도가 허용 예산(Budget) 초과
    → Austerity(긴축 모드) 발동
      → Policy Setting: 무선 연결 강제 차단 (BT, WiFi)
        → 사용자가 돌아오면 BT 재연결 필요
          → "또 끊겼네"
```

### 핵심 포인트: 잔량이 아니라 "방전 속도"

Austerity는 배터리 잔량이 낮아서 발동하는 것이 **아닙니다**. Standby 진입 시점 대비 시간당 소비 전력이 예산을 초과하면 발동합니다. 실제 측정에서 **배터리 99.5%에서도 Austerity가 발생**한 사례를 확인했습니다.

| Austerity 발생 시각 | 당시 배터리 잔량 |
| --- | --- |
| 03-23 13:57 | **99.5%** |
| 03-20 13:54 | **97.5%** |
| 03-22 04:13 | 74.5% |

배터리가 충분해도 VPN, 백그라운드 앱, 네트워크 알림 등 **Wake Source**가 활발하면 방전 속도가 급증하여 Austerity가 발동합니다. 재택근무 환경에서 VPN이 상시 연결되어 있으면 이 현상이 더 빈번합니다.

## 진단 절차

### Step 1: 전원 이벤트 + BT 이벤트 통합 조회

최근 7일간 전원 상태 변화와 블루투스 이벤트를 시간순으로 확인합니다.

```powershell
$startDate = (Get-Date).AddDays(-7)
$events = @()

# Kernel-Power: 전원 전환, Standby, 슬립
$events += Get-WinEvent -FilterHashtable @{
    LogName='System'; ProviderName='Microsoft-Windows-Kernel-Power';
    Id=105,172,506,42,107; StartTime=$startDate
} -ErrorAction SilentlyContinue

# BTHUSB: 블루투스 어댑터 이벤트
$events += Get-WinEvent -FilterHashtable @{
    LogName='System'; ProviderName='BTHUSB';
    StartTime=$startDate
} -ErrorAction SilentlyContinue

$events |
    Sort-Object TimeCreated |
    Select-Object TimeCreated,
        @{N='Source';E={$_.ProviderName -replace 'Microsoft-Windows-',''}},
        Id, LevelDisplayName, Message |
    Format-Table -AutoSize -Wrap
```

### Step 2: EventID 172 Disconnected 확인

**EventID 172**는 Modern Standby 중 무선 연결이 끊긴 시점과 이유를 기록하는 핵심 이벤트입니다.

```powershell
$disc172 = Get-WinEvent -FilterHashtable @{
    LogName='System'; ProviderName='Microsoft-Windows-Kernel-Power'; Id=172;
    StartTime=(Get-Date).AddDays(-7)
} -ErrorAction SilentlyContinue |
    Where-Object { $_.Message -match 'Disconnected' }

Write-Host "172 Disconnected: $($disc172.Count)건"

$disc172 | ForEach-Object {
    $reason = if ($_.Message -match 'Reason:\s*(.+)') { $Matches[1].Trim() } else { '?' }
    Write-Host "$($_.TimeCreated.ToString('MM/dd HH:mm:ss'))  $reason"
}
```

172 Disconnected에는 두 가지 주요 Reason이 있습니다:

| Reason | 의미 | 발생 조건 |
| --- | --- | --- |
| **Adaptive Connected Standby** | OS가 자체 판단으로 연결 끊기 시도 | AC/DC 무관 |
| **Policy Setting** | 전원 정책이 강제로 연결 차단 확정 | **DC(배터리)일 때만** |

### Step 3: Austerity와 Policy Setting의 상관관계 확인

Policy Setting이 Austerity(배터리 긴축 모드)와 연관되는지 확인합니다.

```powershell
$startDate = (Get-Date).AddDays(-7)

$policyEvents = Get-WinEvent -FilterHashtable @{
    LogName='System'; ProviderName='Microsoft-Windows-Kernel-Power'; Id=172;
    StartTime=$startDate
} -ErrorAction SilentlyContinue |
    Where-Object { $_.Message -match 'Policy Setting' } |
    Sort-Object TimeCreated

$austerity = Get-WinEvent -FilterHashtable @{
    LogName='System'; ProviderName='Microsoft-Windows-Kernel-Power'; Id=506;
    StartTime=$startDate
} -ErrorAction SilentlyContinue |
    Where-Object { $_.Message -match 'Austerity' }

foreach ($p in $policyEvents) {
    $t = $p.TimeCreated
    $nearAusterity = $austerity | Where-Object {
        $_.TimeCreated -lt $t -and $_.TimeCreated -gt $t.AddMinutes(-10)
    }
    $marker = if ($nearAusterity) { "[Austerity]" } else { "" }
    Write-Host "$($t.ToString('MM/dd HH:mm:ss'))  Policy Setting  $marker"
}
```

실제 4대 PC에서 측정한 결과, Policy Setting 발생 건의 **100%가 Austerity를 동반**했습니다. Austerity 발동 후 약 10~12초 뒤에 Policy Setting이 확정되어 블루투스가 끊깁니다.

### Step 4: Austerity 발생 시 배터리 상세 데이터 확인

506 Austerity 이벤트의 XML에는 발생 당시 배터리 용량 정보가 포함되어 있습니다.

```powershell
$austerity = Get-WinEvent -FilterHashtable @{
    LogName='System'; ProviderName='Microsoft-Windows-Kernel-Power'; Id=506;
    StartTime=(Get-Date).AddDays(-7)
} -ErrorAction SilentlyContinue |
    Where-Object { $_.Message -match 'Austerity' }

foreach ($a in ($austerity | Sort-Object TimeCreated)) {
    $xml = [xml]$a.ToXml()
    $data = @{}
    $xml.Event.EventData.Data | ForEach-Object { $data[$_.Name] = $_.'#text' }

    $remaining = [int]$data['BatteryRemainingCapacityOnEnter']
    $full = [int]$data['BatteryFullChargeCapacityOnEnter']
    $pct = if ($full -gt 0) { [Math]::Round($remaining / $full * 100, 1) } else { "?" }

    Write-Host "$($a.TimeCreated.ToString('MM/dd HH:mm:ss'))  Battery: ${pct}% (${remaining}/${full} mWh)"
}
```

### Step 5: AC/DC 상태별 분류

Policy Setting이 배터리(DC) 상태에서만 발생하는지 확인합니다.

```powershell
$startDate = (Get-Date).AddDays(-7)

$disc172 = Get-WinEvent -FilterHashtable @{
    LogName='System'; ProviderName='Microsoft-Windows-Kernel-Power'; Id=172;
    StartTime=$startDate
} -ErrorAction SilentlyContinue |
    Where-Object { $_.Message -match 'Disconnected' } |
    Sort-Object TimeCreated

$austerity = Get-WinEvent -FilterHashtable @{
    LogName='System'; ProviderName='Microsoft-Windows-Kernel-Power'; Id=506;
    StartTime=$startDate
} -ErrorAction SilentlyContinue |
    Where-Object { $_.Message -match 'Austerity' }

foreach ($d in $disc172) {
    $t = $d.TimeCreated
    $reason = if ($d.Message -match 'Reason:\s*(.+)') { $Matches[1].Trim() } else { '?' }

    $nearAusterity = $austerity | Where-Object {
        $_.TimeCreated -lt $t -and $_.TimeCreated -gt $t.AddMinutes(-10)
    }
    $power = if ($nearAusterity) { 'DC(Battery)' } else { 'AC/Unknown' }

    Write-Host "$($t.ToString('MM/dd HH:mm:ss'))  $reason  [$power]"
}
```

4대 PC에서의 측정 결과:

| | Adaptive (AC) | Policy Setting (DC) |
| --- | --- | --- |
| 문제 PC | 11건 | **11건** |
| PC B | 16건 | 1건 |
| PC C | 11건 | **3건** |

**Adaptive(AC)는 모든 PC에서 비슷하지만, Policy Setting(DC)은 배터리 사용 시간에 비례합니다.**

### Step 6: 현재 배터리 방전 상태 확인

충전기가 연결되어 있는데도 방전 중인지(약한 충전기) 실시간으로 확인합니다.

```powershell
$batt = Get-CimInstance -Namespace root/wmi -ClassName BatteryStatus -ErrorAction SilentlyContinue
$battery = Get-CimInstance -ClassName Win32_Battery -ErrorAction SilentlyContinue

if ($batt) {
    Write-Host "PowerOnline(AC): $($batt.PowerOnline)"
    Write-Host "ChargeRate: $($batt.ChargeRate) mW"
    Write-Host "DischargeRate: $($batt.DischargeRate) mW"
    Write-Host "Charge: $($battery.EstimatedChargeRemaining)%"

    if ($batt.PowerOnline -and $batt.DischargeRate -gt 0) {
        Write-Host ">>> WARNING: AC 연결인데 방전 중! 충전기 출력 부족" -ForegroundColor Red
    }
}
```

`PowerOnline=True`인데 `DischargeRate > 0`이면 충전기의 출력이 노트북 소비 전력보다 낮아 배터리가 줄어들고 있는 상태입니다. 이 경우 AC 연결 상태임에도 Austerity가 발동할 수 있습니다.

## "재택에서 더 끊긴다"의 정체

| | 회사 | 재택 |
| --- | --- | --- |
| **전원** | AC 상시 연결 | DC(배터리) 혼용 |
| **Standby 시** | Adaptive만 → 복구됨 | Adaptive → Austerity → Policy Setting → 강제 차단 |
| **Wake Source** | 유선 LAN, 사내망 | VPN, 개인 네트워크 → 방전 속도 가속 |
| **결과** | BT 유지 | BT 끊김 |

장소가 아니라 **전원 상태(AC vs DC)와 Wake Source 활동량**이 본질입니다. 회사에서도 충전기 없이 사용하면 동일한 현상이 발생합니다.

## 해결 방법

### 방법 1: BT 어댑터 전원 관리 해제 (권장)

블루투스 어댑터의 "전원 절약 위해 끄기 허용" 설정을 해제하면, Standby 상태에서도 BT 연결이 유지됩니다.

```powershell
# BT 어댑터 전원 절약 해제
Get-PnpDevice -Class Bluetooth -Status OK -ErrorAction SilentlyContinue |
    Where-Object { $_.InstanceId -match '^USB' } | ForEach-Object {
    $shortId = $_.InstanceId.Split('\')[-1];
    $device = Get-CimInstance -Namespace root/wmi -ClassName MSPower_DeviceEnable -ErrorAction SilentlyContinue |
        Where-Object { $_.InstanceName -like "*$shortId*" };
    if ($device -and $device.Enable -eq $true) {
        $device.Enable = $false;
        Set-CimInstance $device
    };
    $result = if ($device.Enable -eq $false) { 'complete' } else { 'failed' };
    [PSCustomObject]@{
        Result = $result;
        Name = $_.FriendlyName;
        AllowPowerOff = $device.Enable
    }
} | ConvertTo-Json
```

성공 시 반환:

```json
{ "Result": "complete", "Name": "Intel(R) Wireless Bluetooth(R)", "AllowPowerOff": false }
```

### 방법 2: 충전기 연결 유지

DC 상태에서만 Policy Setting이 발동하므로, AC 전원을 유지하면 블루투스 끊김이 발생하지 않습니다. 단, 출력이 부족한 충전기(예: 65W 노트북에 30W 충전기)를 사용하면 AC 상태에서도 방전이 진행될 수 있으므로 정품 충전기 사용을 권장합니다.

### 방법 3: USB Selective Suspend 해제

USB Selective Suspend가 활성화되어 있으면 USB 연결 BT 어댑터가 절전 상태로 전환될 수 있습니다.

```powershell
# USB Selective Suspend 상태 확인
powercfg /query SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226

# AC/DC 모두 해제 (0=해제, 1=활성)
powercfg /setacvalueindex SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0
powercfg /setdcvalueindex SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0
powercfg /setactive SCHEME_CURRENT
```

## 관련 이벤트 정리

| EventID | 소스 | 의미 | 활용 |
| --- | --- | --- | --- |
| **172** | Kernel-Power | Standby 중 무선 연결 상태 변경 | 끊김 시점 + 원인(Reason) 특정 |
| **506** | Kernel-Power | Modern Standby 진입/Austerity | 긴축 모드 발동 시점 + 배터리 잔량 |
| **105** | Kernel-Power | AC ↔ DC 전원 전환 | 충전기 연결/해제 시점 |
| **18** | BTHUSB | BT 링크키 저장 실패 | 172와 조합하면 체감 끊김 특정 |
| **16** | BTHUSB | BT 상호 인증 실패 | 치명적 — 페어링 깨짐 |
| **17** | BTHUSB | BT 어댑터 완전 사망 | 치명적 — 즉시 알림 |

## Orange Platform에서의 모니터링

Orange Platform은 블루투스 어댑터의 전원 관리 설정과 배터리 방전 상태를 실시간으로 추적합니다. 배터리 긴축 모드로 인한 BT 강제 차단이 감지되면 자동으로 관리자에게 보고하며, 매니저 대시보드에서 1:N 원격 해제를 통해 다수 PC의 블루투스 끊김 문제를 일괄 해결할 수 있습니다.
