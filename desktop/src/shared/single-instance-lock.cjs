/**
 * Electron client single-instance guard.
 *
 * Electron's requestSingleInstanceLock() is scoped by userData, so HanaAgent sets
 * userData from HANA_HOME before requesting the lock. Production and dev homes
 * get different namespaces, while duplicate launches within the same home are
 * redirected to the first client.
 */
const fs = require("fs");
const path = require("path");

function exitDuplicateClient(app) {
  if (typeof app.exit === "function") {
    app.exit(0);
    return;
  }
  app.quit();
}

function configureElectronStoragePaths(app, hanakoHome) {
  const electronRoot = path.join(hanakoHome, "electron");
  const paths = {
    userData: path.join(electronRoot, "user-data"),
    sessionData: path.join(electronRoot, "session-data"),
    cache: path.join(electronRoot, "cache"),
    logs: path.join(electronRoot, "logs"),
    crashDumps: path.join(electronRoot, "crash-dumps"),
  };

  for (const directory of Object.values(paths)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  // Electron requires sessionData to be set before ready. Chromium's disk
  // cache has no portable app.setPath key, so force it to the sibling cache
  // directory before Chromium initializes.
  app.setPath("userData", paths.userData);
  app.setPath("sessionData", paths.sessionData);
  app.setPath("crashDumps", paths.crashDumps);
  app.setAppLogsPath(paths.logs);
  app.commandLine.appendSwitch("disk-cache-dir", paths.cache);

  return paths;
}

function focusExistingWindow(win) {
  if (!win || win.isDestroyed?.()) return false;
  if (win.isMinimized?.()) win.restore?.();
  win.show?.();
  win.focus?.();
  return true;
}

function configureClientSingleInstance(app, opts) {
  const { hanakoHome, onSecondInstance } = opts;
  configureElectronStoragePaths(app, hanakoHome);

  const gotLock = app.requestSingleInstanceLock({ hanakoHome });
  if (!gotLock) {
    exitDuplicateClient(app);
    return false;
  }

  app.on("second-instance", () => {
    onSecondInstance?.();
  });
  return true;
}

module.exports = {
  configureElectronStoragePaths,
  configureClientSingleInstance,
  focusExistingWindow,
};
