// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  IEditorServices
} from '@jupyterlab/codeeditor';

import {
  MonacoCodeEditorFactory
} from './factory';

import {
  MonacoMimeTypeService
} from './mimetype';

export * from './language';
export * from './editor';
export * from './factory';
export * from './mimetype';
export * from './kernel';

/**
 * The default editor services.
 */
export
const editorServices: IEditorServices = {
  factoryService: new MonacoCodeEditorFactory(),
  mimeTypeService: new MonacoMimeTypeService()
};
