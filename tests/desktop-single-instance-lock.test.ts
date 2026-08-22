import { describe, expect, it, vi } from "vitest";
import path from "path";

import {
  configureElectronStoragePaths,
  configureClientSingleInstance,
  focusExistingWindow,
} from "../desktop/src/shared/single-instance-lock.cjs";

function makeApp({ gotLock = true } = {}) {
  const handlers = new Map();
  return {
    app: {
      getPath: vi.fn((name) => {
        if (name === "appData") return path.join("C:", "Users", "me", "AppData", "Roaming");
        return path.join("C:", "tmp");
      }),
      setPath: vi.fn(),
      setAppLogsPath: vi.fn(),
      commandLine: { appendSwitch: vi.fn() },
      requestSingleInstanceLock: vi.fn(() => gotLock),
      on: vi.fn((event, handler) => handlers.set(event, handler)),
      exit: vi.fn(),
      quit: vi.fn(),
    },
    handlers,
  };
}

describe("desktop client single instance lock", () => {
  it("redirects Electron persistence before requesting the lock", () => {
    const { app } = makeApp();
    const defaultHome = path.join("C:", "Users", "me", ".hanako");
    const devHome = path.join("C:", "Users", "me", ".hanako-dev");

    const acquired = configureClientSingleInstance(app, {
      hanakoHome: devHome,
      defaultHome,
      onSecondInstance: vi.fn(),
    });

    expect(acquired).toBe(true);
    const electronRoot = path.join("C:", "Users", "me", ".hanako-dev", "electron");
    expect(app.setPath).toHaveBeenCalledWith("userData", path.join(electronRoot, "user-data"));
    expect(app.setPath).toHaveBeenCalledWith("sessionData", path.join(electronRoot, "session-data"));
    expect(app.setPath).toHaveBeenCalledWith("crashDumps", path.join(electronRoot, "crash-dumps"));
    expect(app.setAppLogsPath).toHaveBeenCalledWith(path.join(electronRoot, "logs"));
    expect(app.commandLine.appendSwitch).toHaveBeenCalledWith(
      "disk-cache-dir",
      path.join(electronRoot, "cache"),
    );
    expect(app.setPath.mock.invocationCallOrder[0]).toBeLessThan(
      app.requestSingleInstanceLock.mock.invocationCallOrder[0],
    );
  });

  it("uses the same HANA_HOME storage layout for production", () => {
    const { app } = makeApp();
    const defaultHome = path.join("C:", "Users", "me", ".hanako");

    const acquired = configureClientSingleInstance(app, {
      hanakoHome: defaultHome,
      defaultHome,
      onSecondInstance: vi.fn(),
    });

    expect(acquired).toBe(true);
    const electronRoot = path.join("C:", "Users", "me", ".hanako", "electron");
    expect(app.setPath).toHaveBeenCalledWith("userData", path.join(electronRoot, "user-data"));
    expect(app.setPath).toHaveBeenCalledWith("sessionData", path.join(electronRoot, "session-data"));
    expect(app.requestSingleInstanceLock).toHaveBeenCalledTimes(1);
  });

  it("configures all Electron storage paths under HANA_HOME", () => {
    const { app } = makeApp();
    const home = path.join("C:", "hana-agent");
    const paths = configureElectronStoragePaths(app, home);

    expect(paths).toEqual({
      userData: path.join(home, "electron", "user-data"),
      sessionData: path.join(home, "electron", "session-data"),
      cache: path.join(home, "electron", "cache"),
      logs: path.join(home, "electron", "logs"),
      crashDumps: path.join(home, "electron", "crash-dumps"),
    });
  });

  it("exits a duplicate client before registering second-instance handlers", () => {
    const { app } = makeApp({ gotLock: false });

    const acquired = configureClientSingleInstance(app, {
      hanakoHome: path.join("C:", "Users", "me", ".hanako"),
      defaultHome: path.join("C:", "Users", "me", ".hanako"),
      onSecondInstance: vi.fn(),
    });

    expect(acquired).toBe(false);
    expect(app.exit).toHaveBeenCalledWith(0);
    expect(app.quit).not.toHaveBeenCalled();
    expect(app.on).not.toHaveBeenCalledWith("second-instance", expect.any(Function));
  });

  it("brings the primary window forward when a duplicate launch is redirected", () => {
    const { app, handlers } = makeApp();
    const onSecondInstance = vi.fn();

    configureClientSingleInstance(app, {
      hanakoHome: path.join("C:", "Users", "me", ".hanako"),
      defaultHome: path.join("C:", "Users", "me", ".hanako"),
      onSecondInstance,
    });

    handlers.get("second-instance")?.();

    expect(onSecondInstance).toHaveBeenCalledTimes(1);
  });

  it("restores, shows, and focuses a hidden or minimized window", () => {
    const win = {
      isDestroyed: vi.fn(() => false),
      isMinimized: vi.fn(() => true),
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
    };

    expect(focusExistingWindow(win)).toBe(true);
    expect(win.restore).toHaveBeenCalledTimes(1);
    expect(win.show).toHaveBeenCalledTimes(1);
    expect(win.focus).toHaveBeenCalledTimes(1);
  });
});
