import {
  Document as DocxDocument,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from 'docx'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

export const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
export const PDF_MIME_TYPE = 'application/pdf'

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

export function documentContentToPlainText(content: string): string {
  return decodeHtmlEntities(
    content
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>|<\/div>|<\/h[1-6]>|<\/li>/gi, '\n')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function createGeneratedText(
  extractedText: string | null | undefined,
  content: unknown
): string {
  if (extractedText?.trim()) return extractedText.trim()

  if (content && typeof content === 'object') {
    const contentData = content as {
      extractedText?: unknown
      sections?: Array<{ title?: unknown; content?: unknown }>
    }
    if (typeof contentData.extractedText === 'string' && contentData.extractedText.trim()) {
      return contentData.extractedText.trim()
    }
    if (Array.isArray(contentData.sections)) {
      return contentData.sections
        .map(section => [section.title, section.content].filter(value => typeof value === 'string').join('\n'))
        .join('\n\n')
        .trim()
    }
  }

  return ''
}

export async function generateDocxBuffer(title: string, content: string): Promise<Uint8Array> {
  const paragraphs = documentContentToPlainText(content)
    .split(/\n{2,}/)
    .map(text => new Paragraph({ children: [new TextRun({ text })], spacing: { after: 160 } }))

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

  return Packer.toBuffer(document)
}

export async function generatePdfBuffer(title: string, content: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const regularFont = await pdf.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold)
  const margin = 54
  const fontSize = 11
  const lineHeight = 16
  const pageWidth = 612
  const pageHeight = 792
  const maxWidth = pageWidth - margin * 2
  const lines = documentContentToPlainText(content)
    .split('\n')
    .flatMap(line => {
      if (!line) return ['']
      const words = line.split(/\s+/)
      const wrapped: string[] = []
      let current = ''
      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word
        if (regularFont.widthOfTextAtSize(candidate, fontSize) > maxWidth && current) {
          wrapped.push(current)
          current = word
        } else {
          current = candidate
        }
      }
      if (current) wrapped.push(current)
      return wrapped
    })

  let page = pdf.addPage([pageWidth, pageHeight])
  let y = pageHeight - margin
  page.drawText(title, { x: margin, y, size: 18, font: boldFont, color: rgb(0.1, 0.1, 0.1) })
  y -= 32

  for (const line of lines) {
    if (y < margin) {
      page = pdf.addPage([pageWidth, pageHeight])
      y = pageHeight - margin
    }
    page.drawText(line, { x: margin, y, size: fontSize, font: regularFont, color: rgb(0.1, 0.1, 0.1) })
    y -= lineHeight
  }

  return pdf.save()
}
