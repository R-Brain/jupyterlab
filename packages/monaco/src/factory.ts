// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  uuid as getUUID
} from '@jupyterlab/services/lib/utils';

import {
  IEditorFactoryService
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
  newInlineEditor(options: MonacoCodeEditor.IOptions): MonacoCodeEditor {
    const uuid = options.uuid || getUUID();
    const editorOptions: MonacoCodeEditor.IEditorConstructionOptions = {
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
        scrollBeyondLastLine: false,
        ...options.editorOptions
    };
    return this.newEditor({
      ...options,
      uuid,
      editorOptions
    });
  }

  /**
   * Create a new editor for a full document.
   */
  newDocumentEditor(options: MonacoCodeEditor.IOptions): MonacoCodeEditor {
    const uuid = options.uuid || getUUID();
    const editorOptions: MonacoCodeEditor.IEditorConstructionOptions = {
      wordWrap: true,
      folding: true,
      ...options.editorOptions
    };
    return this.newEditor({
      ...options,
      uuid,
      editorOptions
    });
  }

  protected newEditor(options: MonacoCodeEditor.IOptions): MonacoCodeEditor {
    return new MonacoCodeEditor(options);
  }
}
