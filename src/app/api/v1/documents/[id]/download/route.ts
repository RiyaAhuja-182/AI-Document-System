import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { supabaseAdmin } from '@/lib/supabase'
import { downloadFileWithFallback } from '@/lib/storage/path-utils'
import { readFromLocal } from '@/lib/local-storage'
import {
  DOCX_MIME_TYPE,
  PDF_MIME_TYPE,
  createGeneratedText,
  generateDocxBuffer,
  generatePdfBuffer,
} from '@/lib/documents/generated-document-files'

const getSafeFilename = (filename: string): string => filename.replace(/[\r\n"]/g, '_')

/**
 * @swagger
 * /api/v1/documents/{id}/download:
 *   get:
 *     summary: Download a document file
 *     description: Downloads the actual file content for a document. Returns demo content if Supabase is not configured.
 *     tags: [Documents]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document ID to download
 *     responses:
 *       200:
 *         description: File content successfully downloaded
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *           image/*:
 *             schema:
 *               type: string
 *               format: binary
 *           text/plain:
 *             schema:
 *               type: string
 *         headers:
 *           Content-Type:
 *             description: MIME type of the file
 *             schema:
 *               type: string
 *           Content-Length:
 *             description: Size of the file in bytes
 *             schema:
 *               type: integer
 *           Content-Disposition:
 *             description: File disposition header
 *             schema:
 *               type: string
 *               example: 'inline; filename="document.pdf"'
 *       401:
 *         description: Unauthorized - user not authenticated
 *       403:
 *         description: Forbidden - user doesn't have access to this document
 *       404:
 *         description: Document not found or file path missing
 *       500:
 *         description: Internal server error or file download failed
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let currentStep = 'initialization'
  try {
    console.log('🔍 Document download request started')

    currentStep = 'parameter_resolution'
    const resolvedParams = await params
    const documentId = resolvedParams.id

    currentStep = 'authentication'
    const { userId } = await auth()

    if (!userId) {
      console.log('❌ Download request unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!documentId) {
      console.log('❌ Document ID missing from params')
      return NextResponse.json(
        { error: 'Document ID required' },
        { status: 400 }
      )
    }

    console.log('📄 Download request for document:', documentId)

    currentStep = 'user_lookup'
    // Get user info
    let user = null

    if (userId !== 'test-user-id') {
      user = await prisma.user.findUnique({
        where: { clerkId: userId },
        select: { id: true, organizationId: true },
      })
    } else {
      // TEMPORARY: Mock user for testing - REMOVE IN PRODUCTION
      console.log('⚠️ USING MOCK USER FOR TESTING - REMOVE IN PRODUCTION')
      user = {
        id: 'test-user-db-id',
        organizationId: 'cmdm7dvvy0002s820wq4kz532',
      }
    }

    if (!user) {
      console.log('❌ User not found for clerkId:', userId)
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    console.log('✅ User found:', {
      userId: user.id,
      organizationId: user.organizationId,
    })

    currentStep = 'document_lookup'
    // Get document and verify access
    let document = null
    try {
      document = await prisma.document.findUnique({
        where: { id: documentId },
        select: {
          id: true,
          organizationId: true,
          filePath: true,
          name: true,
          mimeType: true,
          size: true,
          extractedText: true, // For created documents, this contains the content
          content: true, // Document content field (JSON)
        },
      })
    } catch (dbError) {
      console.error('❌ Database query failed:', dbError)
      return NextResponse.json(
        {
          error: 'Database connection error',
          details: dbError instanceof Error ? dbError.message : 'Unknown database error',
          timestamp: new Date().toISOString(),
          failedStep: currentStep,
        },
        { status: 500 }
      )
    }

    console.log('📋 Document query result:', {
      found: !!document,
      documentId,
      hasFilePath: !!document?.filePath,
      hasExtractedText: !!document?.extractedText,
      organizationId: document?.organizationId,
    })

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Verify user has access to the document's organization
    if (document.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    console.log('📁 Document details:', {
      filePath: document.filePath,
      name: document.name,
      mimeType: document.mimeType,
      hasExtractedText: !!document.extractedText,
      isVirtualPath: document.filePath?.startsWith('/documents/'),
      fileExtension: document.name?.split('.').pop(),
      hasValidExtension: document.name?.includes('.'),
      filePathParts: document.filePath?.split('/'),
    })

    currentStep = 'content_determination'
    const requestedFormat = new URL(request.url).searchParams.get('format')
    if (requestedFormat === 'docx' || requestedFormat === 'pdf') {
      const generatedText = createGeneratedText(document.extractedText, document.content)
      if (!generatedText.trim()) {
        return NextResponse.json(
          { error: 'Document has no saved editor content to export.' },
          { status: 422 }
        )
      }

      const isPdf = requestedFormat === 'pdf'
      const fileData = isPdf
        ? await generatePdfBuffer(document.name, generatedText)
        : await generateDocxBuffer(document.name, generatedText)
      const extension = isPdf ? '.pdf' : '.docx'
      const filename = `${document.name.replace(/\.[^/.]+$/, '')}${extension}`

      return new Response(fileData, {
        headers: {
          'Content-Type': isPdf ? PDF_MIME_TYPE : DOCX_MIME_TYPE,
          'Content-Length': fileData.byteLength.toString(),
          'Content-Disposition': `attachment; filename="${getSafeFilename(filename)}"`,
          'Cache-Control': 'private, no-store',
          'X-Document-Type': 'generated',
        },
      })
    }

    // Check if this is a created document (virtual path) vs uploaded document (real file)
    const isCreatedDocument =
      document.filePath?.startsWith('/documents/') ||
      !document.filePath?.includes('.')

    console.log('🔍 Document type analysis:', {
      filePath: document.filePath,
      isCreatedDocument,
      hasExtractedText: !!document.extractedText,
      hasContent: !!document.content,
      contentType: typeof document.content,
      extractedTextLength: document.extractedText?.length || 0,
      mimeType: document.mimeType,
    })

    if (isCreatedDocument) {
      console.log('📝 This is a created document, returning content directly')

      currentStep = 'content_extraction'
      const generatedText = createGeneratedText(document.extractedText, document.content)
      let fileData: Uint8Array = new TextEncoder().encode(generatedText)
      let contentType = document.mimeType || 'text/plain'

      if (contentType === DOCX_MIME_TYPE || document.name.toLowerCase().endsWith('.docx')) {
        fileData = await generateDocxBuffer(document.name, generatedText)
        contentType = DOCX_MIME_TYPE
      } else if (contentType === PDF_MIME_TYPE || document.name.toLowerCase().endsWith('.pdf')) {
        fileData = await generatePdfBuffer(document.name, generatedText)
        contentType = PDF_MIME_TYPE
      }

      return new Response(fileData, {
        headers: {
          'Content-Type': contentType,
          'Content-Length': fileData.byteLength.toString(),
          'Content-Disposition': `inline; filename="${getSafeFilename(document.name)}"`,
          'Cache-Control': 'private, max-age=300',
          'X-Document-Type': 'created',
        },
      })
    }

    currentStep = 'supabase_setup'
    // Handle uploaded documents from Supabase Storage
    console.log('📄 This is an uploaded document, fetching from storage')
    console.log(
      '🔧 Supabase admin client status:',
      supabaseAdmin ? 'available' : 'not configured'
    )

    if (!supabaseAdmin) {
      const localFile = document.filePath ? await readFromLocal(document.filePath) : null

      if (!localFile) {
        return NextResponse.json(
          { error: 'File not found', details: 'The stored local file is unavailable.' },
          { status: 404 }
        )
      }

      return new Response(localFile, {
        headers: {
          'Content-Type': document.mimeType || 'application/octet-stream',
          'Content-Length': localFile.byteLength.toString(),
          'Content-Disposition': `inline; filename="${getSafeFilename(document.name)}"`,
          'Cache-Control': 'private, max-age=300',
        },
      })
    }

    // Check if filePath exists
    if (!document.filePath) {
      console.error('Document filePath is missing for document:', documentId)
      return NextResponse.json(
        { error: 'File path not found for document' },
        { status: 404 }
      )
    }

    currentStep = 'supabase_download'
    // Download from Supabase Storage with fallback to alternative paths
    console.log(
      '⬇️  Attempting download from Supabase storage:',
      document.filePath
    )
    
    let fileData = null
    let actualPath = document.filePath
    let downloadError = null
    
    try {
      const result = await downloadFileWithFallback(document.filePath, document.organizationId)
      fileData = result.data
      actualPath = result.actualPath
      downloadError = result.error
      
      if (actualPath !== document.filePath) {
        console.log(`📁 File found at alternative path: ${actualPath} (original: ${document.filePath})`)
      }
    } catch (supabaseError) {
      console.error('❌ Supabase storage download threw exception:', supabaseError)
      return NextResponse.json(
        {
          error: 'Storage system error',
          details: supabaseError instanceof Error ? supabaseError.message : 'Unknown storage error',
          timestamp: new Date().toISOString(),
          failedStep: currentStep,
        },
        { status: 500 }
      )
    }

    if (downloadError || !fileData) {
      console.error('❌ Supabase download failed at all attempted paths:', {
        originalPath: document.filePath,
        actualPath,
        error: downloadError
      })
      return NextResponse.json(
        {
          error: 'Failed to download file',
          details: downloadError?.message || 'File not found at any expected path',
          originalPath: document.filePath,
          attemptedPath: actualPath
        },
        { status: 404 }
      )
    }

    console.log('✅ File downloaded successfully from Supabase')

    currentStep = 'file_processing'
    
    // Validate file data before processing
    if (fileData.size === 0) {
      console.error('❌ Downloaded file is empty')
      return NextResponse.json(
        {
          error: 'Downloaded file is empty',
          details: 'File exists but contains no data',
          timestamp: new Date().toISOString(),
          failedStep: currentStep,
        },
        { status: 422 }
      )
    }

    // Convert to array buffer
    let arrayBuffer
    try {
      arrayBuffer = await fileData.arrayBuffer()
      
      // Validate array buffer
      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        throw new Error('Array buffer is empty or null')
      }
      
      console.log('✅ File processing successful:', {
        originalSize: fileData.size,
        bufferSize: arrayBuffer.byteLength,
        documentId,
        fileName: document.name
      })
      
    } catch (bufferError) {
      console.error('❌ Failed to convert file to array buffer:', bufferError)
      return NextResponse.json(
        {
          error: 'File processing error',
          details: bufferError instanceof Error ? bufferError.message : 'Unknown buffer conversion error',
          timestamp: new Date().toISOString(),
          failedStep: currentStep,
        },
        { status: 500 }
      )
    }

    // Return file with appropriate headers
    return new Response(arrayBuffer, {
      headers: {
        'Content-Type': document.mimeType || 'application/octet-stream',
        'Content-Length': arrayBuffer.byteLength.toString(),
        'Content-Disposition': `inline; filename="${getSafeFilename(document.name)}"`,
        'Cache-Control': 'private, max-age=3600', // Cache for 1 hour
      },
    })
  } catch (error) {
    console.error('🚨 Document download error:', error)
    console.error(
      '📋 Error stack:',
      error instanceof Error ? error.stack : 'No stack trace'
    )
    console.error('🎯 Failed at step:', currentStep)

    // Provide more detailed error information for debugging
    const errorDetails = {
      message: error instanceof Error ? error.message : 'Unknown error',
      name: error instanceof Error ? error.name : 'Unknown error type',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
      failedStep: currentStep,
    }

    console.error(
      '🔍 Detailed error info:',
      JSON.stringify(errorDetails, null, 2)
    )

    return NextResponse.json(
      {
        error: 'Internal server error',
        details: errorDetails.message,
        timestamp: errorDetails.timestamp,
        failedStep: currentStep,
      },
      { status: 500 }
    )
  }
}
