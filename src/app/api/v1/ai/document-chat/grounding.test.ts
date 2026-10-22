import { buildGroundedPrompt } from './grounding';

describe('document chat grounding', () => {
  const document = {
    id: 'doc-1',
    name: 'Document_Chat_Demo_Test_Document.pdf',
    mimeType: 'application/pdf',
    extractedText: 'Reference keyword: BLUE-MANGO-42. Engineering: 12 employees. Total: 23. Verification: 12345.'
  };

  it('includes the extracted document text and filename', () => {
    const prompt = buildGroundedPrompt([document]);
    expect(prompt).toContain(document.name);
    expect(prompt).toContain('BLUE-MANGO-42');
    expect(prompt).toContain('Engineering: 12 employees');
  });

  it('requires missing facts to be reported instead of invented', () => {
    expect(buildGroundedPrompt([document])).toContain('That information was not found in the document.');
  });

  it('does not add web search instructions or unrelated sources', () => {
    const prompt = buildGroundedPrompt([document]);
    expect(prompt).toContain('Do not use web search or outside knowledge.');
    expect(prompt).not.toContain('Search the web');
  });
});
