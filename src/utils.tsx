import { Base64 } from 'js-base64';
import { ServerAPI } from 'decky-frontend-lib';
import CancellationToken from 'cancellationtoken';
import {
    GameDesc,
    GameArtworkTypes,
    getAllManagedGames,
    removeManagedGame,
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
export const addGameApp = async (serverAPI: ServerAPI, desc: GameDesc, token?: CancellationToken): Promise<number> => {
  const appId = await SteamClient.Apps.AddShortcut(
    desc.name,
    desc.executable,
    '',  // arguments
    '');  // cmdline
  if (appId === null || appId === undefined)
    throw new Error(`AddShortcut fail, name: ${desc.name}, exe: ${desc.executable}`);
  await delay(500);

  SteamClient.Apps.SetShortcutName(appId, desc.title);
  await delay(500);
  
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
      console.log(`Reading artwork file: ${artwork.path}`);
      try {
        const artworkData = await readWholeFile(serverAPI, artwork.path, token);
        const b64 = Base64.fromUint8Array(artworkData);
        await SteamClient.Apps.SetCustomArtworkForApp(appId, b64, 'png', artwork.type);
      } catch (ex) {
        console.error(`Set artwork file failed: ${artwork.path}`);
        console.error(ex);
      }
      await delay(500);
    }
    token?.throwIfCancelled();
  }
  return appId;
};

/**
 * Syncing database with game collection
 */
export const syncDatabase = async (serverAPI: ServerAPI, updateHint?: (content: string) => void,
    token?: CancellationToken) => {
  const games = await getAllManagedGames(serverAPI, token);
  for (const e in games) {
    const appId = games[e];
    try {
      if (!testIfGameAppExists(appId)) {
        console.log(`Removing shortcut: ${appId}`);
        if (updateHint) {
          updateHint(`Removing ${appId}`);
        }
        await removeManagedGame(serverAPI, e);
      }
    } catch (ex) {
      console.error(`Removing shortcut fail, appId: ${appId}`);
      console.error(ex);
    }
    token?.throwIfCancelled();
  }
};

/**
 * Clear all games in collection
 */
export const clearAll = async (serverAPI: ServerAPI, updateHint?: (content: string) => void,
    token?: CancellationToken) => {
  const games = await getAllManagedGames(serverAPI, token);
  for (const e in games) {
    const appId = games[e];
    try {
      if (testIfGameAppExists(appId)) {
        console.log(`Removing shortcut: ${appId}`);
        if (updateHint) {
          updateHint(`Removing ${appId}`);
        }
        SteamClient.Apps.RemoveShortcut(appId);
        await delay(500);
      }
      await removeManagedGame(serverAPI, e);
    } catch (ex) {
      console.error(`Removing shortcut fail, appId: ${appId}`);
      console.error(ex);
    }
    token?.throwIfCancelled();
  }
};
