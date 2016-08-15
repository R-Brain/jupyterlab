// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  ISignal, defineSignal
} from 'phosphor/lib/core/signaling';

import {
  Widget
} from 'phosphor/lib/ui/widget';

import {
  Message
} from 'phosphor/lib/core/messaging';

import {
  IEditorView, ITextChange
} from './view';

import {
  ABCWidgetFactory, IDocumentModel
} from '../docregistry';

import {
  Menu
} from 'phosphor/lib/ui/menu';

import {
  Token
} from 'phosphor/lib/core/token';

import {
  FocusTracker
} from 'phosphor/lib/ui/focustracker';

export
interface IEditorWidget extends Widget, IEditorView {
}

export
abstract class EditorWidget extends Widget implements IEditorWidget {

  closed: ISignal<IEditorView, void>;
  contentChanged: ISignal<IEditorView, ITextChange>;

  abstract getValue(): string;
  abstract setValue(value: string): void;

  protected onCloseRequest(msg: Message): void {
    this.closed.emit(void 0);
    super.onCloseRequest(msg);
  }

}

defineSignal(EditorWidget.prototype, 'closed');
defineSignal(EditorWidget.prototype, 'contentChanged');

export
namespace EditorWidget {

  /**
   * A class that tracks editor widgets.
   */
  /* tslint:disable */
  export
  interface Tracker extends FocusTracker<EditorWidget> { }
  /* tslint:enable */

  export
  abstract class Factory extends ABCWidgetFactory<EditorWidget, IDocumentModel> {
    tracker: Tracker;
    abstract registerCommands(category?: string): void;
    abstract registerMenuItems(menu: Menu): void;
  }

  /* tslint:disable */
  export
  const IFactory = new Token<Factory>('jupyter.services.editor.factory');
  /* tslint:enable */

  /**
   * The editor tracker token.
   */
  /* tslint:disable */
  export
  const Tracker = new Token<Tracker>('jupyter.services.editor-tracker');
  /* tslint:enable */

}
