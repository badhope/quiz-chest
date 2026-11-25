import { strFromU8, unzipSync } from 'fflate'

const MAX_DOCUMENT_XML_BYTES = 8 * 1024 * 1024

const XML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

function decodeXmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      return String.fromCodePoint(Number.parseInt(entity.slice(2), 16))
    }
    if (entity.startsWith('#')) {
      return String.fromCodePoint(Number.parseInt(entity.slice(1), 10))
    }
    return XML_ENTITIES[entity.toLowerCase()] ?? match
  })
}

/**
 * 从 .docx 的 word/document.xml 抽纯文本。
 *
 * 不引入 mammoth：导入只需要段落文本，不需要样式。表格单元格里的段落也会
 * 变成独立行，正好符合「题号 + 选项」的文本模板。只读取 document.xml，
 * 并在过滤阶段限制解压后大小，避免 zip bomb 把内存吃满。
 */
export function extractDocxText(data: ArrayBuffer): string {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(new Uint8Array(data), {
      filter: (file) => file.name === 'word/document.xml' && file.size <= MAX_DOCUMENT_XML_BYTES,
    })
  } catch (error) {
    throw new Error(`Word 文件解压失败：${error instanceof Error ? error.message : String(error)}`)
  }
  const documentXml = files['word/document.xml']
  if (!documentXml) {
    throw new Error('Word 文件里没有 word/document.xml，可能是旧版 .doc 或损坏文件。请另存为 .docx 后重试。')
  }
  const xml = strFromU8(documentXml)
  if (!xml) throw new Error('Word 正文为空')

  let text = ''
  const tokens = xml.match(/<w:t(?:\s+[^>]*)?>[\s\S]*?<\/w:t>|<w:tab[^>]*\/>|<w:br[^>]*\/>|<\/w:p>/g) ?? []
  for (const token of tokens) {
    if (token === '</w:p>') {
      text += '\n'
      continue
    }
    if (/^<w:tab/.test(token)) {
      text += '\t'
      continue
    }
    if (/^<w:br/.test(token)) {
      text += '\n'
      continue
    }
    const match = token.match(/^<w:t(?:\s+[^>]*)?>([\s\S]*?)<\/w:t>$/)
    if (match) text += decodeXmlEntities(match[1])
  }
  return text.replace(/\n{3,}/g, '\n\n').trim()
}
