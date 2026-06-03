$ErrorActionPreference = "Stop"
Set-Location "D:\PROJECTS\MIRCH_PROJECT_PROMPTS\MIRCH_PROJECT_DEEPSEEKCODE"

# Start server
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "node"
$psi.Arguments = "server.js"
$psi.WorkingDirectory = "D:\PROJECTS\MIRCH_PROJECT_PROMPTS\MIRCH_PROJECT_DEEPSEEKCODE"
$psi.UseShellExecute = $false
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$proc = [System.Diagnostics.Process]::Start($psi)
Start-Sleep -Seconds 4

# Test /api/talent
try {
    $r = Invoke-RestMethod -Uri "http://localhost:3000/api/talent" -ErrorAction Stop
    Write-Output "TALENT_OK:$($r.Count)"
    $r | Select-Object -First 2 full_name, district, latitude | Format-Table
} catch {
    Write-Output "TALENT_ERR:$($_.Exception.Message)"
    try { Write-Output "STATUS:$($_.Exception.Response.StatusCode.value__)" } catch {}
}

# Clean up
Start-Sleep -Seconds 1
$proc.Kill()
$proc.Dispose()
Remove-Item "D:\PROJECTS\MIRCH_PROJECT_PROMPTS\MIRCH_PROJECT_DEEPSEEKCODE\tmp_test.ps1"
