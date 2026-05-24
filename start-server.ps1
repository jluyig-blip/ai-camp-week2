$pm2 = "$env:APPDATA\npm\pm2.cmd"
$project = "$env:USERPROFILE\고객문의-자동응답"
Set-Location $project

# PM2 데몬 깨우기
& $pm2 status | Out-Null
Start-Sleep -Seconds 3

# 저장된 프로세스 복원
& $pm2 resurrect
Start-Sleep -Seconds 3

# 복원 실패 시 직접 시작
$s = & $pm2 jlist 2>$null
if (-not $s -or $s -eq '[]') {
    & $pm2 start "$project\src\server.js" --name attrangs-cs
}
