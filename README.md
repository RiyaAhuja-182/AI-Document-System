# AI Document System

[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14%2B-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)


AI Document System is a full-stack document management and document-question-answering application. It combines authenticated, organization-scoped document storage with structured text extraction, document analysis, vector indexing, semantic search, and AI-generated answers.

> Portfolio project demonstrating a production-oriented Next.js application, multi-tenant data access, asynchronous document processing, and retrieval-oriented AI services.

## Project Overview

Working with contracts, proposals, certifications, compliance files, and other business documents is slow when information is distributed across large files. AI Document System provides a single workspace where users can upload and organize documents, extract usable text and structure, and ask questions using natural language.

The application separates file storage and metadata, validates organization access at the API boundary, and persists processing state so users can see whether a document is pending, processing, completed, vectorized, or failed.

## Key Features

- Clerk authentication with protected application routes.
- Organization-scoped users, documents, folders, permissions, and audit records.
- Document upload with MIME/type and size validation.
- Local filesystem storage for development, with Supabase Storage support when configured.
- Support for PDF, DOC/DOCX, PPT/PPTX, XLS/XLSX, HTML, plain text, images, archives, and media through specialized processors.
- Optional Docling-powered extraction for layout-aware content, tables, structure, and OCR-capable workflows, with traditional processor fallbacks.
- Basic document processing that extracts text, identifies sections and keywords, and calculates quality/readability scores.
- Full document analysis services for metadata, entities, content, security, contracts, and scoring.
- Document classification, tags, folders, revisions, sharing metadata, and processing history.
- Document chat with selected documents, folders, or an organization document scope.
- Grounded chat prompts that instruct the model to use only supplied document content and identify the source filename.
- Embedding generation for document chunks using OpenAI embedding models.
- Pinecone storage with organization-specific namespaces.
- Optional PostgreSQL/pgvector fallback for vector search.
- Semantic search with document filters, result caching, timeouts, and optional hybrid BM25-style keyword scoring.
- Multi-provider AI adapters and routing for OpenRouter and OpenAI, with additional provider integrations in the AI service layer.
- Inngest functions for background processing, vectorization, analysis, scoring, retries, concurrency limits, and progress events.
- Usage tracking, AI metrics, cost controls, circuit breakers, rate-limit configuration, and Stripe billing integrations.
- Responsive Next.js UI with document views, chat, settings, dashboards, dark-mode support, and a Plate-based editor.

## Technology Stack

### Frontend

- Next.js 15 App Router
- React 19 and TypeScript 5
- Tailwind CSS, Radix UI, and shadcn-style components
- Zustand and TanStack React Query
- Plate.js editor
- React Markdown, syntax highlighting, charts, drag-and-drop, and Framer Motion

### Backend

- Next.js Route Handlers and server-side services
- Zod request validation
- Prisma ORM
- Inngest background jobs
- OpenAPI/Swagger route documentation support

### Database

- PostgreSQL 14+
- Prisma schema and migrations
- Optional pgvector search fallback
- JSON fields for document content, embeddings references, entities, sharing, revisions, processing, and analysis data

### AI and LLM

- Vercel AI SDK provider abstractions
- OpenRouter with smart routing and cost-optimization settings
- OpenAI direct adapter and OpenAI `text-embedding-3-small`/`text-embedding-3-large` embedding support
- Anthropic, Google, Azure, and ImageRouter adapter/configuration support where enabled
- Pinecone dense vector indexing
- Hybrid vector plus BM25-style keyword scoring

### Authentication and Security

- Clerk authentication and organization context
- Organization-level authorization checks in API routes
- Zod validation, CSRF support, audit logging, and configurable rate limits
- Encrypted client-managed API key support

### Infrastructure and Integrations

- Supabase Storage with local-storage development fallback
- Docling FastAPI microservice for advanced document conversion
- Inngest development/server integration
- Upstash Redis and in-memory caching support
- Stripe billing and webhook integration
- Vercel-compatible Next.js deployment and Railway-compatible Docling deployment

