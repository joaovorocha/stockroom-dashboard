import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';

/**
 * SupportTickets Component
 * Support ticket management system for Super Admins
 */
const SupportTickets = () => {
  const [searchParams] = useSearchParams();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    fetchTickets();
  }, [statusFilter, priorityFilter]);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (priorityFilter !== 'all') params.append('priority', priorityFilter);
      
      const response = await axios.get(`/api/super-admin/tickets?${params}`, { withCredentials: true });
      if (response.data.success) {
        setTickets(response.data.tickets);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load tickets');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (ticketId, newStatus) => {
    try {
      await axios.put(
        `/api/super-admin/tickets/${ticketId}`,
        { status: newStatus },
        { withCredentials: true }
      );
      fetchTickets();
      if (selectedTicket?.id === ticketId) {
        setSelectedTicket(prev => ({ ...prev, status: newStatus }));
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update ticket');
    }
  };

  // Stats
  const stats = {
    total: tickets.length,
    open: tickets.filter(t => t.status === 'open').length,
    inProgress: tickets.filter(t => t.status === 'in_progress').length,
    urgent: tickets.filter(t => t.priority === 'urgent').length
  };

  if (loading && tickets.length === 0) {
    return <div className="admin-loading">Loading tickets...</div>;
  }

  return (
    <div className="support-tickets">
      <div className="admin-header" style={{ marginBottom: '30px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 600 }}>🎫 Support Tickets</h1>
            <p style={{ margin: '5px 0 0', color: '#666' }}>
              Manage support requests from all stores
            </p>
          </div>
          <button 
            onClick={() => setShowCreateModal(true)}
            style={primaryButtonStyle}
          >
            ➕ Create Ticket
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: '15px',
        marginBottom: '20px'
      }}>
        <StatCard label="Total Tickets" value={stats.total} icon="📊" />
        <StatCard label="Open" value={stats.open} icon="📬" color="#FF9800" />
        <StatCard label="In Progress" value={stats.inProgress} icon="🔄" color="#2196F3" />
        <StatCard label="Urgent" value={stats.urgent} icon="🔴" color="#f44336" />
      </div>

      {/* Filters */}
      <div className="admin-card" style={{ ...cardStyle, marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
          <div>
            <label style={{ marginRight: '10px', fontSize: '13px', color: '#666' }}>Status:</label>
            <select 
              value={statusFilter} 
              onChange={(e) => setStatusFilter(e.target.value)}
              style={selectStyle}
            >
              <option value="all">All Status</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div>
            <label style={{ marginRight: '10px', fontSize: '13px', color: '#666' }}>Priority:</label>
            <select 
              value={priorityFilter} 
              onChange={(e) => setPriorityFilter(e.target.value)}
              style={selectStyle}
            >
              <option value="all">All Priority</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: '#ffebee', color: '#c62828', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
          {error}
          <button onClick={fetchTickets} style={{ marginLeft: '15px', cursor: 'pointer' }}>Retry</button>
        </div>
      )}

      {/* Tickets List */}
      <div className="admin-card" style={cardStyle}>
        {tickets.length > 0 ? (
          <div>
            {tickets.map(ticket => (
              <TicketRow 
                key={ticket.id} 
                ticket={ticket}
                onClick={() => setSelectedTicket(ticket)}
                onUpdateStatus={handleUpdateStatus}
              />
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
            <div style={{ fontSize: '48px', marginBottom: '15px' }}>🎉</div>
            <p>No tickets match your filters</p>
          </div>
        )}
      </div>

      {/* Ticket Detail Modal */}
      {selectedTicket && (
        <TicketDetailModal
          ticket={selectedTicket}
          onClose={() => setSelectedTicket(null)}
          onUpdate={fetchTickets}
          onUpdateStatus={handleUpdateStatus}
        />
      )}

      {/* Create Ticket Modal */}
      {showCreateModal && (
        <CreateTicketModal
          onClose={() => setShowCreateModal(false)}
          onCreate={fetchTickets}
        />
      )}
    </div>
  );
};

/**
 * Stat Card Component
 */
const StatCard = ({ label, value, icon, color }) => (
  <div style={{
    ...cardStyle,
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  }}>
    <div style={{ fontSize: '24px' }}>{icon}</div>
    <div>
      <div style={{ fontSize: '24px', fontWeight: 700, color: color || '#333' }}>{value}</div>
      <div style={{ fontSize: '12px', color: '#666' }}>{label}</div>
    </div>
  </div>
);

/**
 * Ticket Row Component
 */
const TicketRow = ({ ticket, onClick, onUpdateStatus }) => (
  <div 
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '15px',
      borderBottom: '1px solid #eee',
      cursor: 'pointer',
      transition: 'background 0.2s'
    }}
    onClick={onClick}
    onMouseOver={(e) => e.currentTarget.style.background = '#f9f9f9'}
    onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
  >
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
        <PriorityBadge priority={ticket.priority} />
        <span style={{ fontWeight: 500 }}>{ticket.subject}</span>
        <span style={{ fontSize: '11px', color: '#999' }}>#{ticket.id}</span>
      </div>
      <div style={{ fontSize: '12px', color: '#666' }}>
        {ticket.store_name && <span>🏪 {ticket.store_name} • </span>}
        <span>👤 {ticket.created_by_name || 'Unknown'}</span>
        <span> • {formatTimeAgo(ticket.created_at)}</span>
      </div>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <StatusBadge status={ticket.status} />
      <select
        value={ticket.status}
        onChange={(e) => {
          e.stopPropagation();
          onUpdateStatus(ticket.id, e.target.value);
        }}
        onClick={(e) => e.stopPropagation()}
        style={{
          padding: '4px 8px',
          border: '1px solid #ddd',
          borderRadius: '4px',
          fontSize: '12px',
          cursor: 'pointer'
        }}
      >
        <option value="open">Open</option>
        <option value="in_progress">In Progress</option>
        <option value="resolved">Resolved</option>
        <option value="closed">Closed</option>
      </select>
    </div>
  </div>
);

/**
 * Ticket Detail Modal
 */
const TicketDetailModal = ({ ticket, onClose, onUpdate, onUpdateStatus }) => {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchComments();
  }, [ticket.id]);

  const fetchComments = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/super-admin/tickets/${ticket.id}`, { withCredentials: true });
      if (response.data.success) {
        setComments(response.data.ticket.comments || []);
      }
    } catch (err) {
      console.error('Failed to load comments:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    
    try {
      setSubmitting(true);
      await axios.post(
        `/api/super-admin/tickets/${ticket.id}/comments`,
        { content: newComment },
        { withCredentials: true }
      );
      setNewComment('');
      await fetchComments();
      onUpdate();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add comment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={modalOverlayStyle}>
      <div style={{ ...modalStyle, maxWidth: '700px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <PriorityBadge priority={ticket.priority} />
              <h2 style={{ margin: 0 }}>{ticket.subject}</h2>
            </div>
            <div style={{ fontSize: '13px', color: '#666' }}>
              Ticket #{ticket.id} • Created {formatDate(ticket.created_at)}
            </div>
          </div>
          <button onClick={onClose} style={closeButtonStyle}>✕</button>
        </div>

        {/* Ticket Info */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', 
          gap: '15px',
          background: '#f9f9f9',
          padding: '15px',
          borderRadius: '8px',
          marginBottom: '20px'
        }}>
          <div>
            <div style={{ fontSize: '11px', color: '#666', marginBottom: '3px' }}>Status</div>
            <select
              value={ticket.status}
              onChange={(e) => onUpdateStatus(ticket.id, e.target.value)}
              style={{ ...selectStyle, width: '100%' }}
            >
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#666', marginBottom: '3px' }}>Priority</div>
            <PriorityBadge priority={ticket.priority} large />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#666', marginBottom: '3px' }}>Store</div>
            <div style={{ fontWeight: 500 }}>{ticket.store_name || 'Global'}</div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#666', marginBottom: '3px' }}>Created By</div>
            <div style={{ fontWeight: 500 }}>{ticket.created_by_name || 'Unknown'}</div>
          </div>
        </div>

        {/* Description */}
        <div style={{ marginBottom: '25px' }}>
          <h4 style={{ margin: '0 0 10px' }}>Description</h4>
          <div style={{ 
            background: '#fff',
            border: '1px solid #eee',
            padding: '15px',
            borderRadius: '8px',
            whiteSpace: 'pre-wrap'
          }}>
            {ticket.description || 'No description provided.'}
          </div>
        </div>

        {/* Comments */}
        <div>
          <h4 style={{ margin: '0 0 15px' }}>💬 Comments ({comments.length})</h4>
          
          {loading ? (
            <p>Loading comments...</p>
          ) : (
            <div style={{ maxHeight: '250px', overflowY: 'auto', marginBottom: '15px' }}>
              {comments.length > 0 ? (
                comments.map((comment, index) => (
                  <div key={index} style={{
                    background: '#f9f9f9',
                    padding: '12px',
                    borderRadius: '8px',
                    marginBottom: '10px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontWeight: 500 }}>{comment.user_name || 'Unknown'}</span>
                      <span style={{ fontSize: '11px', color: '#999' }}>{formatTimeAgo(comment.created_at)}</span>
                    </div>
                    <div style={{ fontSize: '14px', whiteSpace: 'pre-wrap' }}>{comment.content}</div>
                  </div>
                ))
              ) : (
                <p style={{ color: '#666', textAlign: 'center' }}>No comments yet</p>
              )}
            </div>
          )}

          {/* Add Comment */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment..."
              style={{
                flex: 1,
                padding: '12px',
                border: '1px solid #ddd',
                borderRadius: '8px',
                resize: 'vertical',
                minHeight: '60px',
                fontSize: '14px'
              }}
            />
            <button
              onClick={handleAddComment}
              disabled={submitting || !newComment.trim()}
              style={{
                ...primaryButtonStyle,
                alignSelf: 'flex-end'
              }}
            >
              {submitting ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Create Ticket Modal
 */
const CreateTicketModal = ({ onClose, onCreate }) => {
  const [formData, setFormData] = useState({
    subject: '',
    description: '',
    priority: 'medium',
    store_id: ''
  });
  const [stores, setStores] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchStores();
  }, []);

  const fetchStores = async () => {
    try {
      const response = await axios.get('/api/super-admin/stores', { withCredentials: true });
      if (response.data.success) {
        setStores(response.data.stores);
      }
    } catch (err) {
      console.error('Failed to load stores:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      setSubmitting(true);
      setError(null);
      
      await axios.post('/api/super-admin/tickets', formData, { withCredentials: true });
      
      onCreate();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create ticket');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={modalOverlayStyle}>
      <div style={{ ...modalStyle, maxWidth: '500px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0 }}>➕ Create Support Ticket</h2>
          <button onClick={onClose} style={closeButtonStyle}>✕</button>
        </div>

        {error && (
          <div style={{ background: '#ffebee', color: '#c62828', padding: '10px', borderRadius: '6px', marginBottom: '15px' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div>
              <label style={labelStyle}>Subject *</label>
              <input
                type="text"
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                style={inputStyle}
                required
              />
            </div>
            <div>
              <label style={labelStyle}>Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                style={{ ...inputStyle, minHeight: '100px', resize: 'vertical' }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div>
                <label style={labelStyle}>Priority</label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                  style={inputStyle}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Store (optional)</label>
                <select
                  value={formData.store_id}
                  onChange={(e) => setFormData({ ...formData, store_id: e.target.value })}
                  style={inputStyle}
                >
                  <option value="">Global / No specific store</option>
                  {stores.map(store => (
                    <option key={store.id} value={store.id}>
                      {store.name} ({store.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div style={{ marginTop: '25px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 20px',
                background: '#f5f5f5',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={primaryButtonStyle}
            >
              {submitting ? 'Creating...' : 'Create Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/**
 * Priority Badge Component
 */
const PriorityBadge = ({ priority, large }) => {
  const config = {
    urgent: { color: '#f44336', bg: '#ffebee', icon: '🔴' },
    high: { color: '#FF9800', bg: '#fff3e0', icon: '🟠' },
    medium: { color: '#2196F3', bg: '#e3f2fd', icon: '🔵' },
    low: { color: '#4CAF50', bg: '#e8f5e9', icon: '🟢' }
  };
  
  const { color, bg, icon } = config[priority] || config.medium;
  
  return (
    <span style={{
      background: bg,
      color: color,
      padding: large ? '6px 12px' : '3px 8px',
      borderRadius: '12px',
      fontSize: large ? '13px' : '11px',
      fontWeight: 500,
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px'
    }}>
      {icon} {priority?.charAt(0).toUpperCase() + priority?.slice(1)}
    </span>
  );
};

/**
 * Status Badge Component
 */
const StatusBadge = ({ status }) => {
  const config = {
    open: { color: '#FF9800', bg: '#fff3e0' },
    in_progress: { color: '#2196F3', bg: '#e3f2fd' },
    resolved: { color: '#4CAF50', bg: '#e8f5e9' },
    closed: { color: '#666', bg: '#f5f5f5' }
  };
  
  const { color, bg } = config[status] || config.open;
  const label = status?.replace('_', ' ').charAt(0).toUpperCase() + status?.slice(1).replace('_', ' ');
  
  return (
    <span style={{
      background: bg,
      color: color,
      padding: '4px 10px',
      borderRadius: '12px',
      fontSize: '11px',
      fontWeight: 500
    }}>
      {label}
    </span>
  );
};

// Helper functions
const formatTimeAgo = (date) => {
  if (!date) return '';
  const now = new Date();
  const d = new Date(date);
  const diff = now - d;
  
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return d.toLocaleDateString();
};

const formatDate = (date) => {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
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

const selectStyle = {
  padding: '8px 12px',
  border: '1px solid #ddd',
  borderRadius: '6px',
  fontSize: '14px'
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

export default SupportTickets;
