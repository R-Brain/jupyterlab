// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  IDisposable, DisposableDelegate
} from '@phosphor/disposable';

import {
  Signal
} from '@phosphor/signaling';

import {
  ElementExt
} from '@phosphor/domutils';

import {
  ArrayExt
} from '@phosphor/algorithm';

import {
  IObservableString, ObservableString, IChangedArgs
} from '@jupyterlab/coreutils';

import {
  CodeEditor
} from '@jupyterlab/codeeditor';

import {
  findMimeTypeForLanguageId, findLanguageIdForMimeType
} from './language';

/**
 * Monaco code editor.
 */
export
class MonacoCodeEditor implements CodeEditor.IEditor {

  /**
   * Id of the editor.
   */
  readonly uuid: string;

  /**
   * The selection style of this editor.
   */
  readonly selectionStyle: CodeEditor.ISelectionStyle;

  /**
   * Whether an editor should be auto resized on a content change.
   *
   * #### Fixme
   * remove when https://github.com/Microsoft/monaco-editor/issues/103 is resolved
   */
  autoSizing?: boolean;

  /**
   * A minimal height of an editor.
   *
   * #### Fixme
   * remove when https://github.com/Microsoft/monaco-editor/issues/103 is resolved
   */
  minHeight?: number;

  /**
   * A signal emitted when either the top or bottom edge is requested.
   */
  readonly edgeRequested = new Signal<this, CodeEditor.EdgeLocation>(this);

  /**
   * The DOM node that hosts the editor.
   */
  readonly host: HTMLElement;

  /**
   * Construct a Monaco editor.
   */
  constructor(options: MonacoCodeEditor.IOptions) {
    const host = this.host = options.host;
    const model = this._model = options.model;
    this.uuid = options.uuid;
    this.selectionStyle = options.selectionStyle;

    let editorOptions = options.editorOptions || {};
    this.autoSizing = editorOptions.autoSizing || false;
    this.minHeight = editorOptions.minHeight || -1;

    editorOptions.value = model.value.text;
    editorOptions.language = findLanguageIdForMimeType(model.mimeType);
    const editor = this._editor = monaco.editor.create(host, options.editorOptions, options.editorServices);

    if (options.lineNumbers !== undefined) {
      this.lineNumbers = options.lineNumbers;
    }
    if (options.wordWrap !== undefined) {
      this.wordWrap = options.wordWrap;
    }
    if (options.readOnly !== undefined) {
      this.readOnly = options.readOnly;
    }

    this._listeners.push(editor.onDidChangeModel(e => this._onDidChangeModel(e)));
    this._listeners.push(editor.onDidChangeConfiguration(e => this._onDidChangeConfiguration(e)));
    this._listeners.push(editor.onKeyDown(e => this._onKeyDown(e)));

    model.value.changed.connect(this._onValueChanged, this);
    model.mimeTypeChanged.connect(this._onMimeTypeChanged, this);
    this.connectMonacoModel();
  }

  /**
   * Whether the editor is disposed.
   */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /**
   * Dispose of the resources held by the widget.
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this._isDisposed = true;
    if (this.model) {
      this.model.value.changed.disconnect(this._onValueChanged, this);
      this.model.mimeTypeChanged.disconnect(this._onMimeTypeChanged, this);
    }
    this.disconnectMonacoModel();
    this._keydownHandlers.length = 0;

    while (this._listeners.length !== 0) {
      this._listeners.pop() !.dispose();
    }
    this._editor.dispose();
  }

  /**
   * Handles an editor model change event.
   */
  protected _onDidChangeModel(event: monaco.editor.IModelChangedEvent) {
    this.disconnectMonacoModel();
    this.connectMonacoModel();
  }

  /**
   * The underlying monaco editor model.
   */
  get monacoModel(): monaco.editor.IModel {
    if (this._editor && this._editor.getModel()) {
      return this._editor.getModel();
    }
    throw new Error('monaco editor model has not been initialized');
  }

  protected disconnectMonacoModel(): void {
    while (this._monacoModelListeners.length !== 0) {
      this._monacoModelListeners.pop() !.dispose();
    }
  }

