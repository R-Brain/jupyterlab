// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  ContentsManager, Kernel, ISession, Session, utils
} from 'jupyter-js-services';

import {
  find
} from 'phosphor/lib/algorithm/searching';

import {
  JSONObject
} from 'phosphor/lib/algorithm/json';

import {
  FocusTracker
} from 'phosphor/lib/ui/focustracker';

import {
  Menu
} from 'phosphor/lib/ui/menu';

import {
  JupyterLab, JupyterLabPlugin
} from '../application';

import {
  ICommandPalette
} from '../commandpalette';

import {
  dateTime
} from '../common/dates';

import {
  selectKernel
} from '../docregistry';

import {
  IPathTracker
} from '../filebrowser';

import {
  IInspector
} from '../inspector';

import {
  IMainMenu
} from '../mainmenu';

import {
  IRenderMime
} from '../rendermime';

import {
  IServiceManager
} from '../services';

import {
  IConsoleTracker, ConsolePanel, ConsoleContent
} from './index';


/**
 * The console widget tracker provider.
 */
export
const consoleTrackerProvider: JupyterLabPlugin<IConsoleTracker> = {
  id: 'jupyter.services.console-tracker',
  provides: IConsoleTracker,
  requires: [
    IServiceManager,
    IRenderMime,
    IMainMenu,
    IInspector,
    ICommandPalette,
    IPathTracker,
    ConsoleContent.IRenderer
  ],
  activate: activateConsole,
  autoStart: true
};


/**
 * The class name for all main area landscape tab icons.
 */
const LANDSCAPE_ICON_CLASS = 'jp-MainAreaLandscapeIcon';

/**
 * The class name for the console icon from the default theme.
 */
const CONSOLE_ICON_CLASS = 'jp-ImageConsole';

/**
 * A regex for console names.
 */
const CONSOLE_REGEX = /^console-(\d)+-[0-9a-f]+$/;


/**
 * The interface for a start console.
 */
interface ICreateConsoleArgs extends JSONObject {
  id?: string;
  path?: string;
  kernel?: Kernel.IModel;
  preferredLanguage?: string;
}


/**
 * Activate the console extension.
 */
