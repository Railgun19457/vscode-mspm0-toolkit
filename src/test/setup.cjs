const Module = require('module');
const path = require('path');
const mockPath = path.resolve(__dirname, 'mocks/vscode.js');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') {
    return require(mockPath);
  }
  return originalLoad(request, parent, isMain);
};
