import {
  ButtonItem,
  definePlugin,
  DialogButton,
  Menu,
  MenuItem,
  PanelSection,
  PanelSectionRow,
  Router,
  ServerAPI,
  showContextMenu,
  staticClasses,
} from 'decky-frontend-lib';
import { VFC, useEffect, useState } from 'react';
import { RiRefreshFill } from 'react-icons/ri';

import {
  getGameCount,
  syncAllGames,
  getShortcutToRemove,
  getShortcutToAdd,
  notifyShortcutRemoved,
  notifyShortcutAdded
} from './backend';
import { SettingsRouter } from './components/settings/SettingsRouter';


const delay = (t: number, val?: any) => new Promise(resolve => setTimeout(resolve, t, val));

const Content: VFC<{ serverAPI: ServerAPI }> = ({ serverAPI }) => {
  const [stateGameCount, stateSetGameCount] = useState<number>(0);
  const [stateRefreshInProgress, stateSetRefreshInProgress] = useState<boolean>(false);

  const syncGameProcess = async (serverAPI: ServerAPI) => {
    // Scan directories
    await syncAllGames(serverAPI);
  
    // Update game count
    stateSetGameCount(await getGameCount(serverAPI));
    
    // Delete outdated games
    const gamesToRemove = await getShortcutToRemove(serverAPI);
    for (const key in gamesToRemove) {
      const appId = gamesToRemove[key];
      
      // Remove shortcut
      try {
        console.log('Removing shortcut:', key, appId);
        SteamClient.Apps.RemoveShortcut(appId);
        await delay(500);
      } catch (ex) {
        console.error(ex);
      }

      // Notify backend
      await notifyShortcutRemoved(serverAPI, key);
    }

    // Add new games
    const gamesToAdd = await getShortcutToAdd(serverAPI);
    for (const key in gamesToAdd) {
      const game = gamesToAdd[key];
      
      try {
        console.log('Adding shortcut:', key, game.name);
        console.log(game);
        
        // Add shortcut
        // Setting name, directory or launch options seems not to work
        const appId = await SteamClient.Apps.AddShortcut(
          game.name,
          game.executable,
          game.directory,
          '');

        await delay(500);

        SteamClient.Apps.SetShortcutName(appId, game.title);
        SteamClient.Apps.SetShortcutStartDir(appId, game.directory);
        if (game.options !== '')
          SteamClient.Apps.SetShortcutLaunchOptions(appId, game.options);
        if (game.compat !== '')
          SteamClient.Apps.SpecifyCompatTool(appId, game.compat);
        if (game.hidden)
          SteamClient.Apps.SetAppHidden(appId, true);
        if (game.icon !== '')
          (SteamClient.Apps as any).SetShortcutIcon(appId, game.icon);

        // Notify backend
        await notifyShortcutAdded(serverAPI, key, appId);
      } catch (ex) {
        console.error(ex);
      }
    }
  };
  
  const onMount = async () => {
    const count = await getGameCount(serverAPI);
    stateSetGameCount(count);
  };

  const onRefreshClicked = (e: any) => {
    stateSetRefreshInProgress(true);
    syncGameProcess(serverAPI)
      .finally(() => {
        stateSetRefreshInProgress(false);
      });
  };

  const onOpenSettingsClicked = (e: any) => {
    Router.CloseSideMenus();
    Router.Navigate('/decky-sync-my-game/settings');
  };

  useEffect(() => {
    onMount()
      .then(() => {
        console.log('Mounted');
      });
  }, [serverAPI]);
  
  return (
    <PanelSection title='Status'>
      <PanelSectionRow>
        <div style={{ display: 'flex', justifyContent: 'left' }}>
          Current games: {stateGameCount}
        </div>
      </PanelSectionRow>

      <PanelSectionRow>
        <ButtonItem layout='below' onClick={onRefreshClicked} disabled={stateRefreshInProgress}>
          Refresh
        </ButtonItem>
      </PanelSectionRow>

      <PanelSectionRow>
        <ButtonItem layout='below' onClick={onOpenSettingsClicked}>
          Settings
        </ButtonItem>
      </PanelSectionRow>
    </PanelSection>
  );
};

export default definePlugin((serverApi: ServerAPI) => {
  serverApi.routerHook.addRoute('/decky-sync-my-game/settings', () => <SettingsRouter serverAPI={serverApi} />);

  return {
    title: <div className={staticClasses.Title}>Sync My Game</div>,
    content: <Content serverAPI={serverApi} />,
    icon: <RiRefreshFill />,
    onDismount() {
      serverApi.routerHook.removeRoute('/decky-sync-my-game/settings');
    },
  };
});
