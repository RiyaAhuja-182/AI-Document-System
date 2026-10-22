import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { DocumentCreatorService } from '@/lib/documents/document-creator'
import { DocumentCreationRequest } from '@/types/document-processing'
import {
  createDocumentSchema,
  folderBelongsToOrganization,
  getDraftDocumentState,
  getCreatedDocumentFileMetadata,
  normalizeFolderId,
} from '@/lib/documents/create-document-contract'

export { createDocumentSchema }

/**
 * @swagger
 * /api/v1/documents/create:
 *   post:
 *     summary: Create a new document from scratch or template
 *     description: |
 *       Create documents from scratch or using predefined templates.
 *       Supports government contracting document types with intelligent content generation.
 *       Documents are created as editable and can be enhanced with AI analysis.
 *     tags:
 *       - Documents
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - type
 *               - organizationId
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 255
 *                 description: Document name
 *                 example: "Government Contract Proposal - Phase 1"
 *               type:
 *                 type: string
 *                 enum: [PROPOSAL, CONTRACT, CERTIFICATION, COMPLIANCE, TEMPLATE, OTHER, SOLICITATION, AMENDMENT, CAPABILITY_STATEMENT, PAST_PERFORMANCE]
 *                 description: Document type for template selection
 *                 example: "PROPOSAL"
 *               content:
 *                 type: string
 *                 description: Initial document content (Markdown/HTML)
 *                 example: "# Project Overview\\n\\nThis document outlines..."
 *               organizationId:
 *                 type: string
 *                 description: Organization identifier
 *                 example: "org_456def"
 *               folderId:
 *                 type: string
 *                 nullable: true
 *                 description: Folder ID to place the document in (null for root folder)
 *                 example: "folder_123"
 *               templateId:
 *                 type: string
 *                 description: Template ID for initial content
 *                 example: "gov-proposal-template"
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["government", "proposal", "phase-1"]
 *               urgencyLevel:
 *                 type: string
 *                 enum: [low, medium, high, critical]
 *                 default: medium
 *               complexityScore:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 10
 *                 default: 5
 *     responses:
 *       201:
 *         description: Document created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   description: Generated document ID
 *                 name:
 *                   type: string
 *                   description: Document name
 *                 type:
 *                   type: string
 *                   description: Document type
 *                 content:
 *                   type: string
 *                   description: Initial content
 *                 isEditable:
 *                   type: boolean
 *                   description: Whether document can be edited
 *                   example: true
 *                 status:
 *                   type: string
 *                   example: "draft"
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 metadata:
 *                   type: object
 *                   description: Document metadata and AI properties
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied to organization
 *       500:
 *         description: Document creation failed
 *   get:
 *     summary: Get available document templates
 *     description: Retrieve list of available document templates for creation
 *     tags:
 *       - Documents
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Templates retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 templates:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       description:
 *                         type: string
 *                       type:
 *                         type: string
 *                       complexity:
 *                         type: number
 *                       tags:
 *                         type: array
 *                         items:
 *                           type: string
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    
    const validation = createDocumentSchema.safeParse(body)
    
    if (!validation.success) {
      console.error('❌ Validation failed:', validation.error.format())
      return NextResponse.json(
        { 
          error: 'Invalid request data', 
          details: validation.error.format()
        },
        { status: 400 }
      )
    }

    const { name, type, content, organizationId, folderId, templateId, tags, urgencyLevel, complexityScore, format } = validation.data
    const fileMetadata = getCreatedDocumentFileMetadata(name, format)

    // Verify user access to organization
    const userOrg = await prisma.user.findFirst({
      where: {
        clerkId: userId,
        organizationId
      }
    })

    if (!userOrg) {
      return NextResponse.json(
        { error: 'Access denied to organization' },
        { status: 403 }
      )
    }

    const normalizedFolderId = normalizeFolderId(folderId)

    if (normalizedFolderId) {
      const folder = await prisma.folder.findFirst({
        where: {
          id: normalizedFolderId,
          organizationId,
        },
        select: { id: true, organizationId: true },
      })

      if (!folder || !folderBelongsToOrganization(folder, organizationId)) {
        return NextResponse.json(
          { error: 'Folder not found or does not belong to this organization' },
          { status: 404 }
        )
      }
    }

    // Create document creation request
    const creationRequest = DocumentCreationRequest.parse({
      name,
      type,
      content,
      organizationId,
      createdBy: userOrg.id, // Use internal user ID, not Clerk ID
      tags: tags || [],
      urgencyLevel: urgencyLevel || 'medium',
      complexityScore: complexityScore || 5,
      isEditable: true
    })

    // Initialize document creator service
    const creatorService = DocumentCreatorService.getInstance()

    // Create document using the service
    const document = await creatorService.createDocument(creationRequest, {
      templateId,
      autoSave: true,
      generateInitialContent: false
    })

    // Enhance aiData with urgencyLevel and complexityScore (no metadata wrapper)
    const enhancedAiData = {
      ...document.aiData,
      urgencyLevel: urgencyLevel || 'medium',
      complexityScore: complexityScore || 5
    }

    const extractedText = content.trim()
      ? document.aiData?.content?.extractedText || content
      : ''
    const summary = extractedText
      ? document.aiData?.content?.summary || ''
      : ''
    const draftState = getDraftDocumentState(extractedText, summary)
    const initialSections = extractedText
      ? [{ title: 'Document Content', content: extractedText, pageNumber: 1 }]
      : []
    const documentSize = typeof document.size === 'number'
      ? document.size
      : parseInt(document.size.replace(/[^0-9]/g, '') || '0')

    // Save to database - following the same pattern as the update route
    const savedDocument = await prisma.document.create({
      data: {
        id: document.id,
        organizationId,
        uploadedById: userOrg.id, // Use internal user ID, not Clerk ID
        folderId: normalizedFolderId,
        name: fileMetadata.name,
        uploadDate: new Date(),
        lastModified: new Date(),
        size: documentSize,
        filePath: document.filePath,
        mimeType: fileMetadata.mimeType,
        extractedText: draftState.extractedText || null,
        workflowStatus: draftState.workflowStatus,
        tags: tags || [],
        isEditable: true,
        documentType: type,
        content: {
          extractedText: draftState.extractedText,
          summary: draftState.summary,
          sections: initialSections.length > 0 ? initialSections : document.aiData?.structure?.sections || [],
          tables: document.aiData?.structure?.tables || [],
          images: document.aiData?.structure?.images || [],
        },
        embeddings: {},
        entities: document.aiData?.analysis?.entities || [],
        sharing: {},
        revisions: {},
        processing: extractedText
          ? { ...draftState.processing, currentStatus: 'COMPLETED', progress: 100, completedAt: new Date().toISOString(), currentStep: null }
          : draftState.processing,
        analysis: {
          status: 'NOT_STARTED',
          urgencyLevel,
          complexityScore,
        },
      }
    })

    return NextResponse.json({
      id: savedDocument.id,
      name: savedDocument.name,
      type: savedDocument.documentType,
      content: savedDocument.extractedText || '',
      isEditable: true,
      status: savedDocument.workflowStatus.toLowerCase(),
      createdAt: savedDocument.createdAt,
      tags: savedDocument.tags,
      urgencyLevel: enhancedAiData.urgencyLevel || 'medium',
      complexityScore: enhancedAiData.complexityScore || 5,
      templateUsed: templateId,
      aiData: enhancedAiData
    }, { status: 201 })

  } catch (error) {
    console.error('Document creation error:', error)
    const details = error instanceof Prisma.PrismaClientKnownRequestError
      ? `Database error (${error.code})`
      : 'Unexpected server error'

    return NextResponse.json(
      { 
        error: 'Document creation failed', 
        details
      },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Initialize document creator service
    const creatorService = DocumentCreatorService.getInstance()

    // Get available templates
    const templates = await creatorService.getAvailableTemplates()

    return NextResponse.json({
      templates: templates.map(template => ({
        id: template.id,
        name: template.name,
        description: template.description,
        type: template.type,
        complexity: template.metadata.complexityScore,
        urgencyLevel: template.metadata.urgencyLevel,
        tags: template.metadata.tags,
        preview: template.content.substring(0, 200) + (template.content.length > 200 ? '...' : '')
      }))
    })

  } catch (error) {
    console.error('Template retrieval error:', error)
    return NextResponse.json(
      { error: 'Failed to retrieve templates' },
      { status: 500 }
    )
  }
}
