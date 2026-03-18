export interface NyxDesktopApi {
  platform: string;
  versions: {
    electron: string;
    chrome: string;
    node: string;
  };
}
