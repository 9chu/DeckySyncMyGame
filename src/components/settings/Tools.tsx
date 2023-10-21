import {
  ButtonItem,
  DialogBody,
  DialogControlsSection,
  DialogControlsSectionHeader,
  Field,
  ServerAPI,
} from 'decky-frontend-lib';
import { useEffect, useState, FC } from 'react';
import { getAllManagedGames, removeManagedGame } from '../../backend';
import { testIfGameAppExists } from '../../utils';
import WithSuspense from '../WithSuspense';

const syncDatabase = async (serverAPI: ServerAPI) => {
  const games = await getAllManagedGames(serverAPI);
  for (const e in games) {
    const appId = games[e];
    try {
      if (!testIfGameAppExists(appId)) {
        console.log(`Removing shortcut: ${appId}`);
        await removeManagedGame(serverAPI, e);
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

  const onSyncDatabaseClicked = () => {
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
          <Field description="Remove already deleted game apps from database.">
            <ButtonItem onClick={onSyncDatabaseClicked} disabled={stateSyncDatabaseInProgress}>Sync Database</ButtonItem>
          </Field>
        </DialogControlsSection>
      </DialogBody>
    </WithSuspense>
  );
};
