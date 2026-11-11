export interface EditableDocumentSection {
  title: string
  content: string
  pageNumber?: number | null
  sectionId?: string
}

export interface EditableDocumentContent {
  sections?: EditableDocumentSection[]
}

export function updateEditableSections(
  documentContent: EditableDocumentContent | null | undefined,
  selectedSectionId: string,
  editorContent: string,
  selectedSectionTitle = 'Document Content'
): EditableDocumentContent {
  const currentContent = documentContent || { sections: [] }
  const sections = currentContent.sections || []
  const selectedSectionKey = selectedSectionId.replace(/^section-/, '')
  const parsedSectionNumber = Number.parseInt(selectedSectionKey, 10)
  const selectedIndex = Number.isNaN(parsedSectionNumber)
    ? sections.findIndex(section => String(section.sectionId) === selectedSectionKey)
    : parsedSectionNumber - 1

  return {
    ...currentContent,
    sections: sections.length > 0
      ? sections.map((section, index) => ({
          ...section,
          sectionId: section.sectionId || String(index + 1),
          content: index === selectedIndex ? editorContent : section.content
        }))
      : [{ sectionId: selectedSectionKey || '1', title: selectedSectionTitle, content: editorContent, pageNumber: 1 }]
  }
}

export function getEditorTextStats(content: string): { characterCount: number; wordCount: number } {
  const textContent = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

  return {
    characterCount: textContent.length,
    wordCount: textContent ? textContent.split(' ').length : 0
  }
}
