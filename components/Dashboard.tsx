import type { ComponentProps } from 'react';
import useIsMobile from '../hooks/useIsMobile';
import DashboardDesktop from './DashboardDesktop';
import DashboardMobileV2 from './DashboardMobileV2';

type DashboardProps = ComponentProps<typeof DashboardDesktop>;

const Dashboard = (props: DashboardProps) => {
  const isMobile = useIsMobile();
  return isMobile ? <DashboardMobileV2 {...props} /> : <DashboardDesktop {...props} />;
};

export default Dashboard;
