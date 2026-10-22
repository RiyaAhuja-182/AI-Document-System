export interface EditableDocumentSection {
  title: string
  content: string
  pageNumber?: number | null
  [key: string]: unknown
}

export interface EditableDocumentContent {
  sections?: EditableDocumentSection[]
  [key: string]: unknown
}

export function updateEditableSections(
  documentContent: EditableDocumentContent | null | undefined,
  selectedSectionId: string,
  editorContent: string,
  selectedSectionTitle = 'Document Content'
): EditableDocumentContent {
  const currentContent = documentContent || { sections: [] }
  const sections = currentContent.sections || []
  const selectedIndex = Number.parseInt(selectedSectionId.replace(/^section-/, ''), 10) - 1

  return {
    ...currentContent,
    sections: sections.length > 0
      ? sections.map((section, index) => ({
          ...section,
          content: index === selectedIndex ? editorContent : section.content
        }))
      : [{ title: selectedSectionTitle, content: editorContent, pageNumber: 1 }]
  }
}

export function getEditorTextStats(content: string): { characterCount: number; wordCount: number } {
  const textContent = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

  return {
    characterCount: textContent.length,
    wordCount: textContent ? textContent.split(' ').length : 0
  }
}