  protected connectMonacoModel(): void {
    const model = this.monacoModel;
    this._monacoModelListeners.push(model.onDidChangeLanguage(event => this._onDidChangeLanguage(event)));
    this._monacoModelListeners.push(model.onDidChangeContent(event => this._onDidContentChanged(event)));
    this.updateValue();
    const mimeType = findMimeTypeForLanguageId(model.getModeId());
    this.updateMimeType(mimeType);
  }

  /**
   * Handles an editor configuration change event.
   */
  protected _onDidChangeConfiguration(event: monaco.editor.IConfigurationChangedEvent) {
    this.autoresize();
    if (this.readOnly) {
      this.hideContentWidgets();
    }
  }

  /**
   * Handles a model value change event.
   */
  protected _onValueChanged(value: IObservableString, change: ObservableString.IChangedArgs) {
    this.doHandleModelValueChanged(change);
    this.autoresize();
  }

  protected doHandleModelValueChanged(change: ObservableString.IChangedArgs) {
    if (this._changeGuard) {
      return;
    }
    this._changeGuard = true;
    const model = this.monacoModel;
    switch (change.type) {
      case 'set':
        model.setValue(change.value);
        break;
      default:
        const start = model.getPositionAt(change.start);
        const end = model.getPositionAt(change.end);
        const range = new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column);
        const text = change.value;
        model.applyEdits([{
          identifier: null!,
          range, text,
          forceMoveMarkers: true
        }]);
    }
    this._changeGuard = false;
  }

  /**
   * Handles a mime type change event.
   */
  protected _onMimeTypeChanged(sender: CodeEditor.IModel, change: IChangedArgs<string>) {
    if (this._mimeTypeChangeGuard) {
      return;
    }
    this._mimeTypeChangeGuard = true;
    const newValue = change.newValue;
    if (newValue) {
      const newLanguage = findLanguageIdForMimeType(newValue);
      monaco.editor.setModelLanguage(this.monacoModel, newLanguage);
    }
    this._mimeTypeChangeGuard = false;
  }

  /**
   * Handles a key down event.
   */
  protected _onKeyDown(event: monaco.IKeyboardEvent) {
    if (!(this._keydownHandlers.length < 1) && this.isOnKeyDownContext()) {
      const browserEvent = event.browserEvent;
      const index = ArrayExt.findFirstIndex(this._keydownHandlers, handler => handler(this, browserEvent));
      if (index !== -1) {
        event.preventDefault();
      }
    }
  }

  /**
   * Whether key down event can be propagated to `this.onKeyDown` handler.
   *
   * #### Returns
   * - if a suggest widget visible then returns `true`
   * - otherwise `false`
   */
  protected isOnKeyDownContext() {
    return !this.isSuggestWidgetVisible();
  }

  /**
   * Whether a suggest widget is visible.
   */
  protected isSuggestWidgetVisible(): boolean {
    return this.editor._contextKeyService.getContextKeyValue<boolean>('suggestWidgetVisible');
  }

  /**
   * Get the editor wrapped by the widget.
   *
   * #### Notes
   * This is a ready-only property.
   */
  get editor() {
    return this._editor;
  }

  /**
   * Brings browser focus to this editor text.
   */
  focus(): void {
    this._editor.focus();
  }

  /**
   * Test whether the editor has keyboard focus.
   */
  hasFocus(): boolean {
    return this._editor.isFocused();
  }

  /**
   * Explicitly blur the editor.
   */
  blur(): void {
    const node = this._editor.getDomNode();
    const textarea = node.querySelector('textarea') as HTMLElement;
    textarea.blur();
  }

  /**
   * Repaint editor.
   */
  refresh(): void {
    this.autoresize();
  }

  /**
   * Returns the content for the given line number.
   */
  getLine(line: number): string | undefined {
    return this.monacoModel.getLineContent(line + 1);
  }

  /**
   * Find an offset for the given position.
   */
  getOffsetAt(position: CodeEditor.IPosition): number {
    return this.monacoModel.getOffsetAt(MonacoCodeEditor.toMonacoPosition(position));
  }

  /**
   * Find a position fot the given offset.
   */
  getPositionAt(offset: number): CodeEditor.IPosition {
    return MonacoCodeEditor.toPosition(this.monacoModel.getPositionAt(offset));
  }

  /**
   * Undo one edit (if any undo events are stored).
   */
  undo(): void {
    this.monacoModel.undo();
  }

  /**
   * Redo one undone edit.
   */
  redo(): void {
    this.monacoModel.redo();
  }

  /**
   * Clear the undo history.
   */
  clearHistory(): void {
    // Reset the model state by setting the same value again
    this.monacoModel.setValue(this.monacoModel.getValue());
  }

  /**
   * Set the size of the editor in pixels.
   */
  setSize(dimension: CodeEditor.IDimension | null): void {
    this.resize(dimension);
  }

  /**
   * Reveal the given position in the editor.
   */
  revealPosition(pos: CodeEditor.IPosition): void {
    this.editor.revealPositionInCenter(MonacoCodeEditor.toMonacoPosition(pos));
  }

  /**
   * Reveal the given selection in the editor.
   */
  revealSelection(selection: CodeEditor.IRange): void {
    const range = this.toMonacoSelection(selection);
    this.editor.revealRangeInCenter(range);
  }

  /**
   * Get the window coordinates given a cursor position.
   */
  getCoordinateForPosition(position: CodeEditor.IPosition): CodeEditor.ICoordinate {
    const monacoPosition = MonacoCodeEditor.toMonacoPosition(position);
    const { left, top, height } = this._editor.getScrolledVisiblePosition(monacoPosition);
    const right = left;
    const bottom = top - height;
    const width = right - left;
    return { left, right, top, bottom, height, width };
  }

  /**
   * Get the cursor position given window coordinates.
   *
   * @param coordinate - The desired coordinate.
   *
   * @returns The position of the coordinates, or null if not
   *   contained in the editor.
   */
  getPositionForCoordinate(coordinate: CodeEditor.ICoordinate): CodeEditor.IPosition | null {
    const target = this.editor.getTargetAtClientPoint(coordinate.right, coordinate.top);
    if (!target) {
      return null;
    }
    const position = target.position;
    const line = position.lineNumber;
    const column = position.column;
    return { line, column };
  }

  /**
   * Returns the model used by this editor.
   */
  get model(): CodeEditor.IModel {
    return this._model;
  }

  /**
   * Get the number of lines in the editor.
   */
  get lineCount(): number {
    return this.monacoModel.getLineCount();
  }

  /**
   * Control the rendering of line numbers.
   */
  get lineNumbers(): boolean {
    return this.editor.getConfiguration().viewInfo.renderLineNumbers;
  }
  set lineNumbers(value: boolean) {
    this.editor.updateOptions({
      lineNumbers: value ? 'on' : 'off'
    });
  }

  /**
   * The height of a line in the editor in pixels.
   */
  get lineHeight(): number {
    return this.editor.getConfiguration().fontInfo.lineHeight;
  }

  /**
   * The widget of a character in the editor in pixels.
   */
  get charWidth(): number {
    return this.editor.getConfiguration().fontInfo.fontSize;
  }

  /**
   * Set to false for horizontal scrolling. Defaults to true.
   */
  get wordWrap(): boolean {
    return this._editor.getConfiguration().wrappingInfo.isViewportWrapping;
  }
  set wordWrap(value: boolean) {
    this.editor.updateOptions({
      wordWrap: value
    });
  }

  /**
   * Should the editor be read only.
   */
  get readOnly(): boolean {
    return this._editor.getConfiguration().readOnly;
  }

  set readOnly(readOnly: boolean) {
    this.editor.updateOptions({
      readOnly: readOnly
    });
  }

  /**
   * Hides all content widgets, e.g. the suggest widget.
   */
  protected hideContentWidgets(): void {
    this.editor.setSelection({
      startColumn: 0,
      startLineNumber: 0,
      endColumn: 0,
      endLineNumber: 0
    });
  }

  /**
   * Returns the primary position of the cursor, never `null`.
   */
  getCursorPosition(): CodeEditor.IPosition {
    return this.toValidPosition(this._editor.getPosition());
  };

  /**
   * Set the primary position of the cursor. This will remove any secondary cursors.
   */
  setCursorPosition(position: CodeEditor.IPosition): void {
    this._editor.setPosition(MonacoCodeEditor.toMonacoPosition(position));
  };

  /**
   * Returns the primary selection, never `null`.
   */
  getSelection(): CodeEditor.ITextSelection {
    return this.getSelections()[0];
  }

  /**
   * Set the primary selection. This will remove any secondary cursors.
   */
  setSelection(selection: CodeEditor.IRange): void {
    this.setSelections([selection]);
  }

  /**
   * Gets the selections for all the cursors, never `null` or empty.
   */
  getSelections(): CodeEditor.ITextSelection[] {
    const selections = this._editor.getSelections();
    if (selections.length > 0) {
      return selections.map(selection => this.toValidSelection(selection));
    }
    const position = this.getCursorPosition();
    const monacoSelection = this.toMonacoSelection({
      start: position,
      end: position
    });
    const selection = this.toValidSelection(monacoSelection);
    return [selection];
  }

  /**
   * Sets the selections for all the cursors, should not be empty.
   * Cursors will be removed or added, as necessary.
   * Passing an empty array resets a cursor position to the start of a document.
   */
  setSelections(selections: CodeEditor.IRange[]): void {
    const ranges = this.toMonacoSelections(selections);
    this._editor.setSelections(ranges);
  }

  /**
   * Converts a monaco selection to a valid editor selection.
   *
   * #### Notes
   * A valid selection belongs to the total model range.
   */
  protected toValidSelection(selection: monaco.Range): CodeEditor.ITextSelection {
    const validSelection = this._editor.getModel().validateRange(selection);
    return this.toSelection(validSelection);
  }

  /**
   * Converts a monaco selection to an editor selection.
   */
  protected toSelection(selection: monaco.Range): CodeEditor.ITextSelection {
    return {
      uuid: this.uuid,
      start: MonacoCodeEditor.toPosition(selection.getStartPosition()),
      end: MonacoCodeEditor.toPosition(selection.getEndPosition()),
      style: this.selectionStyle
    };
  }

  /**
   * Converts selections to monaco selections.
   */
  protected toMonacoSelections(selections: CodeEditor.IRange[]): monaco.Selection[] {
    if (selections.length > 0) {
      return selections.map(selection => this.toMonacoSelection(selection));
    }
    return [new monaco.Selection(0, 0, 0, 0)];
  }

  /**
   * Converts a selection to a monaco selection.
   */
  protected toMonacoSelection(range: CodeEditor.IRange): monaco.Selection {
    const start = MonacoCodeEditor.toMonacoPosition(range.start);
    const end = MonacoCodeEditor.toMonacoPosition(range.end);
    return new monaco.Selection(start.lineNumber, start.column, end.lineNumber, end.column);
  }

  /**
   * Converts a monaco position to a valida code editor position.
   *
   * #### Notes
   * A valid position belongs to the total model range.
   */
  protected toValidPosition(position: monaco.IPosition): CodeEditor.IPosition {
    const validPosition = this._editor.getModel().validatePosition(position);
    return MonacoCodeEditor.toPosition(validPosition);
  }

  /**
   * Auto resizes the editor acording to the content.
   */
  protected autoresize(): void {
    if (this.autoSizing) {
      this.resize(null);
    }
  }

  /**
   * Resizes the editor to the given dimension or to the content if the given dimension is `null`.
   */
  protected resize(dimension: monaco.editor.IDimension |  null): void {
    const hostNode = this.getHostNode();
    if (hostNode) {
      const layoutSize = this.computeLayoutSize(hostNode, dimension);
      this.editor.layout(layoutSize);
    }
  }

  /**
   * Computes a layout site for the given dimensions.
   */
  protected computeLayoutSize(hostNode: HTMLElement, dimension: monaco.editor.IDimension |  null): monaco.editor.IDimension {
    if (dimension && dimension.width >= 0 && dimension.height >= 0) {
      return dimension;
    }
    const boxSizing = ElementExt.boxSizing(hostNode);

    const width = (!dimension || dimension.width < 0) ?
      this.getWidth(hostNode, boxSizing) :
      dimension.width;

    const height = (!dimension || dimension.height < 0) ?
      this.getHeight(hostNode, boxSizing) :
      dimension.height;

    return { width, height };
  }

  /**
   * Returns a dom node containing this editor.
   */
  protected getHostNode(): HTMLElement | undefined {
    const domNode = this._editor.getDomNode();
    return domNode ? domNode.parentElement : undefined;
  }

  /**
   * Computes a width based on the given box sizing.
   */
  protected getWidth(hostNode: HTMLElement, boxSizing: ElementExt.IBoxSizing): number {
    return hostNode.offsetWidth - boxSizing.horizontalSum;
  }

  /**
   * Computes a height based on the given box sizing.
   *
   * #### Notes
   * if auto sizing is enabled then computes a height based on the content size.
   */
  protected getHeight(hostNode: HTMLElement, boxSizing: ElementExt.IBoxSizing): number {
    if (!this.autoSizing) {
      return hostNode.offsetHeight - boxSizing.verticalSum;
    }
    const configuration = this.editor.getConfiguration();

    const lineHeight = configuration.lineHeight;
    const lineCount = this.lineCount;
    const contentHeight = lineHeight * lineCount;

    const horizontalScrollbarHeight = configuration.layoutInfo.horizontalScrollbarHeight;

    const editorHeight = contentHeight + horizontalScrollbarHeight;
    if (this.minHeight < 0) {
      return editorHeight;
    }
    const defaultHeight = lineHeight * this.minHeight + horizontalScrollbarHeight;
    return Math.max(defaultHeight, editorHeight);
  }

  /**
   * Add a keydown handler to the editor.
   *
   * @param handler - A keydown handler.
   *
   * @returns A disposable that can be used to remove the handler.
   */
  addKeydownHandler(handler: CodeEditor.KeydownHandler): IDisposable {
    this._keydownHandlers.push(handler);
    return new DisposableDelegate(() => {
      ArrayExt.removeAllWhere(this._keydownHandlers, val => val === handler);
    });
  }

  /**
   * Handles a model language change event.
   */
  protected _onDidChangeLanguage(event: monaco.editor.IModelLanguageChangedEvent) {
    const mimeType = findMimeTypeForLanguageId(event.newLanguage);
    this.updateMimeType(mimeType);
  }

  /**
   * Handles a content change event.
   */
  protected _onDidContentChanged(event: monaco.editor.IModelContentChangedEvent2) {
    this.updateValue();
  }

  /**
   * Update a value with a monaco editor model's value.
   */
  protected updateValue(): void {
    if (this._changeGuard) {
      return;
    }
    this._changeGuard = true;
    this.model.value.text = this.monacoModel.getValue();
    this._changeGuard = false;
  }

  /**
   * Update a mime type with a monaco editor model's mime type.
   */
  protected updateMimeType(mimeType: string): void {
    if (this._mimeTypeChangeGuard) {
      return;
    }
    this._mimeTypeChangeGuard = true;
    this.model.mimeType = mimeType;
    this._mimeTypeChangeGuard = false;
  }

  protected _isDisposed = false;
  protected _model: CodeEditor.IModel;
  protected _monacoModelListeners: monaco.IDisposable[] = [];
  protected _changeGuard = false;
  protected _mimeTypeChangeGuard = false;
  protected _listeners: monaco.IDisposable[] = [];
  protected _editor: monaco.editor.IStandaloneCodeEditor;
  protected _keydownHandlers = new Array<CodeEditor.KeydownHandler>();

}

