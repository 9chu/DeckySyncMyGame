import { ServerAPI } from 'decky-frontend-lib';


export interface GameDesc {
  name: string;
  title: string;
  executable: string;
  directory: string;
  options: string;
  compat: string;
  hidden: boolean;
  icon: string;
}

export const getGameCount = async (serverAPI: ServerAPI): Promise<number> => {
  const ret = await serverAPI.callPluginMethod<{}, number>('get_game_count', {});
  if (ret.success)
    return ret.result;
  return 0;
};

export const getAllShortcuts = async (serverAPI: ServerAPI): Promise<Record<string, number>> => {
  const ret = await serverAPI.callPluginMethod<{}, Record<string, number>>('get_all_shortcuts', {});
  if (ret.success)
    return ret.result;
  return {};
};

export const syncAllGames = async (serverAPI: ServerAPI): Promise<void> => {
  await serverAPI.callPluginMethod<{}, boolean>('sync_all_games', {});
};

export const getShortcutToRemove = async (serverAPI: ServerAPI): Promise<Record<string, number>> => {
  const ret = await serverAPI.callPluginMethod<{}, Record<string, number>>('get_shortcut_to_remove', {});
  if (ret.success)
    return ret.result;
  return {};
};

export const getShortcutToAdd = async (serverAPI: ServerAPI): Promise<Record<string, GameDesc>> => {
  const ret = await serverAPI.callPluginMethod<{}, Record<string, GameDesc>>('get_shortcut_to_add', {});
  if (ret.success)
    return ret.result;
  return {};
};

export const notifyShortcutRemoved = async (serverAPI: ServerAPI, key: string): Promise<void> => {
  await serverAPI.callPluginMethod<{ key: string }, void>('notify_shortcut_removed', { key });
};

export const notifyShortcutAdded = async (serverAPI: ServerAPI, key: string, steamAppId: number): Promise<void> => {
  await serverAPI.callPluginMethod<{ key: string, steam_app_id: number }, void>('notify_shortcut_added', {
    key, steam_app_id: steamAppId
  });
};

export const getConfig = async (serverAPI: ServerAPI, key: string): Promise<string | null> => {
  const ret = await serverAPI.callPluginMethod<{ key: string }, string | null>('get_config', { key });
  if (ret.success)
      return ret.result;
  return null;
};

export const setConfig = async (serverAPI: ServerAPI, key: string, value: string): Promise<void> => {
  await serverAPI.callPluginMethod<{ key: string, value: string }, void>('set_config', { key, value });
};
