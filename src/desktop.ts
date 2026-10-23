export type DesktopAction = "new-workspace" | "search";
import type { GeneratedFileTarget } from "../shared/generated-files";

export interface DesktopUpdateState {
  phase:
    | "idle"
    | "checking"
    | "available"
    | "downloading"
    | "verifying"
    | "ready"
    | "installing"
    | "error";
  version?: string;
  progress?: number;
  message?: string;
  operation?: "check" | "install";
}

export interface DreviDesktop {
  readonly platform: "macos";
  readonly fullscreen: boolean;
  chooseDirectory: () => Promise<string | null>;
  openSettings: () => Promise<unknown>;
  openDataDirectory: () => Promise<unknown>;
  openGeneratedFile?: (target: GeneratedFileTarget) => Promise<unknown>;
  revealGeneratedFile?: (target: GeneratedFileTarget) => Promise<unknown>;
  setAppearance: (theme: "light" | "dark" | "system") => Promise<unknown>;
  getUpdateState?: () => Promise<DesktopUpdateState>;
  checkForUpdates?: () => Promise<DesktopUpdateState>;
  installUpdate?: () => Promise<DesktopUpdateState>;
  setComputerUsePreview?: (task: {
    workspaceId: string;
    nodeId: string;
    revision: number;
  }) => Promise<unknown>;
  closeComputerUsePreview?: () => Promise<unknown>;
}

declare global {
  interface Window {
    dreviDesktop?: DreviDesktop;
  }
}

export function getDesktopBridge(): DreviDesktop | null {
  return window.dreviDesktop?.platform === "macos" ? window.dreviDesktop : null;
}

export function onDesktopAction(handle: (action: DesktopAction) => void) {
  if (!getDesktopBridge()) return () => {};
  const listener = (event: Event) => {
    if (!(event instanceof CustomEvent)) return;
    const action = event.detail?.action;
    if (action === "new-workspace" || action === "search") handle(action);
  };
  window.addEventListener("drevi:native-action", listener);
  return () => window.removeEventListener("drevi:native-action", listener);
}
