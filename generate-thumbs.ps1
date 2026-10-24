Add-Type -AssemblyName System.Drawing

$rootDir = $PSScriptRoot
if (-not $rootDir) { $rootDir = Get-Location }
$thumbsDir = Join-Path $rootDir "thumbs"

if (-not (Test-Path $thumbsDir)) {
    New-Item -ItemType Directory -Path $thumbsDir -Force | Out-Null
}

$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]85)

$files = Get-ChildItem -Path $rootDir -Filter *.jpg | Where-Object { $_.Name -notmatch '^\.' }
$totalOrig = 0
$totalThumb = 0
$count = 0

Write-Host "🎨 Начинаем генерацию миниатюр (Thumbnails)..." -ForegroundColor Cyan

foreach ($file in $files) {
    $srcPath = $file.FullName
    $destPath = Join-Path $thumbsDir $file.Name

    try {
        $img = [System.Drawing.Image]::FromFile($srcPath)
        $maxDim = 1200
        $scale = [Math]::Min($maxDim / $img.Width, $maxDim / $img.Height)
        if ($scale -gt 1) { $scale = 1 }

        $newW = [int][Math]::Round($img.Width * $scale)
        $newH = [int][Math]::Round($img.Height * $scale)

        $thumb = New-Object System.Drawing.Bitmap $newW, $newH
        $g = [System.Drawing.Graphics]::FromImage($thumb)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

        $g.DrawImage($img, 0, 0, $newW, $newH)

        $thumb.Save($destPath, $codec, $encoderParams)

        $g.Dispose()
        $thumb.Dispose()
        $img.Dispose()

        $origLen = $file.Length
        $thumbLen = (Get-Item $destPath).Length
        $totalOrig += $origLen
        $totalThumb += $thumbLen
        $count++

        $ratio = [Math]::Round(($thumbLen / $origLen) * 100, 1)
        Write-Host " [$count/$($files.Count)] $($file.Name): $([Math]::Round($origLen/1KB)) KB -> $([Math]::Round($thumbLen/1KB)) KB ($ratio%)" -ForegroundColor Green
    }
    catch {
        Write-Host " [!] Ошибка обработки $($file.Name): $_" -ForegroundColor Red
    }
}

$origMB = [Math]::Round($totalOrig / 1MB, 2)
$thumbMB = [Math]::Round($totalThumb / 1MB, 2)
$savings = [Math]::Round((1 - ($totalThumb / $totalOrig)) * 100, 1)

Write-Host ""
Write-Host "══════════════════════════════════════════════════════════════" -ForegroundColor Yellow
Write-Host "✅ Генерация завершена успешно!" -ForegroundColor Yellow
Write-Host "   Обработано файлов: $count"
Write-Host "   Исходный размер:   $origMB МБ"
Write-Host "   Размер превью:     $thumbMB МБ"
Write-Host "   Экономия трафика:  $savings% (быстрее в $([Math]::Round($origMB / $thumbMB, 1)) раз)"
Write-Host "══════════════════════════════════════════════════════════════" -ForegroundColor Yellow