## System Architecture

```text
Browser / Next.js UI
        |
        v
Clerk middleware + Next.js Route Handlers
        |
        +--> Prisma --> PostgreSQL
        |                  |
        |                  +--> document metadata, extracted text,
        |                       processing state, analysis, and references
        |
        +--> Supabase Storage or local storage
        |
        +--> File processing adapter
        |       +--> Docling FastAPI service (preferred when enabled)
        |       +--> PDF, Office, OCR, text, archive, and media fallbacks
        |
        +--> Inngest functions
        |       +--> basic extraction and analysis
        |       +--> chunking and embedding generation
        |       +--> Pinecone upserts and progress updates
        |
        +--> AI service manager
                +--> OpenRouter / OpenAI adapters
                +--> grounded document chat and analysis

Query path for indexed search:
query -> query embedding -> Pinecone organization namespace
       -> optional pgvector fallback -> optional hybrid scoring
       -> full chunk content loaded from PostgreSQL document embeddings
```

Every document query is scoped by `organizationId`. Embeddings are stored in organization-specific Pinecone namespaces, and vector metadata includes the source document, chunk index, document type, tags, and keywords.

## How It Works

1. A signed-in user selects an organization and uploads a supported file.
2. The upload route validates the organization, file type, and size, stores the file in Supabase or local storage, and creates a `Document` record with `PENDING` processing state.
3. Basic processing extracts text. Docling is attempted first for supported types when enabled; PDF, Office, OCR, text, archive, and media processors provide fallbacks.
4. The processor stores extracted text and structured sections in PostgreSQL, derives keywords, and records quality/readability information.
5. Optional background Inngest workflows perform deeper analysis and vectorization. Processing state and progress events are written back to the document record.
6. Vectorization chunks the extracted text, generates embeddings in batches, upserts vectors to the organization’s Pinecone namespace, and stores chunk references/content in the document’s `embeddings` JSON field.
7. A user selects a document, folder, or document set and submits a question.
8. The document-chat route authenticates the request, verifies organization access, loads only the authorized processed documents, and builds a grounded prompt from their extracted text.
9. OpenRouter generates the response. The route records token usage and returns the answer together with provider/model metadata.

## RAG Implementation

The repository contains an implemented retrieval pipeline:

1. **Text extraction:** `FileProcessingAdapter` tries Docling first when enabled, then falls back to native TypeScript processors such as `pdf-parse`, Mammoth, OCR, and text processors.
2. **Chunking:** `DocumentChunker` detects paragraph and section boundaries, preserves semantic structure, estimates tokens, applies overlap, and extracts chunk keywords. The default target is 1,500 tokens with 200-token overlap.
3. **Embedding generation:** `DocumentEmbeddingProcessor` sends chunks to `EmbeddingService`, which uses OpenAI embedding models and processes batches of up to 100 chunks.
4. **Vector storage:** `EmbeddingService` upserts dense vectors to Pinecone under an organization-specific namespace. Full chunk content and vector IDs are also persisted in PostgreSQL for later retrieval.
5. **Similarity search:** `VectorSearchService` embeds a query, queries Pinecone with organization/document filters, applies a score threshold, and loads full chunk text from PostgreSQL. It supports caching, timeout handling, optional pgvector fallback, and optional reranking.
6. **Hybrid search:** `HybridSearchService` can combine vector similarity with BM25-style keyword relevance using configurable vector and keyword weights.
7. **Response generation:** The current `/api/v1/ai/document-chat` implementation uses an explicit grounded-context path: it loads authorized extracted document text and places it in a constrained prompt before sending the request to OpenRouter. The route does not currently call `VectorSearchService` to select top-k chunks during chat.

This distinction is intentional in the documentation: the vector retrieval services are implemented and usable, while the active document-chat route currently uses full extracted-text context for its selected scope.

## Project Structure

