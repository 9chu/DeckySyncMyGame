import {
  DialogBody,
  DialogControlsSection,
  ModalRoot,
  ServerAPI,
  SteamSpinner,
  DialogLabel,
} from 'decky-frontend-lib';
import { useEffect, useState, FC } from 'react';
import CancellationToken from 'cancellationtoken';

export interface ModalLoadingProps {
  serverAPI: ServerAPI;
  onMount: (serverAPI: ServerAPI, updateHint: (content: string) => void, token: CancellationToken) => Promise<void>;
}

export const ModalLoading: FC<ModalLoadingProps> = ({serverAPI, onMount}) => {
  const [stateHint, stateSetHint] = useState<string>('');

  const {token, cancel} = CancellationToken.create();
  useEffect(() => {
    // trigger in next frame
    setTimeout(() => {
      onMount(serverAPI, stateSetHint, token)
        .catch((ex) => {
          console.error(ex);
        });
    }, 0);
  }, [serverAPI, onMount]);

  return (
    <ModalRoot
      onCancel={cancel}
      bDisableBackgroundDismiss={true}
      bHideCloseIcon={true}
      bOKDisabled={true}
      bCancelDisabled={false}
    >
      <DialogBody>
        <DialogControlsSection>
          <SteamSpinner/>
        </DialogControlsSection>
        <DialogControlsSection>
          <DialogLabel>{stateHint}</DialogLabel>
        </DialogControlsSection>
      </DialogBody>
    </ModalRoot>
  );
};
