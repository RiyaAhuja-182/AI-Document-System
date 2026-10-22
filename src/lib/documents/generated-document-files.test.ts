import { PDFDocument } from 'pdf-lib'
import { TextEncoder as NodeTextEncoder } from 'util'
import {
  createGeneratedText,
  generateDocxBuffer,
  generatePdfBuffer,
} from './generated-document-files'

Object.defineProperty(globalThis, 'TextEncoder', { value: NodeTextEncoder })

describe('generated document files', () => {
  it('uses the latest persisted content before generating files', () => {
    expect(createGeneratedText('', {
      sections: [{ title: 'Body', content: '<p>Latest saved text</p>' }],
    })).toContain('Latest saved text')
  })

  it('generates a valid DOCX package', async () => {
    const buffer = await generateDocxBuffer('Proposal', '<p>Saved text</p>')
    expect(buffer.subarray(0, 2).toString()).toBe('PK')
    expect(buffer.byteLength).toBeGreaterThan(500)
  })

  it('generates a readable PDF document', async () => {
    const buffer = await generatePdfBuffer('Proposal', 'Saved text')
    const pdf = await PDFDocument.load(buffer)
    expect(pdf.getPageCount()).toBeGreaterThan(0)
  })
})
