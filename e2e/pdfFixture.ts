import type { Page } from '@playwright/test'

const EXAM_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<style>
  body {
    margin: 24mm;
    font-family: "Noto Sans CJK SC", "Noto Sans SC", sans-serif;
    font-size: 12pt;
    line-height: 1.6;
    color: #111;
  }
  h1 { font-size: 16pt; margin: 0 0 8mm; }
  .q { margin: 0 0 6mm; }
  p { margin: 0; }
</style>
</head>
<body>
<h1># PDF 自测卷</h1>
<div class="q">
  <p>1. 一年有多少个月？</p>
  <p>A. 10</p>
  <p>B. 11</p>
  <p>C. 12</p>
  <p>D. 13</p>
  <p>答案：C</p>
  <p>解析：一年十二个月。</p>
</div>
<div class="q">
  <p>2. 光合作用的场所是？【填空题】</p>
  <p>答案：叶绿体|叶绿体。</p>
  <p>解析：叶绿体含有叶绿素，是光合作用的场所。</p>
</div>
</body>
</html>`

const SCAN_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<style>
  body { margin: 0; }
  img { display: block; width: 100vw; height: 100vh; object-fit: cover; }
</style>
</head>
<body>
<img alt="" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==">
</body>
</html>`

async function renderPdf(page: Page, html: string): Promise<Buffer> {
  const pdfPage = await page.context().newPage()
  try {
    await pdfPage.setContent(html, { waitUntil: 'load' })
    return await pdfPage.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', bottom: '0', left: '0', right: '0' },
    })
  } finally {
    await pdfPage.close()
  }
}

export function buildExamPdf(page: Page): Promise<Buffer> {
  return renderPdf(page, EXAM_HTML)
}

export function buildScannedPdf(page: Page): Promise<Buffer> {
  return renderPdf(page, SCAN_HTML)
}

