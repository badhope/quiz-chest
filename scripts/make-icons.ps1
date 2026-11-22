Add-Type -AssemblyName System.Drawing

function New-Icon([int]$size, [string]$path) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

  $bg = [System.Drawing.ColorTranslator]::FromHtml('#A8442A')
  $paper = [System.Drawing.ColorTranslator]::FromHtml('#FBF3E6')
  $g.Clear($bg)

  $brush = New-Object System.Drawing.SolidBrush($paper)
  $fontFamily = New-Object System.Drawing.FontFamily('Microsoft YaHei')
  $font = New-Object System.Drawing.Font($fontFamily, [float]($size * 0.52), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $rect = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
  $g.DrawString([string][char]0x9898, $font, $brush, $rect, $format)

  $pen = New-Object System.Drawing.Pen($paper, [float]($size * 0.018))
  $margin = [float]($size * 0.14)
  $g.DrawRectangle($pen, $margin, $margin, $size - 2 * $margin, $size - 2 * $margin)

  $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

New-Icon 192 "public/icons/icon-192.png"
New-Icon 512 "public/icons/icon-512.png"
Write-Output "icons done"