/**
 * A namespace for `MonacoCodeEditor`.
 */
export
namespace MonacoCodeEditor {
  /**
   * An extension to default monaco editor options.
   */
  export
    interface IEditorConstructionOptions extends monaco.editor.IEditorConstructionOptions {
    /**
     * Whether an editor should be auto resized on a content change.
     *
     * #### Fixme
     * remove when https://github.com/Microsoft/monaco-editor/issues/103 is resolved
     */
    autoSizing?: boolean;
    /**
     * A minimal height of an editor.
     *
     * #### Fixme
     * remove when https://github.com/Microsoft/monaco-editor/issues/103 is resolved
     */
    minHeight?: number;
  }
  /**
   * An initialization options for a monaco code editor.
   */
  export
    interface IOptions extends CodeEditor.IOptions {
    /**
     * Monaco editor options.
     */
    editorOptions?: IEditorConstructionOptions;
    /**
     * Monaco editor services.
     */
    editorServices?: monaco.editor.IEditorOverrideServices;
  }
  /**
   * Converts a code editor position to a monaco position.
   */
  export
    function toMonacoPosition(position: CodeEditor.IPosition): monaco.IPosition {
    return {
      lineNumber: position.line + 1,
      column: position.column + 1
    };
  }
  /**
   * Converts a monaco position to a code editor position.
   */
  export
    function toPosition(position: monaco.Position): CodeEditor.IPosition {
    return {
      line: position.lineNumber - 1,
      column: position.column - 1
    };
  }
}
