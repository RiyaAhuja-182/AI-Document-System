/** @jest-environment node */

import { NextRequest } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { downloadFileWithFallback } from '@/lib/storage/path-utils'
import { GET } from './route'

jest.mock('@clerk/nextjs/server', () => ({
  auth: jest.fn()
}))

jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    document: { findUnique: jest.fn() }
  }
}))

jest.mock('@/lib/supabase', () => ({
  supabaseAdmin: {}
}))

jest.mock('@/lib/storage/path-utils', () => ({
  downloadFileWithFallback: jest.fn()
}))

jest.mock('@/lib/local-storage', () => ({
  readFromLocal: jest.fn()
}))

const mockedAuth = jest.mocked(auth)
const mockedPrisma = jest.mocked(prisma)
const mockedDownload = jest.mocked(downloadFileWithFallback)

const request = new NextRequest('http://localhost/api/v1/documents/doc-1/download')
const documentRecord = {
  id: 'doc-1',
  organizationId: 'org-1',
  filePath: 'org-1/docs/file.pdf',
  name: 'file.pdf',
  mimeType: 'application/pdf',
  size: 4,
  extractedText: null,
  content: {}
}

describe('GET /api/v1/documents/[id]/download', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedAuth.mockResolvedValue({ userId: 'user-1' } as never)
    mockedPrisma.user.findUnique.mockResolvedValue({
      id: 'db-user-1',
      organizationId: 'org-1'
    } as never)
    mockedPrisma.document.findUnique.mockResolvedValue(documentRecord as never)
    mockedDownload.mockResolvedValue({
      data: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'application/pdf' }),
      actualPath: documentRecord.filePath
    })
  })

  it('returns the stored file with safe download headers', async () => {
    const response = await GET(request, { params: Promise.resolve({ id: 'doc-1' }) })

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/pdf')
    expect(response.headers.get('Content-Length')).toBe('4')
    expect(response.headers.get('Content-Disposition')).toBe('inline; filename="file.pdf"')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]))
  })

  it('returns 401 when the request is unauthenticated', async () => {
    mockedAuth.mockResolvedValue({ userId: null } as never)

    const response = await GET(request, { params: Promise.resolve({ id: 'doc-1' }) })

    expect(response.status).toBe(401)
    expect(mockedPrisma.document.findUnique).not.toHaveBeenCalled()
  })

  it('returns 404 when the document does not exist', async () => {
    mockedPrisma.document.findUnique.mockResolvedValue(null)

    const response = await GET(request, { params: Promise.resolve({ id: 'missing' }) })

    expect(response.status).toBe(404)
  })

  it('returns 403 when the document belongs to another organization', async () => {
    mockedPrisma.document.findUnique.mockResolvedValue({
      ...documentRecord,
      organizationId: 'org-2'
    } as never)

    const response = await GET(request, { params: Promise.resolve({ id: 'doc-1' }) })

    expect(response.status).toBe(403)
    expect(mockedDownload).not.toHaveBeenCalled()
  })

  it('returns 404 when storage cannot find the file', async () => {
    mockedDownload.mockResolvedValue({
      data: null,
      actualPath: documentRecord.filePath,
      error: new Error('Not found')
    })

    const response = await GET(request, { params: Promise.resolve({ id: 'doc-1' }) })

    expect(response.status).toBe(404)
  })
})