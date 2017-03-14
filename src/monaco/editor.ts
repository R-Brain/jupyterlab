// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  IDisposable, DisposableDelegate
} from '@phosphor/disposable';

import {
  ISignal, Signal
} from '@phosphor/signaling';

import {
  ElementExt
} from '@phosphor/domutils';

import {
  ArrayExt
} from '@phosphor/algorithm';

import {
  IObservableString, ObservableString
} from '../common/observablestring';

import {
  IChangedArgs
} from '../common/interfaces';

import {
  CodeEditor
} from '../codeeditor';

import {
  MonacoModel
} from './model';

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
    let host = this.host = options.host;
    this.uuid = options.uuid;
    this.selectionStyle = options.selectionStyle;

    this.autoSizing = (options.editorOptions && options.editorOptions.autoSizing) || false;
    this.minHeight = (options.editorOptions && options.editorOptions.minHeight) || -1;

    this._editor = monaco.editor.create(host, options.editorOptions, options.editorServices);
    this._listeners.push(this.editor.onDidChangeModel(e => this._onDidChangeModel(e)));
    this._listeners.push(this.editor.onDidChangeConfiguration(e => this._onDidChangeConfiguration(e)));
    this._listeners.push(this.editor.onKeyDown(e => this._onKeyDown(e)));

    this._model = options.monacoModel || new MonacoModel();
    this._model.value.changed.connect(this._onValueChanged, this);
    this._model.model = this._editor.getModel();
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
    this._model.dispose();
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
    this._model.model = this.editor.getModel();
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
   * Handles a value change event.
   */
  protected _onValueChanged(value: IObservableString, args: ObservableString.IChangedArgs) {
    this.autoresize();
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
   * Repaint editor.
   */
  refresh(): void {
    this.autoresize();
  }

  /**
   * Returns the content for the given line number.
   */
  getLine(line: number): string | undefined {
    return this.model.getLine(line);
  }

  /**
   * Find an offset for the given position.
   */
  getOffsetAt(position: CodeEditor.IPosition): number {
    return this.model.getOffsetAt(position);
  }

  /**
   * Find a position fot the given offset.
   */
  getPositionAt(offset: number): CodeEditor.IPosition {
    return this.model.getPositionAt(offset);
  }

  /**
   * Undo one edit (if any undo events are stored).
   */
  undo(): void {
    this.model.undo();
  }

  /**
   * Redo one undone edit.
   */
  redo(): void {
    this.model.redo();
  }

  /**
   * Clear the undo history.
   */
  clearHistory(): void {
    this.model.clearHistory();
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
    this.editor.revealPositionInCenter(MonacoModel.toMonacoPosition(pos));
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
    const monacoPosition = MonacoModel.toMonacoPosition(position);
    const { left, top, height } = this._editor.getScrolledVisiblePosition(monacoPosition);
    const right = left;
    const bottom = top - height;
    return { left, right, top, bottom };
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
   * Returns a model for this editor.
   */
  get model(): MonacoModel {
    return this._model;
  }

  /**
   * Get the number of lines in the editor.
   */
  get lineCount(): number {
    return this.model.lineCount;
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
    this._editor.setPosition(MonacoModel.toMonacoPosition(position));
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
      start: MonacoModel.toPosition(selection.getStartPosition()),
      end: MonacoModel.toPosition(selection.getEndPosition()),
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
    const start = MonacoModel.toMonacoPosition(range.start);
    const end = MonacoModel.toMonacoPosition(range.end);
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
    return MonacoModel.toPosition(validPosition);
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

  protected _isDisposed = false;
  protected _model: MonacoModel;
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
    interface IOptions {
    /**
     * The uuid of an editor.
     */
    uuid: string;
    /**
     * A selection style.
     */
    readonly selectionStyle: CodeEditor.ISelectionStyle;
    /**
     * A dom element that is used as a container for a Monaco editor.
     */
    host: HTMLElement;
    /**
     * Monaco editor options.
     */
    editorOptions?: IEditorConstructionOptions;
    /**
     * Monaco editor services.
     */
    editorServices?: monaco.editor.IEditorOverrideServices;
    /**
     * A Monaco based editor model.
     */
    monacoModel?: MonacoModel;
  }
}
