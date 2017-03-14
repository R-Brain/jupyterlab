// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  uuid
} from '@jupyterlab/services/lib/utils';

import {
  IEditorFactoryService, CodeEditor
} from '../codeeditor';

import {
  MonacoCodeEditor
} from './editor';

/**
 * Monaco editor factory.
 */
export
class MonacoCodeEditorFactory implements IEditorFactoryService {

  /**
   * Create a new editor for inline code.
   */
  newInlineEditor(options: CodeEditor.IOptions): CodeEditor.IEditor {
    return Private.newEditor({
      uuid: uuid(),
      host: options.host,
      selectionStyle: options.selectionStyle,
      editorOptions: {
        autoSizing: true,
        lineNumbers: 'off',
        lineNumbersMinChars: 4,
        lineDecorationsWidth: 5,
        scrollbar: {
          horizontal: 'hidden',
          vertical: 'hidden',
          horizontalScrollbarSize: 0,
          handleMouseWheel: false
        },
        contextmenu: false,
        scrollBeyondLastLine: false
      }
    }, options);
  }

  /**
   * Create a new editor for a full document.
   */
  newDocumentEditor(options: CodeEditor.IOptions): CodeEditor.IEditor {
    return Private.newEditor({
      uuid: uuid(),
      host: options.host,
      selectionStyle: options.selectionStyle,
      editorOptions: {
        wordWrap: true,
        folding: true
      }
    }, options);
  }
}

namespace Private {
  /**
   * Creates an editor and applies options.
   */
  export
  function newEditor(monacoOptions: MonacoCodeEditor.IOptions, options: CodeEditor.IOptions): CodeEditor.IEditor {
    const editor = new MonacoCodeEditor(monacoOptions);
    this.applyOptions(editor, options);
    return editor;
  }

  /**
   * Applies options.
   */
  export
  function applyOptions(editor: MonacoCodeEditor, options: CodeEditor.IOptions): void {
    if (options.lineNumbers !== undefined) {
      editor.lineNumbers = options.lineNumbers;
    }
    if (options.wordWrap !== undefined) {
      editor.wordWrap = options.wordWrap;
    }
    if (options.readOnly !== undefined) {
      editor.readOnly = options.readOnly;
    }
  }
}