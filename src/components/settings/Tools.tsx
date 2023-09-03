import {
  ButtonItem,
  DialogBody,
  DialogControlsSection,
  DialogControlsSectionHeader,
  Field,
  ServerAPI,
  Spinner
} from 'decky-frontend-lib';
import { useEffect, useState, FC } from 'react';
  
import { getAllShortcuts, notifyShortcutRemoved } from '../../backend';
import WithSuspense from '../WithSuspense';


const testIfShortcutExists = (appId: number) => {
  let game = window.appStore.GetAppOverviewByAppID(appId);
  return (game !== null);
};

const syncDatabase = async (serverAPI: ServerAPI) => {
  const shortcuts = await getAllShortcuts(serverAPI);
  for (const e in shortcuts) {
    const appId = shortcuts[e];
    try {
      if (!testIfShortcutExists(appId)) {
        console.log('Removing shortcut:', e, appId);
        await notifyShortcutRemoved(serverAPI, e);
      }
    } catch (ex) {
      console.error(ex);
    }
  }
};

export const Tools: FC<{ serverAPI: ServerAPI }> = ({ serverAPI }) => {
  const [stateSyncDatabaseInProgress, stateSetSyncDatabaseInProgress] = useState<boolean>(false);

  const onMount = async () => {
  };

  const onSyncDatabaseClicked = (e: any) => {
    console.log('Sync database')
    stateSetSyncDatabaseInProgress(true);
    syncDatabase(serverAPI)
      .finally(() => stateSetSyncDatabaseInProgress(false));
  };
  
  useEffect(() => {
    onMount()
      .finally(() => {});
  }, [serverAPI]);
  
  return (
    <WithSuspense>
      <DialogBody>
        <DialogControlsSection>
          <DialogControlsSectionHeader>Prepair</DialogControlsSectionHeader>
          <Field description="Remove already deleted shortcuts from database.">
            <ButtonItem onClick={onSyncDatabaseClicked} disabled={stateSyncDatabaseInProgress}>Sync database</ButtonItem>
          </Field>
        </DialogControlsSection>
      </DialogBody>
    </WithSuspense>
  );
};
