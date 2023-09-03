import {
  ServerAPI,
  SidebarNavigation,
} from 'decky-frontend-lib';
import { FC } from 'react';
import WithSuspense from '../WithSuspense';
import { TbTool, TbAdjustments } from 'react-icons/tb';
import { GeneralSettings } from './GeneralSettings';
import { Tools } from './Tools';


export const SettingsRouter: FC<{ serverAPI: ServerAPI }> = ({ serverAPI }) => {
  const pages = [
    {
      title: 'General',
      content: <GeneralSettings serverAPI={serverAPI} />,
      route: '/decky-sync-my-game/settings/general',
      icon: <TbAdjustments/>,
    },
    {
      title: 'Tools',
      content: <Tools serverAPI={serverAPI} />,
      route: '/decky-sync-my-game/settings/tools',
      icon: <TbTool/>,
    }
  ];

  return (
    <WithSuspense route={true}>
      <SidebarNavigation pages={pages}/>
    </WithSuspense>
  )
};
