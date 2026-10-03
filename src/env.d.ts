declare module '*.css';

interface Window {
  /** 思源桌面端（Electron, nodeIntegration）提供的 Node require */
  require?: (id: string) => any;
}
