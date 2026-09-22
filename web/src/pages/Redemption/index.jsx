import React from 'react';
import RedemptionsTable from '../../components/RedemptionsTable';
import RedemptionSectionTabs from '../../components/RedemptionSectionTabs';

const Redemption = () => {
  return (
    <div className='dashboard-container'>
      <RedemptionsTable
        sectionTabs={<RedemptionSectionTabs active='list' />}
      />
    </div>
  );
};

export default Redemption;