/** 由 reportlab 的 STSong-Light CID 字体生成；不含 ToUnicode，必须依赖 cMaps 才能取字。 */
export const CID_PDF_BASE64 =
  'JVBERi0xLjMKJZOMi54gUmVwb3J0TGFiIEdlbmVyYXRlZCBQREYgZG9jdW1lbnQgaHR0cDovL3d3dy5yZXBvcnRsYWIuY29tCjEgMCBvYmoKPDwKL0YxIDIgMCBSIC9GMiAzIDAgUgo+PgplbmRvYmoKMiAwIG9iago8PAovQmFzZUZvbnQgL0hlbHZldGljYSAvRW5jb2RpbmcgL1dpbkFuc2lFbmNvZGluZyAvTmFtZSAvRjEgL1N1YnR5cGUgL1R5cGUxIC9UeXBlIC9Gb250Cj4+CmVuZG9iagozIDAgb2JqCjw8Ci9CYXNlRm9udCAvU1RTb25nLUxpZ2h0IC9EZXNjZW5kYW50Rm9udHMgWyA8PAovQmFzZUZvbnQgL1NUU29uZy1MaWdodCAvQ0lEU3lzdGVtSW5mbyA8PAovT3JkZXJpbmcgKEdCMSkgL1JlZ2lzdHJ5IChBZG9iZSkgL1N1cHBsZW1lbnQgMAo+PiAvRFcgMTAwMCAvRm9udERlc2NyaXB0b3IgPDwKL0FzY2VudCA3NTIgL0NhcEhlaWdodCA3MzcgL0Rlc2NlbnQgLTI3MSAvRmxhZ3MgNiAvRm9udEJCb3ggWyAtMjUgLTI1NCAxMDAwIDg4MCBdIC9Gb250TmFtZSAvU1RTb25nU3RkLUxpZ2h0IAogIC9JdGFsaWNBbmdsZSAwIC9MZWFkaW5nIDE0OCAvTWF4V2lkdGggMTAwMCAvTWlzc2luZ1dpZHRoIDUwMCAvU3RlbUggOTEgL1N0ZW1WIDU4IAogIC9UeXBlIC9Gb250RGVzY3JpcHRvciAvWEhlaWdodCA1NTMKPj4gL1N1YnR5cGUgL0NJREZvbnRUeXBlMCAvVHlwZSAvRm9udCAKICAvVyBbIDEgWyAyMDcgMjcwIDM0MiA0NjcgNDYyIDc5NyA3MTAgMjM5IDM3NCBdIDEwIFsgMzc0IDQyMyA2MDUgMjM4IDM3NSAyMzggMzM0IDQ2MiBdIDE4IDI2IDQ2MiAyNyAyOCAyMzggCiAgMjkgMzEgNjA1IDMyIFsgMzQ0IDc0OCA2ODQgNTYwIDY5NSA3MzkgNTYzIDUxMSA3MjkgNzkzIAogIDMxOCAzMTIgNjY2IDUyNiA4OTYgNzU4IDc3MiA1NDQgNzcyIDYyOCAKICA0NjUgNjA3IDc1MyA3MTEgOTcyIDY0NyA2MjAgNjA3IDM3NCAzMzMgCiAgMzc0IDYwNiA1MDAgMjM5IDQxNyA1MDMgNDI3IDUyOSA0MTUgMjY0IAogIDQ0NCA1MTggMjQxIDIzMCA0OTUgMjI4IDc5MyA1MjcgNTI0IF0gODEgWyA1MjQgNTA0IDMzOCAzMzYgMjc3IDUxNyA0NTAgNjUyIDQ2NiA0NTIgCiAgNDA3IDM3MCAyNTggMzcwIDYwNSBdIF0KPj4gXSAvRW5jb2RpbmcgL1VuaUdCLVVDUzItSCAvTmFtZSAvRjIgL1N1YnR5cGUgL1R5cGUwIC9UeXBlIC9Gb250Cj4+CmVuZG9iago0IDAgb2JqCjw8Ci9Db250ZW50cyA4IDAgUiAvTWVkaWFCb3ggWyAwIDAgNTk1LjI3NTYgODQxLjg4OTggXSAvUGFyZW50IDcgMCBSIC9SZXNvdXJjZXMgPDwKL0ZvbnQgMSAwIFIgL1Byb2NTZXQgWyAvUERGIC9UZXh0IC9JbWFnZUIgL0ltYWdlQyAvSW1hZ2VJIF0KPj4gL1JvdGF0ZSAwIC9UcmFucyA8PAoKPj4gCiAgL1R5cGUgL1BhZ2UKPj4KZW5kb2JqCjUgMCBvYmoKPDwKL1BhZ2VNb2RlIC9Vc2VOb25lIC9QYWdlcyA3IDAgUiAvVHlwZSAvQ2F0YWxvZwo+PgplbmRvYmoKNiAwIG9iago8PAovQXV0aG9yIChhbm9ueW1vdXMpIC9DcmVhdGlvbkRhdGUgKEQ6MjAyNjExMjYwNzM4NTYrMDgnMDAnKSAvQ3JlYXRvciAoUmVwb3J0TGFiIFBERiBMaWJyYXJ5IC0gd3d3LnJlcG9ydGxhYi5jb20pIC9LZXl3b3JkcyAoKSAvTW9kRGF0ZSAoRDoyMDI2MTEyNjA3Mzg1NiswOCcwMCcpIC9Qcm9kdWNlciAoUmVwb3J0TGFiIFBERiBMaWJyYXJ5IC0gd3d3LnJlcG9ydGxhYi5jb20pIAogIC9TdWJqZWN0ICh1bnNwZWNpZmllZCkgL1RpdGxlICh1bnRpdGxlZCkgL1RyYXBwZWQgL0ZhbHNlCj4+CmVuZG9iago3IDAgb2JqCjw8Ci9Db3VudCAxIC9LaWRzIFsgNCAwIFIgXSAvVHlwZSAvUGFnZXMKPj4KZW5kb2JqCjggMCBvYmoKPDwKL0ZpbHRlciBbIC9BU0NJSTg1RGVjb2RlIC9GbGF0ZURlY29kZSBdIC9MZW5ndGggMjI5Cj4+CnN0cmVhbQpHYXJvOzRVXStsJSM0TlVNTXRRLzlsZTlTUzQkMGZLSF5saE9AYyxcVjUiT25qMSFibiJcI1NJSGY2IzRTcUkqdVUrVDUhXmQ5L0wmSjBTWjVXNWtpPj9GTUlFPVIkUzdsWjA8TUJJJjcxS0htaCssTE5cRCsnTD89MXI8cT0lOWZvKlRxIjYtSGQpdEw1THFGQ1hYW05vWm1VWEpRdElbIU8hSTU1MzBCRUxOOSouXFtWViNMIzpuYyRYKlQlWWVVX2lgXkZSQ1dLXDhmLUNJaiNXVXJWNHBpZiRyIU48UDRRTn4+ZW5kc3RyZWFtCmVuZG9iagp4cmVmCjAgOQowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwNzMgMDAwMDAgbiAKMDAwMDAwMDExNCAwMDAwMCBuIAowMDAwMDAwMjIxIDAwMDAwIG4gCjAwMDAwMDExNTQgMDAwMDAgbiAKMDAwMDAwMTM1NyAwMDAwMCBuIAowMDAwMDAxNDI1IDAwMDAwIG4gCjAwMDAwMDE3MjEgMDAwMDAgbiAKMDAwMDAwMTc4MCAwMDAwMCBuIAp0cmFpbGVyCjw8Ci9JRCAKWzw2YTY0NTA5MmVhZDY0ZWRjYmRhNWVkN2U1ZWM5OWE0Mj48NmE2NDUwOTJlYWQ2NGVkY2JkYTVlZDdlNWVjOTlhNDI+XQolIFJlcG9ydExhYiBnZW5lcmF0ZWQgUERGIGRvY3VtZW50IC0tIGRpZ2VzdCAoaHR0cDovL3d3dy5yZXBvcnRsYWIuY29tKQoKL0luZm8gNiAwIFIKL1Jvb3QgNSAwIFIKL1NpemUgOQo+PgpzdGFydHhyZWYKMjA5OQolJUVPRgo='
