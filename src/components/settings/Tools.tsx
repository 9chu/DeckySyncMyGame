import {
  ButtonItem,
  DialogBody,
  DialogControlsSection,
  DialogControlsSectionHeader,
  Field,
  ServerAPI,
  showModal,
  ShowModalResult,
} from 'decky-frontend-lib';
import CancellationToken from 'cancellationtoken';
import { useEffect, useState, useCallback, FC } from 'react';
import { delay, syncDatabase, clearAll } from '../../utils';
import { ModalLoading } from '../ModalLoading';
import WithSuspense from '../WithSuspense';

export const Tools: FC<{ serverAPI: ServerAPI }> = ({ serverAPI }) => {
  const [stateSyncDatabaseInProgress, stateSetSyncDatabaseInProgress] = useState<boolean>(false);
  const [stateClearInProgress, stateSetClearInProgress] = useState<boolean>(false);

  const onMount = async () => {
  };

  const onSyncDatabaseClicked = useCallback(() => {
    let modalResult: ShowModalResult;
    const handle = async (serverAPI: ServerAPI, updateHint: (content: string) => void, token: CancellationToken) => {
      stateSetSyncDatabaseInProgress(true);

      try {
        await syncDatabase(serverAPI, updateHint, token);
      } catch (ex) {
        updateHint('Error occur, please check CEF console');
        console.error(ex);
        await delay(2000);
      } finally {
        stateSetSyncDatabaseInProgress(false);
      }

      await delay(1000);
      modalResult?.Close();
    };

    modalResult = showModal(<ModalLoading serverAPI={serverAPI} onMount={handle}/>);
  }, [serverAPI]);
  
  const onClearAllClicked = useCallback(() => {
    let modalResult: ShowModalResult;
    const handle = async (serverAPI: ServerAPI, updateHint: (content: string) => void, token: CancellationToken) => {
      stateSetClearInProgress(true);

      try {
        await clearAll(serverAPI, updateHint, token);
      } catch (ex) {
        updateHint('Error occur, please check CEF console');
        console.error(ex);
        await delay(2000);
      } finally {
        stateSetClearInProgress(false);
      }

      await delay(1000);
      modalResult?.Close();
    };

    modalResult = showModal(<ModalLoading serverAPI={serverAPI} onMount={handle}/>);
  }, [serverAPI]);
  
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
          <Field description="Remove all managed games from collection and database.">
            <ButtonItem onClick={onClearAllClicked} disabled={stateClearInProgress}>Clear All</ButtonItem>
          </Field>
        </DialogControlsSection>
      </DialogBody>
    </WithSuspense>
  );
};
