import React from 'react';
import RedemptionsTable from '../../components/RedemptionsTable';
import RedemptionSectionTabs from '../../components/RedemptionSectionTabs';

const Redemption = () => {
  return (
    <div className='dashboard-container'>
      <RedemptionSectionTabs active='list' />
      <RedemptionsTable />
    </div>
  );
};

export default Redemption;
