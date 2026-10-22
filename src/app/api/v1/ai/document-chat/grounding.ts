export interface GroundedDocument {
  id: string;
  name: string;
  extractedText: string;
  mimeType: string;
}

export function buildGroundedPrompt(documents: GroundedDocument[]): string {
  const context = documents
    .map((document) => `Document: ${document.name}\nType: ${document.mimeType}\n\nContent:\n${document.extractedText}`)
    .join('\n\n---\n\n');

  return `You answer questions using only the document content below. Do not use web search or outside knowledge. If the answer is not explicitly present, say: "That information was not found in the document." Cite the filename when answering. Preserve exact numerical values.\n\n${context}`;
}
