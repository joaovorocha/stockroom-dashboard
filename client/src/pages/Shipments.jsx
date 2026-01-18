import React from 'react';
import ShipmentTable from '../components/ShipmentTable';

const Shipments = () => {
  return (
    <div className="container-fluid">
      <div className="page-header">
        <h1>Shipments</h1>
      </div>
      <ShipmentTable />
    </div>
  );
};

export default Shipments;
