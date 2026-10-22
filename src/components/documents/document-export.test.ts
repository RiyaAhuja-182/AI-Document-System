import { createWordExportHtml, getExportBaseName } from './document-export'

describe('document export helpers', () => {
  it('creates stable export filenames without the original extension', () => {
    expect(getExportBaseName('proposal.final.docx')).toBe('proposal.final')
    expect(getExportBaseName('')).toBe('document')
  })

  it('creates a Word-compatible document containing formatted content', () => {
    const html = createWordExportHtml('Proposal & Plan.docx', '<h1>Heading</h1><p><strong>Body</strong></p>')

    expect(html).toContain('<title>Proposal &amp; Plan.docx</title>')
    expect(html).toContain('<h1>Heading</h1>')
    expect(html).toContain('<strong>Body</strong>')
    expect(html).toContain('urn:schemas-microsoft-com:office:word')
  })
})