```text
.
├── prisma/
│   ├── schema.prisma             # PostgreSQL data model and indexes
│   ├── migrations/               # Prisma migrations
│   └── seed.ts                   # Development seed data
├── services/docling-api/
│   ├── main.py                   # FastAPI Docling wrapper
│   ├── requirements.txt          # Python dependencies
│   ├── Dockerfile                # Container deployment
│   └── start.sh                  # Local service setup/start script
├── scripts/
│   └── start-inngest.sh          # Starts the local Inngest development server
├── src/app/
│   ├── api/                      # Next.js API routes
│   │   ├── v1/documents/         # Upload, CRUD, processing, and vectorization
│   │   ├── v1/ai/                # Chat, document chat, analytics, and providers
│   │   ├── v1/search/            # Similarity and hybrid search endpoints
│   │   └── inngest/              # Inngest webhook/function endpoint
│   ├── dashboard/                # Dashboard pages
│   ├── chat/                     # Chat experience
│   ├── documents/                # Document pages
│   └── middleware.ts             # Clerk route protection
├── src/components/               # UI, editor, document, and chat components
├── src/lib/
│   ├── ai/                       # Provider adapters, routing, RAG, analysis, metrics
│   ├── file-processing/          # Docling and fallback file processors
│   ├── inngest/                  # Background function definitions
│   ├── auth/, audit/, cache/     # Cross-cutting services
│   └── config/, validation/      # Environment and request validation
├── src/types/                    # Shared TypeScript domain types
├── public/                       # Static assets
├── .env.example                  # Local environment variable template
├── next.config.mjs               # Next.js, rewrites, headers, and build settings
└── package.json                  # Scripts and dependencies
```

## Installation and Setup

### Prerequisites

- Node.js 18 or newer
- npm 8 or newer
- PostgreSQL 14 or newer
- Python 3.11 or newer if using the Docling service
- Pinecone and an AI provider for vectorization/AI features
- Clerk application credentials

### Steps

1. Clone the repository:

   ```bash
   git clone https://github.com/RiyaAhuja-182/AI-Document-System.git
   cd AI-Document-System
   ```

2. Install JavaScript dependencies:

   ```bash
   npm install
   ```

3. Create a local environment file:

   ```bash
   cp .env.example .env.local
   ```

4. Replace the placeholders in `.env.local` with your PostgreSQL, Clerk, OpenRouter, Pinecone, and optional storage/service values. Do not commit `.env.local`.

5. Generate Prisma Client and apply the development schema:

   ```bash
   npm run db:generate
   npm run db:push
   ```

   Use `npm run db:migrate` instead of `db:push` when creating a migration for a shared or production database.

6. Optionally seed the database:

   ```bash
   npm run db:seed
   ```

7. If using Docling, start it separately or let the combined development command start it:

   ```bash
   cd services/docling-api
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   python main.py
   ```

   The service listens on `http://localhost:8001` by default.

## Environment Variables

Copy `.env.example` to `.env.local` and use real values only in the local environment. The values below are placeholders, not credentials.

### Required for the core application

```env
DATABASE_URL="postgresql://<user>:<password>@localhost:5432/<database>"
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_<clerk-publishable-key>"
CLERK_SECRET_KEY="sk_test_<clerk-secret-key>"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_API_URL="http://localhost:3000/api"
```

### Required for AI chat and vectorization

```env
OPENROUTER_API_KEY="<openrouter-api-key>"
OPENROUTER_APP_NAME="AI-Document-System"
OPENROUTER_SITE_URL="http://localhost:3000"
OPENAI_API_KEY="<openai-api-key>"
PINECONE_API_KEY="<pinecone-api-key>"
PINECONE_ENVIRONMENT="us-east-1"
PINECONE_INDEX_NAME="document-chat-index"
```

`OPENROUTER_API_KEY` is used by the current document-chat route. `OPENAI_API_KEY` is used for embeddings and optional direct OpenAI functionality.

### Optional storage and processing services

