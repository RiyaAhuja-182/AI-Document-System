import {
  Document as DocxDocument,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from 'docx'

export function getExportBaseName(filename: string): string {
  const withoutExtension = filename.replace(/\.[^/.]+$/, '')
  return withoutExtension.trim() || 'document'
}

const headingLevels: Record<string, HeadingLevel> = {
  H1: HeadingLevel.HEADING_1,
  H2: HeadingLevel.HEADING_2,
  H3: HeadingLevel.HEADING_3,
  H4: HeadingLevel.HEADING_4,
  H5: HeadingLevel.HEADING_5,
  H6: HeadingLevel.HEADING_6,
}

function createTextRuns(node: Node, bold = false, italics = false): TextRun[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent || ''
    return text ? [new TextRun({ text, bold, italics })] : []
  }

  if (!(node instanceof Element)) return []

  const nextBold = bold || node.tagName === 'STRONG' || node.tagName === 'B'
  const nextItalics = italics || node.tagName === 'EM' || node.tagName === 'I'

  return Array.from(node.childNodes).flatMap(child =>
    createTextRuns(child, nextBold, nextItalics)
  )
}

function createDocxParagraphs(root: ParentNode): Paragraph[] {
  return Array.from(root.children).flatMap(element => {
    const tagName = element.tagName.toUpperCase()

    if (tagName === 'UL' || tagName === 'OL') {
      return Array.from(element.children)
        .filter(child => child.tagName.toUpperCase() === 'LI')
        .map(child => new Paragraph({
          bullet: { level: 0 },
          children: createTextRuns(child),
          spacing: { after: 120 },
        }))
    }

    if (tagName === 'TABLE') {
      return Array.from(element.querySelectorAll('tr')).map(row =>
        new Paragraph({
          children: [new TextRun({ text: Array.from(row.children).map(cell => cell.textContent?.trim() || '').join(' | ') })],
          spacing: { after: 120 },
        })
      )
    }

    const textRuns = createTextRuns(element)
    if (textRuns.length === 0) return []

    return [new Paragraph({
      heading: headingLevels[tagName],
      children: textRuns,
      spacing: { after: 160 },
    })]
  })
}

export async function createDocxBlob(title: string, content: string): Promise<Blob> {
  const parsedContent = new DOMParser().parseFromString(content, 'text/html')
  const paragraphs = createDocxParagraphs(parsedContent.body)
  const document = new DocxDocument({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          heading: HeadingLevel.TITLE,
          children: [new TextRun({ text: title, bold: true })],
          spacing: { after: 240 },
        }),
        ...paragraphs,
      ],
    }],
  })

  return Packer.toBlob(document)
}

export function createWordExportHtml(title: string, content: string): string {
  const escapedTitle = title.replace(/[&<>"']/g, character => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }
    return entities[character]
  })

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" lang="en">
  <head>
    <meta charset="utf-8">
    <title>${escapedTitle}</title>
    <style>
      body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; }
      h1, h2, h3 { color: #111827; }
      p { line-height: 1.5; }
    </style>
  </head>
  <body>${content}</body>
</html>`
}
