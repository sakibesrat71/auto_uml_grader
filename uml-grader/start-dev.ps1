$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Test-Port {
  param([int]$Port)

  $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1

  return $null -ne $connection
}

function Get-PortOwner {
  param([int]$Port)

  $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1

  if (-not $connection) {
    return $null
  }

  $process = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
  if (-not $process) {
    return "PID $($connection.OwningProcess)"
  }

  return "$($process.ProcessName) PID $($process.Id)"
}

function Wait-ForPort {
  param(
    [int]$Port,
    [string]$Name,
    [int]$TimeoutSeconds = 60
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-Port $Port) {
      Write-Host "OK: $Name is listening on port $Port." -ForegroundColor Green
      return $true
    }
    Start-Sleep -Seconds 1
  }

  Write-Host "WARN: $Name did not start listening on port $Port within $TimeoutSeconds seconds." -ForegroundColor Yellow
  return $false
}

function Test-HttpHealth {
  param(
    [string]$Url,
    [string]$Name,
    [int]$TimeoutSeconds = 60
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-RestMethod -Uri $Url -TimeoutSec 3
      Write-Host "OK: $Name health check passed at $Url." -ForegroundColor Green
      return $response
    } catch {
      Start-Sleep -Seconds 1
    }
  }

  Write-Host "WARN: $Name health check did not pass at $Url within $TimeoutSeconds seconds." -ForegroundColor Yellow
  return $null
}

function Start-NodeApp {
  param(
    [string]$Name,
    [string]$RelativePath,
    [string]$NpmScript,
    [int]$Port,
    [string]$OutLog,
    [string]$ErrLog
  )

  $owner = Get-PortOwner $Port
  if ($owner) {
    Write-Host "SKIP: $Name already appears to be running on port $Port ($owner)." -ForegroundColor Cyan
    return
  }

  $workdir = Join-Path $Root $RelativePath
  $outPath = Join-Path $workdir $OutLog
  $errPath = Join-Path $workdir $ErrLog

  Write-Host "START: $Name on port $Port..." -ForegroundColor Cyan
  Start-Process `
    -FilePath 'npm.cmd' `
    -ArgumentList @('run', $NpmScript) `
    -WorkingDirectory $workdir `
    -RedirectStandardOutput $outPath `
    -RedirectStandardError $errPath `
    -WindowStyle Hidden
}

Write-Host ''
Write-Host 'Auto UML Grader dev launcher' -ForegroundColor White
Write-Host '================================' -ForegroundColor DarkGray

if (Test-Port 27017) {
  Write-Host "OK: MongoDB is listening on port 27017 ($(Get-PortOwner 27017))." -ForegroundColor Green
} else {
  Write-Host 'WARN: MongoDB is not listening on port 27017.' -ForegroundColor Yellow
  Write-Host '      Start MongoDB first, then rerun this script. The API needs MongoDB to be available.' -ForegroundColor Yellow
}

Start-NodeApp `
  -Name 'Grader' `
  -RelativePath 'apps\grader' `
  -NpmScript 'start:dev' `
  -Port 4100 `
  -OutLog 'grader.out.log' `
  -ErrLog 'grader.err.log'

Start-NodeApp `
  -Name 'API' `
  -RelativePath 'apps\api' `
  -NpmScript 'start:dev' `
  -Port 4000 `
  -OutLog 'api.out.log' `
  -ErrLog 'api.err.log'

Start-NodeApp `
  -Name 'Web' `
  -RelativePath 'apps\web' `
  -NpmScript 'dev' `
  -Port 3000 `
  -OutLog 'web.out.log' `
  -ErrLog 'web.err.log'

Write-Host ''
Write-Host 'Waiting for services...' -ForegroundColor White
Wait-ForPort -Name 'Grader' -Port 4100 | Out-Null
Wait-ForPort -Name 'API' -Port 4000 | Out-Null
Wait-ForPort -Name 'Web' -Port 3000 | Out-Null

$graderHealth = Test-HttpHealth -Name 'Grader' -Url 'http://localhost:4100/health' -TimeoutSeconds 20
$apiHealth = Test-HttpHealth -Name 'API' -Url 'http://localhost:4000/health' -TimeoutSeconds 20

Write-Host ''
Write-Host 'Dev URLs' -ForegroundColor White
Write-Host '--------' -ForegroundColor DarkGray
Write-Host 'Web:    http://localhost:3000'
Write-Host 'API:    http://localhost:4000'
Write-Host 'Grader: http://localhost:4100'

if ($graderHealth) {
  Write-Host ''
  Write-Host "Grader text model:   $($graderHealth.ollamaModel)"
  Write-Host "Grader vision model: $($graderHealth.ollamaVisionModel)"
}

if ($apiHealth -and $apiHealth.database) {
  Write-Host "API database status: $($apiHealth.database.status)"
}

Write-Host ''
Write-Host 'Logs' -ForegroundColor White
Write-Host '----' -ForegroundColor DarkGray
Write-Host 'apps\grader\grader.out.log'
Write-Host 'apps\grader\grader.err.log'
Write-Host 'apps\api\api.out.log'
Write-Host 'apps\api\api.err.log'
Write-Host 'apps\web\web.out.log'
Write-Host 'apps\web\web.err.log'
Write-Host ''