```env
NEXT_PUBLIC_SUPABASE_URL="https://<project>.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="<supabase-anon-key>"
SUPABASE_SERVICE_ROLE_KEY="<supabase-service-role-key>"
DOCLING_SERVICE_URL="http://localhost:8001"
DOCLING_ENABLED="true"
DOCLING_TIMEOUT="30000"
INNGEST_EVENT_KEY="<inngest-event-key>"
INNGEST_SIGNING_KEY="<inngest-signing-key>"
ENABLE_PGVECTOR_FALLBACK="true"
PGVECTOR_CONNECTION_STRING="postgresql://<user>:<password>@localhost:5432/<database>"
PGVECTOR_TABLE_NAME="embeddings"
```

Without Supabase, local development can use the repository’s local-storage fallback. Docling is optional; the application falls back to built-in processors when it is unavailable. Inngest keys are needed for a deployed Inngest integration; the local development CLI can run without production signing credentials.

### Optional integrations

```env
ANTHROPIC_API_KEY="<anthropic-api-key>"
GOOGLE_GENERATIVE_AI_API_KEY="<google-generative-ai-key>"
UPSTASH_REDIS_REST_URL="https://<redis-endpoint>"
UPSTASH_REDIS_REST_TOKEN="<redis-token>"
STRIPE_SECRET_KEY="<stripe-secret-key>"
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="<stripe-publishable-key>"
STRIPE_WEBHOOK_SECRET="<stripe-webhook-secret>"
ENCRYPTION_KEY="<application-encryption-key>"
```

The complete template, including rate limits and feature flags, is available in `.env.example`.

## Running the Application

### Run the full local development stack

```bash
npm run dev
```

This starts Next.js, the Inngest development server, and the Docling service concurrently. Next.js runs at `http://localhost:3000`, Inngest at its CLI-provided local URL, and Docling at `http://localhost:8001`.

### Run services individually

```bash
npm run dev:next
npm run dev:inngest
npm run dev:docling
```

### Quality checks and tests

```bash
npm run type-check
npm run lint
npm test
npm run test:coverage
```

### Production build

```bash
npm run build
npm run start
```

## Challenges and Solutions

### Reliable extraction across document formats

Different file types require different parsers, and scanned PDFs need OCR. The application uses a processor adapter: Docling is preferred for supported formats, while PDF, Office, OCR, text, archive, and media processors provide fallbacks when Docling is disabled or unavailable.

### Long-running document work

Extraction, analysis, and vectorization can exceed a normal request lifecycle. Inngest functions provide retry boundaries, concurrency limits, progress events, failure states, and resumable background execution.

### Tenant-safe retrieval

Documents and vectors must not cross organization boundaries. API routes validate the authenticated user’s organization, Prisma queries include organization scope, and Pinecone uses a separate namespace for each organization.

### Search latency and provider failures

External AI and vector services can be slow or temporarily unavailable. The AI and vector layers include timeouts, caching, circuit-breaker/fallback configuration, Pinecone-to-pgvector fallback support, and hybrid scoring for more useful search results.

### Preserving grounded answers

The document-chat prompt explicitly supplies document content, disallows outside knowledge, requires a clear not-found response, and asks the model to cite the filename. This keeps the current chat behavior constrained to the selected document scope.

## Future Improvements

- Connect the active document-chat route to top-k vector/hybrid retrieval instead of loading all extracted text for the selected scope.
- Add citation metadata that links each answer claim to the retrieved document chunk and source location.
- Add end-to-end tests for the upload-to-processing-to-chat workflow with external services mocked.
- Add a documented production deployment workflow for the Next.js, PostgreSQL, Pinecone, Supabase, Inngest, and Docling services.
- Add observability dashboards for document-processing latency, retrieval quality, provider failures, and per-organization AI cost.

## Author and Repository

**Author:** [Riya Ahuja](https://github.com/RiyaAhuja-182)

**GitHub:** [RiyaAhuja-182/AI-Document-System](https://github.com/RiyaAhuja-182/AI-Document-System)