function activateConsole(app: JupyterLab, services: IServiceManager, rendermime: IRenderMime, mainMenu: IMainMenu, inspector: IInspector, palette: ICommandPalette, pathTracker: IPathTracker, renderer: ConsoleContent.IRenderer): IConsoleTracker {
  let tracker = new FocusTracker<ConsolePanel>();
  let manager = services.sessions;
  let { commands, keymap } = app;
  let category = 'Console';

  let menu = new Menu({ commands, keymap });
  menu.title.label = 'Console';

  let submenu: Menu = null;
  let command: string;

  // Set the main menu title.
  menu.title.label = 'Console';

  // Add the ability to create new consoles for each kernel.
  let specs = services.kernelspecs;
  let displayNameMap: { [key: string]: string } = Object.create(null);
  let kernelNameMap: { [key: string]: string } = Object.create(null);
  for (let kernelName in specs.kernelspecs) {
    let displayName = specs.kernelspecs[kernelName].spec.display_name;
    kernelNameMap[displayName] = kernelName;
    displayNameMap[kernelName] = displayName;
  }
  let displayNames = Object.keys(kernelNameMap).sort((a, b) => {
    return a.localeCompare(b);
  });

  // If there are available kernels, populate the "New" menu item.
  if (displayNames.length) {
    submenu = new Menu({ commands, keymap });
    submenu.title.label = 'New';
    menu.addItem({ type: 'submenu', menu: submenu });
  }

  for (let displayName of displayNames) {
    command = `console:create-${kernelNameMap[displayName]}`;
    commands.addCommand(command, {
      label: `${displayName} console`,
      execute: () => {
        let name = `${kernelNameMap[displayName]}`;
        commands.execute('console:create', { kernel: { name } });
      }
    });
    palette.addItem({ command, category });
    submenu.addItem({ command });
  }

  command = 'console:clear';
  commands.addCommand(command, {
    label: 'Clear Cells',
    execute: () => {
      if (tracker.currentWidget) {
        tracker.currentWidget.content.clear();
      }
    }
  });
  palette.addItem({ command, category });
  menu.addItem({ command });


  command = 'console:dismiss-completer';
  commands.addCommand(command, {
    execute: () => {
      if (tracker.currentWidget) {
        tracker.currentWidget.content.dismissCompleter();
      }
    }
  });


  command = 'console:run';
  commands.addCommand(command, {
    label: 'Run Cell',
    execute: () => {
      if (tracker.currentWidget) {
        tracker.currentWidget.content.execute();
      }
    }
  });
  palette.addItem({ command, category });
  menu.addItem({ command });


  command = 'console:run-forced';
  commands.addCommand(command, {
    label: 'Run Cell (forced)',
    execute: () => {
      if (tracker.currentWidget) {
        tracker.currentWidget.content.execute(true);
      }
    }
  });
  palette.addItem({ command, category });
  menu.addItem({ command });

  command = 'console:linebreak';
  commands.addCommand(command, {
    label: 'Insert Line Break',
    execute: () => {
      if (tracker.currentWidget) {
        tracker.currentWidget.content.insertLinebreak();
      }
    }
  });
  palette.addItem({ command, category });
  menu.addItem({ command });

  command = 'console:interrupt-kernel';
  commands.addCommand(command, {
    label: 'Interrupt Kernel',
    execute: () => {
      if (tracker.currentWidget) {
        let kernel = tracker.currentWidget.content.session.kernel;
        if (kernel) {
          kernel.interrupt();
        }
      }
    }
  });
  palette.addItem({ command, category });
  menu.addItem({ command });

  let count = 0;

  command = 'console:create';
  commands.addCommand(command, {
    execute: (args: ICreateConsoleArgs) => {
      args = args || {};

      let name = `Console ${++count}`;

      // If we get a session, use it.
      if (args.id) {
        return manager.connectTo(args.id).then(session => {
          name = session.path.split('/').pop();
          name = `Console ${name.match(CONSOLE_REGEX)[1]}`;
          createConsole(session);
          manager.listRunning();  // Trigger a refresh.
          return session.id;
        });
      }

      // Find the correct path for the new session.
      // Use the given path or the cwd.
      let path = args.path || pathTracker.path;
      if (ContentsManager.extname(path)) {
        path = ContentsManager.dirname(path);
      }
      path = `${path}/console-${count}-${utils.uuid()}`;

      // Get the kernel model.
      return getKernel(args).then(kernel => {
        if (!kernel) {
          return;
        }
        // Start the session.
        let options: Session.IOptions = {
          path,
          kernelName: kernel.name,
          kernelId: kernel.id
        };
        return manager.startNew(options).then(session => {
          createConsole(session);
          manager.listRunning();  // Trigger a refresh.
          return session.id;
        });
      });
    }
  });

  command = 'console:inject';
  commands.addCommand(command, {
    execute: (args: JSONObject) => {
      let id = args['id'];
      for (let i = 0; i < tracker.widgets.length; i++) {
        let widget = tracker.widgets.at(i);
        if (widget.content.session.id === id) {
          widget.content.inject(args['code'] as string);
          break;
        }
      }
    }
  });

  command = 'console:open';
  commands.addCommand(command, {
    execute: (args: JSONObject) => {
      let id = args['id'];
      let consolePanel: ConsolePanel = null;
      for (let i = 0; i < tracker.widgets.length; i++) {
        let widget = tracker.widgets.at(i);
        if (widget.content.session.id === id) {
          consolePanel = widget;
          break;
        }
      }
      if (consolePanel) {
        app.shell.activateMain(consolePanel.id);
      } else {
        app.commands.execute('console:create', { id });
      }
    }
  });

  /**
   * Get the kernel given the create args.
   */
  function getKernel(args: ICreateConsoleArgs): Promise<Kernel.IModel> {
    if (args.kernel) {
      return Promise.resolve(args.kernel);
    }
    return manager.listRunning().then((sessions: Session.IModel[]) => {
      let options = {
        name: 'New Console',
        specs,
        sessions,
        preferredLanguage: args.preferredLanguage || '',
        host: document.body
      };
      return selectKernel(options);
    });
  }

  /**
   * Create a console for a given session.
   */
  function createConsole(session: ISession): void {
    let panel = new ConsolePanel({
      session,
      rendermime: rendermime.clone(),
      renderer: renderer
    });
    count++;
    let displayName = displayNameMap[session.kernel.name];
    let label = `Console ${count}`;
    let captionOptions: Private.ICaptionOptions = {
      label, displayName,
      path: session.path,
      connected: new Date()
    };
    panel.id = `console-${session.id}`;
    panel.title.label = label;
    panel.title.caption = Private.caption(captionOptions);
    panel.title.icon = `${LANDSCAPE_ICON_CLASS} ${CONSOLE_ICON_CLASS}`;
    panel.title.closable = true;
    app.shell.addToMainArea(panel);
    // Update the caption of the tab with the last execution time.
    panel.content.executed.connect((sender, executed) => {
      captionOptions.executed = executed;
      panel.title.caption = Private.caption(captionOptions);
    });
    // Set the source of the code inspector to the current console.
    panel.activated.connect(() => {
      inspector.source = panel.content.inspectionHandler;
    });
    // Update the caption of the tab when the kernel changes.
    panel.content.session.kernelChanged.connect(() => {
      let name = panel.content.session.kernel.name;
      name = specs.kernelspecs[name].spec.display_name;
      captionOptions.displayName = name;
      captionOptions.connected = new Date();
      captionOptions.executed = null;
      panel.title.caption = Private.caption(captionOptions);
    });
    tracker.add(panel);
  }

  command = 'console:switch-kernel';
  commands.addCommand(command, {
    label: 'Switch Kernel',
    execute: () => {
      if (!tracker.currentWidget) {
        return;
      }
      let widget = tracker.currentWidget.content;
      let session = widget.session;
      let lang = '';
      if (session.kernel) {
        lang = specs.kernelspecs[session.kernel.name].spec.language;
      }
      manager.listRunning().then((sessions: Session.IModel[]) => {
        let options = {
          name: widget.parent.title.label,
          specs,
          sessions,
          preferredLanguage: lang,
          kernel: session.kernel.model,
          host: widget.parent.node
        };
        return selectKernel(options);
      }).then((kernelId: Kernel.IModel) => {
        // If the user cancels, kernelId will be void and should be ignored.
        if (kernelId) {
          session.changeKernel(kernelId);
        }
      });
    }
  });
  palette.addItem({ command, category });
  menu.addItem({ command });

  mainMenu.addMenu(menu, {rank: 50});
  return tracker;
}


/**
 * A namespace for private data.
 */
namespace Private {
  /**
   * An interface for caption options.
   */
  export
  interface ICaptionOptions {
    /**
     * The time when the console connected to the current kernel.
     */
    connected: Date;

    /**
     * The time when the console last executed its prompt.
     */
    executed?: Date;

    /**
     * The path to the file backing the console.
     *
     * #### Notes
     * Currently, the actual file does not exist, but the directory is the
     * current working directory at the time the console was opened.
     */
    path: string;

    /**
     * The label of the console (as displayed in tabs).
     */
    label: string;

    /**
     * The display name of the console's kernel.
     */
    displayName: string;
  }

  /**
   * Generate a caption for a console's title.
   */
  export
  function caption(options: ICaptionOptions): string {
    let { label, path, displayName, connected, executed } = options;
    let caption = (
      `Name: ${label}\n` +
      `Directory: ${ContentsManager.dirname(path)}\n` +
      `Kernel: ${displayName}\n` +
      `Connected: ${dateTime(connected.toISOString())}`
    );
    if (executed) {
      caption += `\nLast Execution: ${dateTime(executed.toISOString())}`;
    }
    return caption;
  }
}




