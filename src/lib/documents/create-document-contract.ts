import { z } from 'zod'

export const documentCreationFormatSchema = z.enum(['markdown', 'docx', 'pdf'])
export type DocumentCreationFormat = z.infer<typeof documentCreationFormatSchema>

export const createDocumentSchema = z.object({
  name: z.string().min(1).max(255).describe('Document name'),
  type: z.enum([
    'PROPOSAL',
    'CONTRACT',
    'CERTIFICATION',
    'COMPLIANCE',
    'TEMPLATE',
    'OTHER',
    'SOLICITATION',
    'AMENDMENT',
    'CAPABILITY_STATEMENT',
    'PAST_PERFORMANCE'
  ]).describe('Document type'),
  content: z.string().default('').describe('Initial document content'),
  organizationId: z.string().min(1).describe('Organization identifier'),
  folderId: z.string().nullable().optional().describe('Folder ID to place the document in'),
  templateId: z.string().optional().describe('Template ID to use for initial content'),
  tags: z.array(z.string()).default([]).describe('Document tags'),
  urgencyLevel: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  complexityScore: z.number().min(1).max(10).default(5),
  format: documentCreationFormatSchema.default('markdown')
})

export function getCreatedDocumentFileMetadata(title: string, format: DocumentCreationFormat) {
  const extensions: Record<DocumentCreationFormat, string> = {
    markdown: '.md',
    docx: '.docx',
    pdf: '.pdf',
  }
  const mimeTypes: Record<DocumentCreationFormat, string> = {
    markdown: 'text/markdown; charset=utf-8',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    pdf: 'application/pdf',
  }
  const extension = extensions[format]
  const name = title.toLowerCase().endsWith(extension) ? title : `${title}${extension}`

  return { name, mimeType: mimeTypes[format], extension }
}

export function normalizeFolderId(folderId: string | null | undefined): string | null {
  return folderId === 'null' || folderId === '' ? null : folderId ?? null
}

export function getDraftDocumentState(extractedText: string, summary: string) {
  const hasContent = extractedText.trim().length > 0

  return {
    extractedText: hasContent ? extractedText : '',
    summary: hasContent ? summary : '',
    workflowStatus: 'DRAFT' as const,
    processing: {
      status: 'DRAFT' as const,
      progress: 0,
      events: [] as string[],
    },
  }
}

export function folderBelongsToOrganization(
  folder: { organizationId: string } | null,
  organizationId: string
): boolean {
  return folder !== null && folder.organizationId === organizationId
}
