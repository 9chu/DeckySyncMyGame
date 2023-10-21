import {
  DialogBody,
  DialogControlsSection,
  DialogControlsSectionHeader,
  Field,
  ServerAPI,
  Spinner
} from 'decky-frontend-lib';
import { useEffect, useState, FC } from 'react';

import { getConfig, setConfig } from '../../backend';
import WithSuspense from '../WithSuspense';
import SettingItem from './SettingItem';

export const GeneralSettings: FC<{ serverAPI: ServerAPI }> = ({ serverAPI }) => {
  const [loading, setLoading] = useState(true);
  const [configGameLibDir, setConfigGameLibDir] = useState<string>('');

  const onMount = async () => {
    let gameLibDir = await getConfig(serverAPI, 'GameLibDir');
    if (gameLibDir === null)
      gameLibDir = '';
    setConfigGameLibDir(gameLibDir);
  };

  const onConfigValueChanged = (setting: string, value: string) => {
    setConfig(serverAPI, setting, value)
      .then(() => onMount().then(() => {}));  // FIXME: This is a hack to force a refresh
  };

  let content;
  if (loading) {
    content = (
      <DialogBody>
        <DialogControlsSection>
          <Field label='Loading...'>
            <Spinner/>
          </Field>
        </DialogControlsSection>
      </DialogBody>
    );
  } else {
    content = (
      <DialogBody>
        <DialogControlsSection>
          <DialogControlsSectionHeader>Custom Game Library</DialogControlsSectionHeader>
          <SettingItem type='str' label='Directory' setting='GameLibDir' value={configGameLibDir}
            description='Speicify the directory where your games are stored. This is used to build the Steam shortcuts. Default value is "~/MyGames".'
            onChange={onConfigValueChanged} />
        </DialogControlsSection>
      </DialogBody>
    );
  }
  
  useEffect(() => {
    onMount()
      .finally(() => setLoading(false));
  }, [serverAPI]);

  return (
    <WithSuspense>
      {content}
    </WithSuspense>
  );
};
