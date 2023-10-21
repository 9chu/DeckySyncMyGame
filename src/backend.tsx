import { ServerAPI } from 'decky-frontend-lib';
import { Base64 } from 'js-base64';
import CancellationToken from 'cancellationtoken';

export enum GameArtworkTypes {
  icon = -1,
  grid = 0,
  hero = 1,
  logo = 2,
}

export interface GameArtworkDesc {
  type: number;
  path: string;
  md5: string;
}

export interface GameDesc {
  name: string;
  title: string;
  executable: string;
  directory: string;
  options: string;
  compat: string;
  hidden: boolean;
  artworks: Record<number, GameArtworkDesc>;
}

export const getConfig = async (serverAPI: ServerAPI, key: string): Promise<string | null> => {
  const ret = await serverAPI.callPluginMethod<{ key: string }, string | null>('get_config', { key });
  if (ret.success) {
    return ret.result;
  } else {
    throw new Error(`Failed to get config ${key}`);
  }
};

export const setConfig = async (serverAPI: ServerAPI, key: string, value: string): Promise<void> => {
  const ret = await serverAPI.callPluginMethod<{ key: string, value: string }, void>('set_config', { key, value });
  if (!ret.success) {
    throw new Error(`Failed to set config ${key}`);
  }
};

export const isScanning = async (serverAPI: ServerAPI): Promise<boolean> => {
  const ret = await serverAPI.callPluginMethod<{}, boolean>('is_scanning', {});
  if (ret.success) {
    return ret.result;
  } else {
    console.error(`Failed to get scanning status`);
    return false;
  }
};

export const getManagedGameCount = async (serverAPI: ServerAPI): Promise<number> => {
  const ret = await serverAPI.callPluginMethod<{}, number>('get_managed_game_count', {});
  if (ret.success) {
    return ret.result;
  } else {
    console.error(`Failed to get managed game count`);
    return 0;
  }
};

export const refreshGames = async (serverAPI: ServerAPI): Promise<void> => {
  const ret = await serverAPI.callPluginMethod<{}, boolean>('refresh_games', {});
  if (!ret.success || !ret.result) {
    throw new Error(`Failed to refresh games`);
  }
};

export const getManagedGames = async (serverAPI: ServerAPI, page: number): Promise<Record<string, number>> => {
  const ret = await serverAPI.callPluginMethod<{ page: number }, Record<string, number>>('get_managed_games', { page });
  if (ret.success) {
    return ret.result;
  } else {
    throw new Error(`Failed to get managed games, page: ${page}`);
  }
};

export const getAllManagedGames = async (serverAPI: ServerAPI, token?: CancellationToken): Promise<Record<string, number>> => {
  const ret = {};

  let page = 0;
  const PAGE_SIZE = 50;  // same as defined in main.py
  
  while (true) {
    const current = await getManagedGames(serverAPI, page);
    Object.assign(ret, current);
    if (Object.keys(current).length < PAGE_SIZE) {
      break;
    }
    page += 1;
    token?.throwIfCancelled();
  }
  return ret;
};

export const getUnmanagedGames = async (serverAPI: ServerAPI, page: number): Promise<Record<string, GameDesc>> => {
  const ret = await serverAPI.callPluginMethod<{ page: number }, Record<string, GameDesc>>(
    'get_unmanaged_games', { page });
  if (ret.success) {
    return ret.result;
  } else {
    throw new Error(`Failed to get unmanaged games, page: ${page}`);
  }
};

export const getAllUnmanagedGames = async (serverAPI: ServerAPI, token?: CancellationToken): Promise<Record<string, GameDesc>> => {
  const ret = {};

  let page = 0;
  const PAGE_SIZE = 20;  // same as defined in main.py
  
  while (true) {
    const current = await getUnmanagedGames(serverAPI, page);
    Object.assign(ret, current);
    if (Object.keys(current).length < PAGE_SIZE) {
      break;
    }
    page += 1;
    token?.throwIfCancelled();
  }
  return ret;
};

export const getRemovedGames = async (serverAPI: ServerAPI, page: number): Promise<Record<string, number>> => {
  const ret = await serverAPI.callPluginMethod<{ page: number }, Record<string, number>>(
    'get_removed_games', { page });
  if (ret.success) {
    return ret.result;
  } else {
    throw new Error(`Failed to get removed games, page: ${page}`);
  }
};

export const getAllRemovedGames = async (serverAPI: ServerAPI, token?: CancellationToken)
    : Promise<Record<string, number>> => {
  const ret = {};

  let page = 0;
  const PAGE_SIZE = 50;  // same as defined in main.py
  
  while (true) {
    const current = await getRemovedGames(serverAPI, page);
    Object.assign(ret, current);
    if (Object.keys(current).length < PAGE_SIZE) {
      break;
    }
    page += 1;
    token?.throwIfCancelled();
  }
  return ret;
};

export const addManagedGame = async (serverAPI: ServerAPI, key: string, steamAppId: number): Promise<void> => {
  const ret = await serverAPI.callPluginMethod<{ key: string, steam_app_id: number }, void>(
    'add_managed_game', { key, steam_app_id: steamAppId });
  if (!ret.success) {
    console.error(`Failed to add managed game, key: ${key}, steam_app_id: ${steamAppId}`);
  }
};

export const removeManagedGame = async (serverAPI: ServerAPI, key: string): Promise<void> => {
  const ret = await serverAPI.callPluginMethod<{ key: string }, void>('remove_managed_game', { key });
  if (!ret.success) {
    console.error(`Failed to remove managed game, key: ${key}`);
  }
};

export const readFile = async (serverAPI: ServerAPI, path: string, offset: number, size: number)
  : Promise<Uint8Array> => {
  const ret = await serverAPI.callPluginMethod<{ path: string, offset: number, size: number }, string | null>(
    'read_file', { path, offset, size });
  if (ret.success) {
    if (ret.result) {
      return Base64.toUint8Array(ret.result);
    }
  }
  throw new Error(`Failed to read file, path: ${path}, offset: ${offset}, size: ${size}`);
};

export const readWholeFile = async (serverAPI: ServerAPI, path: string, token?: CancellationToken)
    : Promise<Uint8Array> => {
  const CHUNK_SIZE = 4096;
  
  let ret = null;
  let offset = 0;
  while (true) {
    const chunk = await readFile(serverAPI, path, offset, CHUNK_SIZE);
    if (ret === null) {
      ret = chunk;
    } else {
      const merged: Uint8Array = new Uint8Array(ret.length + chunk.length);
      merged.set(ret);
      merged.set(chunk, ret.length);
      ret = merged;
    }

    if (chunk.length < CHUNK_SIZE) {
      break;
    }
    offset += CHUNK_SIZE;
    token?.throwIfCancelled();
  }
  return ret;
};
