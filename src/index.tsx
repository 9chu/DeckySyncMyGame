import {
  ButtonItem,
  definePlugin,
  PanelSection,
  PanelSectionRow,
  Router,
  ServerAPI,
  staticClasses,
  Field,
  Spinner,
  showModal,
  ShowModalResult,
} from 'decky-frontend-lib';
import { VFC, useEffect, useState, useCallback } from 'react';
import { RiRefreshFill } from 'react-icons/ri';
import CancellationToken from 'cancellationtoken';
import {
  getManagedGameCount,
  isScanning,
  refreshGames,
  getAllRemovedGames,
  getAllUnmanagedGames,
  addManagedGame,
  removeManagedGame,
} from './backend';
import { delay, addGameApp } from './utils';
import { ModalLoading } from './components/ModalLoading';
import { SettingsRouter } from './components/settings/SettingsRouter';

const Content: VFC<{ serverAPI: ServerAPI }> = ({ serverAPI }) => {
  const [stateStatusLoading, stateSetStatusLoading] = useState<boolean>(true);
  const [stateGameCount, stateSetGameCount] = useState<number>(0);
  const [stateRefreshInProgress, stateSetRefreshInProgress] = useState<boolean>(false);

  const handleRefreshGames = async (serverAPI: ServerAPI, updateHint: (content: string) => void,
      token: CancellationToken) => {
    console.log('Start refresh');

    // Scan directories
    await refreshGames(serverAPI);
  
    // Delete outdated games
    const gamesToRemove = await getAllRemovedGames(serverAPI, token);
    console.log(`Deleting outdated games, count=${Object.keys(gamesToRemove).length}`);
    for (const key in gamesToRemove) {
      const appId = gamesToRemove[key];
      
      // Remove game
      try {
        console.log(`Removing game: ${appId}`);
        updateHint(`Removing ${appId}`);
        SteamClient.Apps.RemoveShortcut(appId);
      } catch (ex) {
        console.error(ex);
      }

      // Notify backend
      await removeManagedGame(serverAPI, key);

      token.throwIfCancelled();
    }

    // Add new games
    const gamesToAdd = await getAllUnmanagedGames(serverAPI, token);
    console.log(`Adding new games, count=${Object.keys(gamesToAdd).length}`);
    for (const key in gamesToAdd) {
      const game = gamesToAdd[key];
      
      let appId;
      try {
        console.log(`Adding game: ${game.name}`);
        
        // Add game app
        updateHint(`Adding ${game.name}`);
        appId = await addGameApp(serverAPI, game, token);

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

      token.throwIfCancelled();
    }

    // Update game count
    stateSetGameCount(await getManagedGameCount(serverAPI));

    console.log('Refresh finished');
    updateHint(`All done!`);
  };
  
  const onMount = async () => {
    stateSetGameCount(await getManagedGameCount(serverAPI));
    stateSetStatusLoading(false);
    stateSetRefreshInProgress(await isScanning(serverAPI));
  };

  const onOpenSettingsClicked = useCallback(() => {
    Router.CloseSideMenus();
    Router.Navigate('/decky-sync-my-game/settings');
  }, [serverAPI]);

  const onRefreshClicked = useCallback(() => {
    let modalResult: ShowModalResult;
    const handle = async (serverAPI: ServerAPI, updateHint: (content: string) => void, token: CancellationToken) => {
      stateSetRefreshInProgress(true);

      try {
        await handleRefreshGames(serverAPI, updateHint, token);
      } catch (ex) {
        updateHint('Error occur, please check CEF console');
        console.error(ex);
        await delay(2000);
      } finally {
        stateSetRefreshInProgress(false);
      }

      await delay(1000);
      modalResult?.Close();
    };

    modalResult = showModal(<ModalLoading serverAPI={serverAPI} onMount={handle}/>);
  }, [serverAPI]);

  useEffect(() => {
    onMount()
      .then(() => {
        console.log('Mounted');
      });
  }, [serverAPI]);

  let statusElement;
  if (stateStatusLoading) {
    statusElement = (
      <Field label='Loading...'>
        <Spinner/>
      </Field>
    );
  } else {
    statusElement = (
      <Field label='Managed games:'>
        {stateGameCount}
      </Field>
    )
  }

  return (
    <PanelSection title='Status'>
      <PanelSectionRow>
        {statusElement}
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
