/** @jest-environment jsdom */

import '@testing-library/jest-dom'
import { fireEvent, render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as React from 'react'
import { StableEditor } from '@/components/ui/stable-editor'
import { getEditorTextStats, updateEditableSections } from './document-editor-content'

describe('scratch document editor', () => {
  function ControlledEditor({ content: initialContent = '' }: { content?: string }) {
    const [content, setContent] = React.useState(initialContent)

    return (
      <StableEditor
        content={content}
        editable
        showToolbar
        onChange={setContent}
      />
    )
  }

  function ExternalEditor({ content }: { content: string }) {
    return <StableEditor content={content} editable showToolbar={false} />
  }

  it('allows continuous typing and produces a persistable first section', async () => {
    const user = userEvent.setup()

    render(<ControlledEditor />)

    const editor = document.querySelector('[contenteditable="true"]') as HTMLElement
    await user.type(editor, 'hello world')

    expect(editor.textContent).toBe('hello world')
    expect(updateEditableSections(undefined, '1', editor.innerHTML)).toEqual({
      sections: [{ title: 'Document Content', content: editor.innerHTML, pageNumber: 1 }]
    })
    expect(getEditorTextStats(editor.innerHTML)).toEqual({ characterCount: 11, wordCount: 2 })
  })

  it('updates the generated section id used by the document viewer', () => {
    const content = updateEditableSections(
      { sections: [{ title: 'Document Content', content: 'old', pageNumber: 1 }] },
      'section-1',
      '<p>new text</p>'
    )

    expect(content.sections?.[0].content).toBe('<p>new text</p>')
  })

  it('preserves the cursor when inserting in the middle of text', async () => {
    const user = userEvent.setup()

    render(<ControlledEditor />)

    const editor = document.querySelector('[contenteditable="true"]') as HTMLElement
    await user.type(editor, 'hello')

    const textNode = editor.firstChild as Text
    const selection = window.getSelection()
    const range = document.createRange()
    range.setStart(textNode, 2)
    range.collapse(true)
    selection?.removeAllRanges()
    selection?.addRange(range)
    range.insertNode(document.createTextNode('X'))
    fireEvent.input(editor)

    expect(editor.textContent).toBe('heXllo')
  })

  it('keeps paragraphs and formatting controls usable', async () => {
    const user = userEvent.setup()

    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: jest.fn(() => true)
    })

    render(<ControlledEditor />)

    const editor = document.querySelector('[contenteditable="true"]') as HTMLElement
    await user.type(editor, 'first paragraph')
    await user.keyboard('{Enter}')
    await user.type(editor, 'second paragraph')

    expect(editor.textContent).toContain('first paragraph')
    expect(editor.textContent).toContain('second paragraph')

    await user.click(document.querySelector('[title="Bold"]') as HTMLElement)
    await user.click(document.querySelector('[title="Italic"]') as HTMLElement)
    await user.click(document.querySelector('[title="Heading 1"]') as HTMLElement)

    expect(document.execCommand).toHaveBeenCalledWith('bold')
    expect(document.execCommand).toHaveBeenCalledWith('italic')
    expect(document.execCommand).toHaveBeenCalledWith('formatBlock', false, 'h1')
  })

  it('loads new document content without carrying over the old editor state', async () => {
    const { rerender } = render(<ExternalEditor content="first document" />)
    const editor = document.querySelector('[contenteditable="true"]') as HTMLElement

    expect(editor.textContent).toBe('first document')

    rerender(<ExternalEditor content="second document" />)

    expect(editor.textContent).toBe('second document')
  })
})
