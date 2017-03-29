// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  utils
} from '@jupyterlab/services';

import {
  IEditorFactoryService, CodeEditor
} from '@jupyterlab/codeeditor';

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
    const uuid = options.uuid || utils.uuid();
    return new MonacoCodeEditor({
      ...options,
      uuid,
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
    });
  }

  /**
   * Create a new editor for a full document.
   */
  newDocumentEditor(options: CodeEditor.IOptions): CodeEditor.IEditor {
    const uuid = options.uuid || utils.uuid();
    return new MonacoCodeEditor({
      ...options,
      uuid,
      editorOptions: {
        wordWrap: true,
        folding: true
      }
    });
  }
}
