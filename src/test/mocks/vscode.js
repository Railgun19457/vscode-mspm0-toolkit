/**
 * Minimal vscode mock for pure unit tests.
 */
const configStore = new Map();

const vscode = {
  workspace: {
    workspaceFolders: undefined,
    getConfiguration(section) {
      return {
        get(key, defaultValue) {
          const full = section ? `${section}.${key}` : key;
          return configStore.has(full) ? configStore.get(full) : defaultValue;
        },
        update() { return Promise.resolve(); },
      };
    },
    onDidChangeConfiguration() { return { dispose() {} }; },
    onDidChangeWorkspaceFolders() { return { dispose() {} }; },
  },
  window: {
    createStatusBarItem() {
      return { text: '', tooltip: '', command: '', show() {}, dispose() {} };
    },
    createOutputChannel() {
      return { appendLine() {}, show() {}, dispose() {} };
    },
    showInformationMessage() { return Promise.resolve(undefined); },
    showErrorMessage() { return Promise.resolve(undefined); },
    showOpenDialog() { return Promise.resolve(undefined); },
    registerWebviewViewProvider() { return { dispose() {} }; },
  },
  commands: {
    registerCommand() { return { dispose() {} }; },
    executeCommand() { return Promise.resolve(undefined); },
  },
  extensions: { getExtension() { return undefined; } },
  StatusBarAlignment: { Left: 1, Right: 2 },
  ThemeColor: class { constructor(id) { this.id = id; } },
  ConfigurationTarget: { Global: 1, Workspace: 2 },
  Uri: { file(p) { return { fsPath: p, path: p }; } },
};

module.exports = vscode;
