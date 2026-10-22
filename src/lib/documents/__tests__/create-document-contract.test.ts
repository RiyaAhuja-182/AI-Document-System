import {
  createDocumentSchema,
  getCreatedDocumentFileMetadata,
  folderBelongsToOrganization,
  getDraftDocumentState,
  normalizeFolderId,
} from '../create-document-contract'

describe('document creation contract', () => {
  it('accepts a blank editable document request and keeps its draft state empty', () => {
    const request = createDocumentSchema.parse({
      name: 'Untitled document',
      type: 'OTHER',
      organizationId: 'org-1',
    })
    const state = getDraftDocumentState(request.content, '')

    expect(request.content).toBe('')
    expect(request.format).toBe('markdown')
    expect(state.extractedText).toBe('')
    expect(state.summary).toBe('')
    expect(state.workflowStatus).toBe('DRAFT')
    expect(state.processing.status).toBe('DRAFT')
    expect(state.processing.progress).toBe(0)
  })

  it('preserves content for a document created from text or a template', () => {
    const request = createDocumentSchema.parse({
      name: 'Proposal',
      type: 'PROPOSAL',
      content: '# Overview',
      organizationId: 'org-1',
    })
    const state = getDraftDocumentState(request.content, 'Overview')

    expect(state.extractedText).toBe('# Overview')
    expect(state.summary).toBe('Overview')
    expect(state.workflowStatus).toBe('DRAFT')
  })

  it('rejects missing required fields', () => {
    expect(() => createDocumentSchema.parse({})).toThrow()
    expect(() => createDocumentSchema.parse({
      name: 'Missing organization',
      type: 'OTHER',
    })).toThrow()
  })

  it('selects a generated file name and MIME type without changing the title', () => {
    expect(getCreatedDocumentFileMetadata('Proposal', 'docx')).toEqual({
      name: 'Proposal.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      extension: '.docx',
    })
    expect(getCreatedDocumentFileMetadata('Brief.pdf', 'pdf').name).toBe('Brief.pdf')
  })

  it('normalizes root-folder values and rejects folders from another organization', () => {
    expect(normalizeFolderId('null')).toBeNull()
    expect(normalizeFolderId('')).toBeNull()
    expect(normalizeFolderId('folder-1')).toBe('folder-1')
    expect(folderBelongsToOrganization({ organizationId: 'org-1' }, 'org-1')).toBe(true)
    expect(folderBelongsToOrganization({ organizationId: 'org-2' }, 'org-1')).toBe(false)
    expect(folderBelongsToOrganization(null, 'org-1')).toBe(false)
  })
})
