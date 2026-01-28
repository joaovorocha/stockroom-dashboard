import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';

/**
 * TeamManagement Component
 * Manage store team members and their roles
 */
const TeamManagement = () => {
  const { activeStore, user } = useAuth();
  const [team, setTeam] = useState([]);
  const [roleCounts, setRoleCounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);

  const isAdmin = user?.isSuperAdmin || user?.storeAccessRole === 'admin';

  useEffect(() => {
    if (activeStore?.id) {
      fetchTeam();
    }
  }, [activeStore?.id]);

  const fetchTeam = async () => {
    try {
      setLoading(true);
      const response = await axios.get(
        `/api/store-admin/team?store_id=${activeStore.id}`,
        { withCredentials: true }
      );
      if (response.data.success) {
        setTeam(response.data.team);
        setRoleCounts(response.data.roleCounts);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load team');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRole = async (userId, newRole) => {
    try {
      await axios.put(
        `/api/store-admin/team/${userId}/role?store_id=${activeStore.id}`,
        { access_role: newRole },
        { withCredentials: true }
      );
      fetchTeam();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update role');
    }
  };

  const handleRemoveMember = async (userId, name) => {
    if (!confirm(`Remove ${name} from this store's team?`)) return;
    
    try {
      await axios.delete(
        `/api/store-admin/team/${userId}?store_id=${activeStore.id}`,
        { withCredentials: true }
      );
      fetchTeam();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to remove team member');
    }
  };

  // Filter team
  const filteredTeam = team.filter(member => {
    const matchesSearch = 
      member.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'all' || member.access_role === roleFilter;
    return matchesSearch && matchesRole;
  });

  if (loading) {
    return <div className="admin-loading">Loading team...</div>;
  }

  if (error) {
    return (
      <div className="admin-error">
        <h2>Error</h2>
        <p>{error}</p>
        <button onClick={fetchTeam}>Retry</button>
      </div>
    );
  }

  return (
    <div className="team-management">
      <div className="admin-header" style={{ marginBottom: '30px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 600 }}>👥 Team Management</h1>
            <p style={{ margin: '5px 0 0', color: '#666' }}>
              {team.length} team members at {activeStore?.name}
            </p>
          </div>
          {isAdmin && (
            <button 
              onClick={() => setShowInviteModal(true)}
              style={primaryButtonStyle}
            >
              ➕ Add Team Member
            </button>
          )}
        </div>
      </div>

      {/* Role Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: '15px',
        marginBottom: '20px'
      }}>
        {roleCounts.map(rc => (
          <div key={rc.access_role} style={{
            ...cardStyle,
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            cursor: 'pointer',
            border: roleFilter === rc.access_role ? '2px solid #4CAF50' : '2px solid transparent'
          }}
          onClick={() => setRoleFilter(roleFilter === rc.access_role ? 'all' : rc.access_role)}
          >
            <RoleBadge role={rc.access_role} large />
            <div>
              <div style={{ fontSize: '24px', fontWeight: 700 }}>{rc.count}</div>
              <div style={{ fontSize: '12px', color: '#666' }}>{formatRole(rc.access_role)}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="admin-card" style={{ ...cardStyle, marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <input
              type="text"
              placeholder="Search team members..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div style={{ minWidth: '150px' }}>
            <select 
              value={roleFilter} 
              onChange={(e) => setRoleFilter(e.target.value)}
              style={inputStyle}
            >
              <option value="all">All Roles</option>
              <option value="admin">Administrators</option>
              <option value="manager">Managers</option>
              <option value="user">Team Members</option>
            </select>
          </div>
        </div>
      </div>

      {/* Team Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: '15px'
      }}>
        {filteredTeam.map(member => (
          <TeamMemberCard
            key={member.id}
            member={member}
            isAdmin={isAdmin}
            currentUserId={user?.id}
            onUpdateRole={handleUpdateRole}
            onRemove={handleRemoveMember}
            onViewDetails={() => setSelectedMember(member)}
          />
        ))}
      </div>

      {filteredTeam.length === 0 && (
        <div className="admin-card" style={{ ...cardStyle, textAlign: 'center', padding: '40px' }}>
          <p style={{ color: '#666' }}>No team members match your search</p>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <InviteModal
          storeId={activeStore.id}
          onClose={() => setShowInviteModal(false)}
          onSuccess={() => {
            setShowInviteModal(false);
            fetchTeam();
          }}
        />
      )}

      {/* Member Detail Modal */}
      {selectedMember && (
        <MemberDetailModal
          member={selectedMember}
          isAdmin={isAdmin}
          onClose={() => setSelectedMember(null)}
          onUpdateRole={handleUpdateRole}
        />
      )}
    </div>
  );
};

/**
 * Team Member Card
 */
const TeamMemberCard = ({ member, isAdmin, currentUserId, onUpdateRole, onRemove, onViewDetails }) => {
  const isCurrentUser = member.id === currentUserId;
  
  return (
    <div 
      style={{
        ...cardStyle,
        cursor: 'pointer',
        transition: 'transform 0.2s, box-shadow 0.2s'
      }}
      onClick={onViewDetails}
      onMouseOver={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)';
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
      }}
    >
      <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-start' }}>
        {/* Avatar */}
        <div style={{
          width: '50px',
          height: '50px',
          borderRadius: '50%',
          background: member.image_url ? `url(${member.image_url}) center/cover` : getAvatarColor(member.name),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontWeight: 600,
          fontSize: '18px',
          flexShrink: 0
        }}>
          {!member.image_url && getInitials(member.name)}
        </div>
        
        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>
              {member.name}
              {isCurrentUser && <span style={{ color: '#999', fontWeight: 400 }}> (You)</span>}
            </h4>
          </div>
          <div style={{ fontSize: '13px', color: '#666', marginTop: '2px' }}>{member.email}</div>
          {member.role_title && (
            <div style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>{member.role_title}</div>
          )}
          
          <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <RoleBadge role={member.access_role} />
            <span style={{ fontSize: '12px', color: '#666' }}>{formatRole(member.access_role)}</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      {isAdmin && !isCurrentUser && (
        <div style={{ 
          marginTop: '15px', 
          paddingTop: '15px', 
          borderTop: '1px solid #eee',
          display: 'flex',
          gap: '8px'
        }}
        onClick={(e) => e.stopPropagation()}
        >
          <select
            value={member.access_role}
            onChange={(e) => onUpdateRole(member.id, e.target.value)}
            style={{ ...inputStyle, flex: 1, fontSize: '12px', padding: '6px 8px' }}
          >
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="user">User</option>
          </select>
          <button
            onClick={() => onRemove(member.id, member.name)}
            style={{
              padding: '6px 12px',
              background: '#ffebee',
              color: '#c62828',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
};

/**
 * Role Badge Component
 */
const RoleBadge = ({ role, large }) => {
  const config = {
    admin: { color: '#4CAF50', bg: '#e8f5e9', icon: '⭐' },
    manager: { color: '#2196F3', bg: '#e3f2fd', icon: '👔' },
    user: { color: '#9e9e9e', bg: '#f5f5f5', icon: '👤' }
  };
  
  const { color, bg, icon } = config[role] || config.user;
  
  return (
    <span style={{
      background: bg,
      color: color,
      padding: large ? '8px 12px' : '4px 8px',
      borderRadius: large ? '8px' : '12px',
      fontSize: large ? '16px' : '12px',
      fontWeight: 500,
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px'
    }}>
      {icon}
    </span>
  );
};

/**
 * Invite Modal
 */
const InviteModal = ({ storeId, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    email: '',
    access_role: 'user'
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      setSubmitting(true);
      setError(null);
      
      await axios.post(
        `/api/store-admin/team/invite?store_id=${storeId}`,
        formData,
        { withCredentials: true }
      );
      
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add team member');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={modalOverlayStyle}>
      <div style={{ ...modalStyle, maxWidth: '450px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0 }}>➕ Add Team Member</h2>
          <button onClick={onClose} style={closeButtonStyle}>✕</button>
        </div>

        {error && (
          <div style={{ background: '#ffebee', color: '#c62828', padding: '10px', borderRadius: '6px', marginBottom: '15px' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '15px' }}>
            <label style={labelStyle}>User Email *</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="Enter user's email address"
              style={inputStyle}
              required
            />
            <small style={{ color: '#666', fontSize: '12px' }}>
              User must already have an account in the system
            </small>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>Role</label>
            <select
              value={formData.access_role}
              onChange={(e) => setFormData({ ...formData, access_role: e.target.value })}
              style={inputStyle}
            >
              <option value="user">Team Member - Basic access</option>
              <option value="manager">Manager - Can view reports</option>
              <option value="admin">Admin - Full store control</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={secondaryButtonStyle}>
              Cancel
            </button>
            <button type="submit" disabled={submitting} style={primaryButtonStyle}>
              {submitting ? 'Adding...' : 'Add to Team'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/**
 * Member Detail Modal
 */
const MemberDetailModal = ({ member, isAdmin, onClose, onUpdateRole }) => {
  return (
    <div style={modalOverlayStyle}>
      <div style={{ ...modalStyle, maxWidth: '500px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
            <div style={{
              width: '60px',
              height: '60px',
              borderRadius: '50%',
              background: member.image_url ? `url(${member.image_url}) center/cover` : getAvatarColor(member.name),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontWeight: 600,
              fontSize: '22px'
            }}>
              {!member.image_url && getInitials(member.name)}
            </div>
            <div>
              <h2 style={{ margin: 0 }}>{member.name}</h2>
              <div style={{ color: '#666', fontSize: '14px' }}>{member.email}</div>
            </div>
          </div>
          <button onClick={onClose} style={closeButtonStyle}>✕</button>
        </div>

        <div style={{ background: '#f9f9f9', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <InfoRow label="ID Number" value={member.id_number || 'N/A'} />
            <InfoRow label="Role Title" value={member.role_title || 'N/A'} />
            <InfoRow label="Access Level" value={formatRole(member.access_role)} />
            <InfoRow label="Joined" value={formatDate(member.granted_at)} />
            <InfoRow label="Last Login" value={member.last_login ? formatDate(member.last_login) : 'Never'} />
            {member.granted_by_name && (
              <InfoRow label="Added By" value={member.granted_by_name} />
            )}
          </div>
        </div>

        {isAdmin && (
          <div>
            <label style={labelStyle}>Change Role</label>
            <select
              value={member.access_role}
              onChange={(e) => {
                onUpdateRole(member.id, e.target.value);
                onClose();
              }}
              style={inputStyle}
            >
              <option value="admin">Administrator</option>
              <option value="manager">Manager</option>
              <option value="user">Team Member</option>
            </select>
          </div>
        )}
      </div>
    </div>
  );
};

const InfoRow = ({ label, value }) => (
  <div>
    <div style={{ fontSize: '11px', color: '#666', marginBottom: '2px' }}>{label}</div>
    <div style={{ fontWeight: 500 }}>{value}</div>
  </div>
);

// Helper functions
const getInitials = (name) => {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
};

const getAvatarColor = (name) => {
  const colors = ['#4CAF50', '#2196F3', '#9C27B0', '#FF9800', '#E91E63', '#00BCD4'];
  const index = name ? name.charCodeAt(0) % colors.length : 0;
  return colors[index];
};

const formatRole = (role) => {
  const map = {
    admin: 'Administrator',
    manager: 'Manager',
    user: 'Team Member'
  };
  return map[role] || role;
};

const formatDate = (date) => {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

// Styles
const cardStyle = {
  background: 'white',
  borderRadius: '12px',
  padding: '20px',
  boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
};

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #ddd',
  borderRadius: '8px',
  fontSize: '14px',
  boxSizing: 'border-box'
};

const labelStyle = {
  display: 'block',
  marginBottom: '6px',
  fontSize: '13px',
  fontWeight: 500,
  color: '#333'
};

const primaryButtonStyle = {
  padding: '10px 20px',
  background: '#4CAF50',
  color: 'white',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '14px',
  fontWeight: 500
};

const secondaryButtonStyle = {
  padding: '10px 20px',
  background: '#f5f5f5',
  color: '#333',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '14px'
};

const modalOverlayStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000
};

const modalStyle = {
  background: 'white',
  borderRadius: '12px',
  padding: '25px',
  width: '90%',
  maxHeight: '90vh',
  overflowY: 'auto'
};

const closeButtonStyle = {
  background: 'none',
  border: 'none',
  fontSize: '20px',
  cursor: 'pointer',
  color: '#666'
};

export default TeamManagement;
