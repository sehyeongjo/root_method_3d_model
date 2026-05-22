$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootPath = [IO.Path]::GetFullPath($Root).TrimEnd([char[]]@("\", "/"))
$Port = 8000

$MimeTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "text/javascript; charset=utf-8"
  ".mjs"  = "text/javascript; charset=utf-8"
  ".csv"  = "text/csv; charset=utf-8"
  ".xlsx" = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ".txt"  = "text/plain; charset=utf-8"
}

function New-LoopbackServer {
  param([int]$Port)

  $Server = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Parse("127.0.0.1"), $Port)
  $Server.Start()
  return $Server
}

while ($true) {
  try {
    $Server = New-LoopbackServer -Port $Port
    break
  } catch {
    $Port += 1
  }
}

function Write-HttpResponse {
  param(
    [IO.Stream]$Stream,
    [int]$StatusCode,
    [string]$Reason,
    [string]$ContentType,
    [byte[]]$Body,
    [bool]$HeadOnly = $false
  )

  $Header =
    "HTTP/1.1 $StatusCode $Reason`r`n" +
    "Content-Type: $ContentType`r`n" +
    "Content-Length: $($Body.Length)`r`n" +
    "Cache-Control: no-store`r`n" +
    "Connection: close`r`n" +
    "`r`n"
  $HeaderBytes = [Text.Encoding]::ASCII.GetBytes($Header)
  $Stream.Write($HeaderBytes, 0, $HeaderBytes.Length)
  if (-not $HeadOnly -and $Body.Length -gt 0) {
    $Stream.Write($Body, 0, $Body.Length)
  }
}

function Write-TextResponse {
  param(
    [IO.Stream]$Stream,
    [int]$StatusCode,
    [string]$Reason,
    [string]$Text,
    [bool]$HeadOnly = $false
  )

  $Body = [Text.Encoding]::UTF8.GetBytes($Text)
  Write-HttpResponse -Stream $Stream -StatusCode $StatusCode -Reason $Reason -ContentType "text/plain; charset=utf-8" -Body $Body -HeadOnly $HeadOnly
}

try {
  $Url = "http://127.0.0.1:$Port/"
  Start-Process $Url

  Write-Host "Root demo is running at:"
  Write-Host $Url
  Write-Host ""
  Write-Host "This server is serving only:"
  Write-Host $RootPath
  Write-Host ""
  Write-Host "No Python or npm install is required on Windows."
  Write-Host "Keep this window open while presenting."
  Write-Host "Press Ctrl+C to stop the local server."

  while ($true) {
    $Client = $Server.AcceptTcpClient()
    try {
      $Stream = $Client.GetStream()
      $Reader = [IO.StreamReader]::new($Stream, [Text.Encoding]::ASCII, $false, 4096, $true)
      $RequestLine = $Reader.ReadLine()

      while ($true) {
        $HeaderLine = $Reader.ReadLine()
        if ($null -eq $HeaderLine -or $HeaderLine -eq "") {
          break
        }
      }

      if ([string]::IsNullOrWhiteSpace($RequestLine)) {
        Write-TextResponse -Stream $Stream -StatusCode 400 -Reason "Bad Request" -Text "Bad request"
        continue
      }

      $Parts = $RequestLine.Split(" ")
      $Method = $Parts[0]
      $RequestTarget = $Parts[1]
      $HeadOnly = $Method -eq "HEAD"

      if ($Method -ne "GET" -and $Method -ne "HEAD") {
        Write-TextResponse -Stream $Stream -StatusCode 405 -Reason "Method Not Allowed" -Text "Method not allowed" -HeadOnly $HeadOnly
        continue
      }

      $RequestPath = $RequestTarget.Split("?")[0].TrimStart("/")
      $RequestPath = [Uri]::UnescapeDataString($RequestPath)
      if ([string]::IsNullOrWhiteSpace($RequestPath)) {
        $RequestPath = "index.html"
      }

      $RelativePath = $RequestPath.Replace("/", [IO.Path]::DirectorySeparatorChar)
      $FilePath = [IO.Path]::GetFullPath([IO.Path]::Combine($RootPath, $RelativePath))
      $RootWithSlash = $RootPath + [IO.Path]::DirectorySeparatorChar

      if (-not $FilePath.StartsWith($RootWithSlash, [StringComparison]::OrdinalIgnoreCase)) {
        Write-TextResponse -Stream $Stream -StatusCode 403 -Reason "Forbidden" -Text "Forbidden" -HeadOnly $HeadOnly
        continue
      }

      if (-not [IO.File]::Exists($FilePath)) {
        Write-TextResponse -Stream $Stream -StatusCode 404 -Reason "Not Found" -Text "Not found" -HeadOnly $HeadOnly
        continue
      }

      $Extension = [IO.Path]::GetExtension($FilePath).ToLowerInvariant()
      $ContentType = $MimeTypes[$Extension]
      if (-not $ContentType) {
        $ContentType = "application/octet-stream"
      }

      $Body = [IO.File]::ReadAllBytes($FilePath)
      Write-HttpResponse -Stream $Stream -StatusCode 200 -Reason "OK" -ContentType $ContentType -Body $Body -HeadOnly $HeadOnly
    } catch {
      try {
        Write-TextResponse -Stream $Stream -StatusCode 500 -Reason "Internal Server Error" -Text "Internal server error"
      } catch {}
    } finally {
      $Client.Close()
    }
  }
} finally {
  if ($Server) {
    $Server.Stop()
  }
}
