// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  ICellEditorView, ICellEditorPresenter, CellEditorPresenter
} from './presenter';

import {
  DefaultCellEditorWidgetDecorator
} from './decorator';

import {
  EditorWidget
} from '../../editorWidget/widget';

export * from './presenter';

/**
 * A cell editor widget.
 */
export
interface ICellEditorWidget extends EditorWidget, ICellEditorView {
  presenter: ICellEditorPresenter;
}

/**
 * Utilities for a cell editor widget.
 */
export
namespace ICellEditorWidget {

  /**
   * A default cell editor widget initializer.
   */
  export
  const defaulEditorInitializer: (editor: ICellEditorWidget) => void=(editor)=> {
    const decorator = new DefaultCellEditorWidgetDecorator(editor);
    editor.presenter = new CellEditorPresenter(decorator);
  };

}
