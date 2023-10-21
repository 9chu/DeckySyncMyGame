import { Base64 } from 'js-base64';
import { ServerAPI } from 'decky-frontend-lib';
import {
    GameDesc,
    GameArtworkTypes,
    readWholeFile,
} from './backend';

export const delay = (t: number, val?: any) => new Promise(resolve => setTimeout(resolve, t, val));

/**
 * Test if game app exists in game collections
 * @param appId AppID
 */
export const testIfGameAppExists = (appId: number) => {
  let game = window.appStore.GetAppOverviewByAppID(appId);
  return (game !== null);
};

/**
 * Add game app
 * @param desc Description
 */
export const addGameApp = async (serverAPI: ServerAPI, desc: GameDesc) => {
  const appId = await SteamClient.Apps.AddShortcut(
    desc.name,
    desc.executable,
    '',  // arguments
    '');  // cmdline
  if (appId === null || appId === undefined)
    return null;

  SteamClient.Apps.SetShortcutName(appId, desc.title);
  SteamClient.Apps.SetShortcutStartDir(appId, desc.directory);

  if (desc.options !== '') {
    SteamClient.Apps.SetShortcutLaunchOptions(appId, desc.options);
  }
  if (desc.compat !== '') {
    SteamClient.Apps.SpecifyCompatTool(appId, desc.compat);
  }
  if (desc.hidden) {
    SteamClient.Apps.SetAppHidden(appId, true);
  }
  if (desc.artworks[GameArtworkTypes.icon]) {
    (SteamClient.Apps as any).SetShortcutIcon(appId, desc.artworks[GameArtworkTypes.icon].path);
  }

  // If game is tagged as hidden, post a message to GameCollection
  if (desc.hidden) {
    SteamClient.Messaging.PostMessage('Collections', 'HideApp', JSON.stringify({
      'appid': appId,
      'bHide': true,
    }));
  }

  // Update artworks
  for (const artworkType in desc.artworks) {
    if (parseInt(artworkType) < 0)
      continue;
    const artwork = desc.artworks[artworkType];
    if (artwork.path !== '') {
      console.log(`Reading artwork file: ${artwork.path}`)
      const artworkData = await readWholeFile(serverAPI, artwork.path);
      if (artworkData === null) {
        console.error(`Failed to read artwork file: ${artwork.path}`);
        continue;
      }

      const b64 = Base64.fromUint8Array(artworkData);
      try {
        await SteamClient.Apps.SetCustomArtworkForApp(appId, b64, 'png', artwork.type);
        await delay(500);
      } catch (ex) {
        console.error(`Set artwork file failed: ${artwork.path}`);
        console.error(ex);
      }
    }
  }
  return appId;
};
