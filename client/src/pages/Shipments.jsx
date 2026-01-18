import React, { useState, useEffect } from 'react';
import axios from 'axios';

const Shipments = () => {
  const [shipments, setShipments] = useState([]);
  const [filteredShipments, setFilteredShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    loadShipments();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [shipments, searchQuery, statusFilter]);

  const loadShipments = async () => {
    try {
      const response = await axios.get('/api/shipments', { withCredentials: true });
      setShipments(response.data.shipments || []);
    } catch (err) {
      console.error('Failed to load shipments:', err);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = shipments.filter(s => {
      // Enforce UPS '1Z' tracking prefix
      const tracking = (s.trackingNumber || s.tracking || '').trim().toUpperCase();
      if (!tracking.startsWith('1Z')) return false;

      if (statusFilter) {
        const status = (s.status || s.lastUpsStatus || 'unknown').toLowerCase().replace(/_/g, '-');
        if (status !== statusFilter) return false;
      }

      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const haystack = [
          tracking,
          s.customerName || '',
          s.destination || '',
          s.shipper || '',
          s.notes || '',
          s.orderNumber || '',
          s.processedByName || '',
          s.processedById || '',
          s.reference1 || '',
          s.reference2 || '',
          s.customerAddress?.line1 || '',
          s.customerAddress?.city || '',
          s.customerAddress?.state || '',
          s.customerAddress?.zip || ''
        ].join(' ').toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      return true;
    });

    // Sort by status priority, then by date
    filtered.sort((a, b) => {
      const statusOrder = {
        'label-created': 1,
        'in-transit': 2,
        'delivered': 3,
        'exception': 4,
        'unknown': 5,
        'returned': 6
      };

      const aStatus = (a.status || a.lastUpsStatus || 'unknown').toLowerCase().replace(/_/g, '-');
      const bStatus = (b.status || b.lastUpsStatus || 'unknown').toLowerCase().replace(/_/g, '-');

      const aRank = statusOrder[aStatus] || 99;
      const bRank = statusOrder[bStatus] || 99;

      if (aRank !== bRank) return aRank - bRank;

      const aTime = new Date(a.shippedAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.shippedAt || b.createdAt || 0).getTime();
      return bTime - aTime;
    });

    setFilteredShipments(filtered);
  };

  const formatDate = (value) => {
    if (!value) return '';
    const d = new Date(value);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' });
  };

  const trackingLink = (trackingNumber) => {
    const t = (trackingNumber || '').trim();
    if (!t) return null;
    return `https://www.ups.com/track?tracknum=${encodeURIComponent(t)}`;
  };

  if (loading) return <div>Loading shipments...</div>;

  return (
    <div style={{ padding: '20px' }}>
      <h1>Shipments</h1>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <input
          type="text"
          placeholder="Search shipments..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ padding: '8px', flex: 1 }}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: '8px' }}
        >
          <option value="">All Statuses</option>
          <option value="label-created">Label Created</option>
          <option value="in-transit">In Transit</option>
          <option value="delivered">Delivered</option>
          <option value="unknown">Unknown</option>
        </select>
        <button onClick={loadShipments}>Refresh</button>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '20px' }}>
        <div style={{ padding: '10px', border: '1px solid #ccc', textAlign: 'center' }}>
          <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{filteredShipments.length}</div>
          <div>Total Shown</div>
        </div>
        {/* Add more summary stats as needed */}
      </div>

      {/* Shipments List */}
      <div style={{ display: 'grid', gap: '10px' }}>
        {filteredShipments.map(shipment => (
          <div key={shipment.id} style={{ border: '1px solid #ccc', padding: '10px', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>
                  {shipment.trackingNumber || shipment.tracking || 'No Tracking'}
                </div>
                <div style={{ fontSize: '12px', color: '#666' }}>
                  {formatDate(shipment.shippedAt || shipment.createdAt)}
                </div>
              </div>
              <div style={{
                padding: '4px 10px',
                borderRadius: '999px',
                fontSize: '12px',
                fontWeight: 'bold',
                background: shipment.status === 'delivered' ? '#4CAF50' : '#2196F3',
                color: 'white'
              }}>
                {shipment.status || 'unknown'}
              </div>
            </div>

            <div style={{ marginTop: '10px' }}>
              <div><strong>Customer:</strong> {shipment.customerName || '—'}</div>
              <div><strong>Order:</strong> {shipment.orderNumber || '—'}</div>
              {trackingLink(shipment.trackingNumber) && (
                <div style={{ marginTop: '10px' }}>
                  <a href={trackingLink(shipment.trackingNumber)} target="_blank" rel="noopener noreferrer">
                    View UPS Tracking
                  </a>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {filteredShipments.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          No shipments found
        </div>
      )}
    </div>
  );
};

export default Shipments;