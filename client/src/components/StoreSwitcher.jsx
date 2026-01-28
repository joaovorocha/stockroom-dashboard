import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

/**
 * StoreSwitcher Component
 * Displays the current store and allows switching between stores
 * Only visible to users with access to multiple stores
 */
const StoreSwitcher = ({ className = '' }) => {
  const { activeStore, accessibleStores, canSwitchStores, switchStore } = useAuth();
  const [showDropdown, setShowDropdown] = useState(false);
  const [switching, setSwitching] = useState(false);

  // Don't render if user can't switch stores or has only one store
  if (!canSwitchStores || accessibleStores.length <= 1) {
    // Still show current store name if available
    if (activeStore) {
      return (
        <div className={`store-indicator ${className}`}>
          <span className="store-icon">📍</span>
          <span className="store-name">{activeStore.name}</span>
        </div>
      );
    }
    return null;
  }

  const handleStoreSwitch = async (storeId) => {
    if (switching || storeId === activeStore?.id) {
      setShowDropdown(false);
      return;
    }

    setSwitching(true);
    const result = await switchStore(storeId);
    
    if (result.success) {
      // Reload the page to refresh data for new store
      window.location.reload();
    } else {
      alert(result.error || 'Failed to switch store');
    }
    
    setSwitching(false);
    setShowDropdown(false);
  };

  return (
    <div className={`store-switcher ${className}`} style={{ position: 'relative' }}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="store-switcher-button"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          background: 'rgba(255,255,255,0.1)',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: '6px',
          color: 'inherit',
          cursor: 'pointer',
          fontSize: '14px'
        }}
        disabled={switching}
      >
        <span className="store-icon">📍</span>
        <span className="store-name">{activeStore?.name || 'Select Store'}</span>
        <span className="dropdown-arrow" style={{ marginLeft: '4px' }}>
          {showDropdown ? '▲' : '▼'}
        </span>
      </button>

      {showDropdown && (
        <div
          className="store-dropdown"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            minWidth: '200px',
            marginTop: '4px',
            background: 'white',
            border: '1px solid #ddd',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 1000,
            maxHeight: '300px',
            overflowY: 'auto'
          }}
        >
          <div style={{ padding: '8px 12px', borderBottom: '1px solid #eee', color: '#666', fontSize: '12px' }}>
            Switch Store ({accessibleStores.length} available)
          </div>
          {accessibleStores.map((store) => (
            <button
              key={store.store_id}
              onClick={() => handleStoreSwitch(store.store_id)}
              style={{
                display: 'block',
                width: '100%',
                padding: '10px 12px',
                textAlign: 'left',
                background: store.store_id === activeStore?.id ? '#f0f7ff' : 'white',
                border: 'none',
                borderBottom: '1px solid #eee',
                cursor: 'pointer',
                fontSize: '14px',
                color: '#333'
              }}
              disabled={switching}
            >
              <span style={{ marginRight: '8px' }}>
                {store.store_id === activeStore?.id ? '✓' : ''}
              </span>
              <strong>{store.store_name}</strong>
              <span style={{ color: '#666', marginLeft: '8px' }}>({store.store_code})</span>
              {store.access_level === 'admin' && (
                <span style={{ 
                  marginLeft: '8px', 
                  fontSize: '10px', 
                  background: '#e3f2fd', 
                  padding: '2px 6px', 
                  borderRadius: '4px',
                  color: '#1976d2'
                }}>
                  Admin
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Click outside to close */}
      {showDropdown && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 999
          }}
          onClick={() => setShowDropdown(false)}
        />
      )}
    </div>
  );
};

export default StoreSwitcher;
