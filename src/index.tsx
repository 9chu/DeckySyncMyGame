import {
  ButtonItem,
  definePlugin,
  PanelSection,
  PanelSectionRow,
  Router,
  ServerAPI,
  staticClasses,
} from 'decky-frontend-lib';
import { VFC, useEffect, useState } from 'react';
import { RiRefreshFill } from 'react-icons/ri';
import {
  getManagedGameCount,
  isScanning,
  refreshGames,
  getAllRemovedGames,
  getAllUnmanagedGames,
  addManagedGame,
  removeManagedGame,
} from './backend';
import { addGameApp } from './utils';
import { SettingsRouter } from './components/settings/SettingsRouter';

const Content: VFC<{ serverAPI: ServerAPI }> = ({ serverAPI }) => {
  const [stateGameCount, stateSetGameCount] = useState<number>(0);
  const [stateRefreshInProgress, stateSetRefreshInProgress] = useState<boolean>(false);

  const handleRefreshGames = async (serverAPI: ServerAPI) => {
    console.log('Start refresh');

    // Scan directories
    const ret = await refreshGames(serverAPI);
    if (!ret) {
      console.error(`refreshGames rets false`);
      return;
    }
  
    // Delete outdated games
    const gamesToRemove = await getAllRemovedGames(serverAPI);
    console.log(`Deleting outdated games, count=${Object.keys(gamesToRemove).length}`);
    for (const key in gamesToRemove) {
      const appId = gamesToRemove[key];
      
      // Remove game
      try {
        console.log(`Removing game: ${appId}`);
        SteamClient.Apps.RemoveShortcut(appId);
      } catch (ex) {
        console.error(ex);
      }

      // Notify backend
      await removeManagedGame(serverAPI, key);
    }

    // Add new games
    const gamesToAdd = await getAllUnmanagedGames(serverAPI);
    console.log(`Adding new games, count=${Object.keys(gamesToAdd).length}`);
    for (const key in gamesToAdd) {
      const game = gamesToAdd[key];
      
      let appId;
      try {
        console.log(`Adding game: ${game.name}`);
        
        // Add game app
        appId = await addGameApp(serverAPI, game);
        if (appId === null) {
          console.error(`Failed to add game: ${game.name}`);
          continue;
        }

        // Notify backend
        await addManagedGame(serverAPI, key, appId);
      } catch (ex) {
        console.error(ex);

        if (appId !== null && appId !== undefined) {
          try {
            SteamClient.Apps.RemoveShortcut(appId);
          } catch (ex) {
            console.error(ex);
          }
        }
      }
    }

    // Update game count
    console.log(`Updating game counter`);
    stateSetGameCount(await getManagedGameCount(serverAPI));

    console.log('Refresh finished');
  };
  
  const onMount = async () => {
    const count = await getManagedGameCount(serverAPI);
    stateSetGameCount(count);

    const scanning = await isScanning(serverAPI);
    stateSetRefreshInProgress(scanning);
  };

  const onRefreshClicked = () => {
    stateSetRefreshInProgress(true);
    handleRefreshGames(serverAPI)
      .finally(() => {
        stateSetRefreshInProgress(false);
      });
  };

  const onOpenSettingsClicked = () => {
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
