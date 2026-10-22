import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { AIServiceManager } from '@/lib/ai/ai-service-manager';
import { UsageTrackingService } from '@/lib/usage-tracking';
import { buildGroundedPrompt } from './grounding';

const attachmentSchema = z.object({
  documentId: z.string().optional(), name: z.string().min(1), mimeType: z.string().min(1),
  size: z.number().optional(), processingStatus: z.enum(['processing', 'ready', 'failed']).default('ready'),
  processingError: z.string().optional(), processedText: z.string().optional()
});

const documentChatSchema = z.object({
  messages: z.array(z.object({ role: z.enum(['user', 'assistant', 'system']), content: z.string().min(1) })).min(1),
  attachments: z.array(attachmentSchema).optional(), documentId: z.string().optional(),
  documentContext: z.object({
    mode: z.enum(['all-documents', 'current-folder', 'selected-documents']), folderId: z.string().optional(),
    folderName: z.string().optional(), documentIds: z.array(z.string()).optional(), documentCount: z.number().optional()
  }).optional(),
  organizationId: z.string().min(1), model: z.string().default('nvidia/nemotron-3-super-120b-a12b:free'),
  temperature: z.number().min(0).max(2).default(0.3), maxTokens: z.number().int().min(1).max(8000).default(2000)
});

type DocumentData = { id: string; name: string; extractedText: string; summary: string | null; mimeType: string };

async function loadDocuments(organizationId: string, documentContext: z.infer<typeof documentChatSchema>['documentContext'], documentId: string | undefined): Promise<DocumentData[]> {
  const where = {
    organizationId, deletedAt: null,
    ...(documentId ? { id: documentId } : {}),
    ...(documentContext?.mode === 'current-folder' && documentContext.folderId ? { folderId: documentContext.folderId } : {}),
    ...(documentContext?.mode === 'selected-documents' && documentContext.documentIds?.length ? { id: { in: documentContext.documentIds } } : {})
  };
  const rows = await prisma.document.findMany({
    where, select: { id: true, name: true, extractedText: true, summary: true, mimeType: true }, orderBy: { updatedAt: 'desc' }, take: 20
  });
  return rows.map((row) => ({ id: row.id, name: row.name, extractedText: row.extractedText || '', summary: row.summary, mimeType: row.mimeType }));
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const parsed = documentChatSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request data', details: parsed.error.format() }, { status: 400 });
    const input = parsed.data;

    const user = await prisma.user.findFirst({ where: { clerkId: userId, organizationId: input.organizationId }, select: { id: true } });
    if (!user) return NextResponse.json({ error: 'Access denied to organization' }, { status: 403 });

    const attachments = input.attachments || [];
    const failed = attachments.find((attachment) => attachment.processingStatus === 'failed');
    if (failed) return NextResponse.json({
      success: false,
      error: `Could not process attachment "${failed.name}": ${failed.processingError || 'text extraction failed'}`,
      code: 'ATTACHMENT_PROCESSING_FAILED',
    }, { status: 422 });
    const processing = attachments.find((attachment) => attachment.processingStatus === 'processing');
    if (processing) return NextResponse.json({
      success: false,
      error: `Attachment "${processing.name}" is still processing`,
      code: 'ATTACHMENT_PROCESSING',
    }, { status: 409 });

    let documents = attachments.length > 0 ? [] : input.documentContext || input.documentId ? await loadDocuments(input.organizationId, input.documentContext, input.documentId) : [];
    if (attachments.length === 0 && (input.documentContext || input.documentId) && documents.length === 0) return NextResponse.json({
      success: false,
      error: 'No authorized documents found in the selected scope',
      code: 'DOCUMENTS_NOT_FOUND',
    }, { status: 404 });
    const unprocessed = documents.find((document) => !document.extractedText.trim());
    if (unprocessed) return NextResponse.json({
      success: false,
      error: `Document "${unprocessed.name}" is still processing or has no extracted text`,
      code: 'DOCUMENT_PROCESSING',
    }, { status: 409 });

    if (attachments.length > 0) {
      const empty = attachments.find((attachment) => !attachment.processedText?.trim());
      if (empty) return NextResponse.json({
        success: false,
        error: `Attachment "${empty.name}" has no extracted text`,
        code: 'ATTACHMENT_TEXT_MISSING',
      }, { status: 422 });
      documents = attachments.map((attachment) => ({ id: attachment.documentId || attachment.name, name: attachment.name, extractedText: attachment.processedText || '', summary: null, mimeType: attachment.mimeType }));
    }
    if (documents.length === 0) return NextResponse.json({
      success: false,
      error: 'Select a processed document before using Document Chat',
      code: 'DOCUMENT_REQUIRED',
    }, { status: 422 });

    const messages = [
      { role: 'system' as const, content: buildGroundedPrompt(documents) },
      ...input.messages.filter((message) => message.role !== 'system')
    ];
    const aiService = AIServiceManager.getInstance();
    await aiService.initialize();
    const response = await aiService.generateCompletion({
      messages, model: input.model,
      temperature: input.temperature, maxTokens: input.maxTokens,
      metadata: { provider: 'openrouter', organizationId: input.organizationId }
    });
    await UsageTrackingService.trackAIQueryUsage(input.organizationId, 'document_chat', response.usage.totalTokens);
    return NextResponse.json({ id: `msg_${Date.now()}`, role: 'assistant', content: response.content, model: response.model, usage: response.usage, metadata: { provider: response.metadata.provider, documentIds: documents.map((document) => document.id) } });
  } catch (error) {
    console.error('Document chat error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'AI provider request failed' }, { status: 502 });
  }
}
