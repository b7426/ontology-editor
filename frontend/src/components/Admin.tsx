import { useState, useEffect } from 'react';
import { API_URL, apiHeaders } from '../utils/api';
import type { User } from '../types';

interface AdminProps {
  adminUser: string;
}

export default function Admin({ adminUser }: AdminProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [newUser, setNewUser] = useState({ username: '', password: '', is_admin: false });
  const [editPassword, setEditPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const response = await fetch(`${API_URL}/users`, { headers: apiHeaders(true, adminUser) });
      const data = await response.json();
      setUsers(data.users || []);
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    setError('');
    if (!newUser.username.trim() || !newUser.password.trim()) {
      setError('Username and password are required');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/users`, {
        method: 'POST',
        headers: apiHeaders(true, adminUser),
        body: JSON.stringify(newUser),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.detail || 'Failed to create user');
        return;
      }

      setNewUser({ username: '', password: '', is_admin: false });
      setShowCreateDialog(false);
      loadUsers();
    } catch (err) {
      setError('Failed to create user');
    }
  };

  const handleUpdate = async () => {
    if (!editingUser) return;
    setError('');

    try {
      const updateData: { is_admin?: boolean; archived?: boolean; password?: string } = {
        is_admin: editingUser.is_admin,
        archived: editingUser.archived,
      };

      if (editPassword.trim()) {
        updateData.password = editPassword;
      }

      const response = await fetch(`${API_URL}/users/${editingUser.username}`, {
        method: 'PUT',
        headers: apiHeaders(true, adminUser),
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.detail || 'Failed to update user');
        return;
      }

      setEditingUser(null);
      setEditPassword('');
      loadUsers();
    } catch (err) {
      setError('Failed to update user');
    }
  };

  const handleArchive = async (username: string, archive: boolean) => {
    try {
      await fetch(`${API_URL}/users/${username}`, {
        method: 'PUT',
        headers: apiHeaders(true, adminUser),
        body: JSON.stringify({ archived: archive }),
      });
      loadUsers();
    } catch (err) {
      console.error('Failed to archive user:', err);
    }
  };

  const handleDelete = async (username: string) => {
    if (!confirm(`Delete user "${username}"? This will also delete all their ontologies. This cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/users/${username}`, {
        method: 'DELETE',
        headers: apiHeaders(true, adminUser),
      });

      if (!response.ok) {
        const data = await response.json();
        alert(data.detail || 'Failed to delete user');
        return;
      }

      loadUsers();
    } catch (err) {
      console.error('Failed to delete user:', err);
    }
  };

  const formatDate = (isoString: string | null) => {
    if (!isoString) return 'N/A';
    const date = new Date(isoString);
    return date.toLocaleDateString();
  };

  const inputStyle = {
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    width: '100%',
    boxSizing: 'border-box' as const,
  };

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'auto', padding: '32px', backgroundColor: '#f8fafc' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#1e293b', margin: 0 }}>User Management</h2>
          <button
            onClick={() => setShowCreateDialog(true)}
            style={{
              padding: '10px 20px',
              backgroundColor: '#6366f1',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
            }}
          >
            + Create User
          </button>
        </div>

        {/* Create User Dialog */}
        {showCreateDialog && (
          <div style={{
            backgroundColor: 'white',
            padding: '24px',
            borderRadius: '8px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            marginBottom: '24px',
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', color: '#1e293b' }}>Create New User</h3>
            {error && (
              <div style={{ marginBottom: '16px', padding: '10px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#dc2626', fontSize: '14px' }}>
                {error}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 500, color: '#374151' }}>Username</label>
                <input
                  type="text"
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                  placeholder="username"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 500, color: '#374151' }}>Password</label>
                <input
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  placeholder="password"
                  style={inputStyle}
                />
              </div>
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={newUser.is_admin}
                  onChange={(e) => setNewUser({ ...newUser, is_admin: e.target.checked })}
                />
                <span style={{ fontSize: '14px', color: '#374151' }}>Admin privileges</span>
              </label>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={handleCreate}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#6366f1',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                Create
              </button>
              <button
                onClick={() => { setShowCreateDialog(false); setNewUser({ username: '', password: '', is_admin: false }); setError(''); }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'transparent',
                  color: '#6b7280',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Edit User Dialog */}
        {editingUser && (
          <div style={{
            backgroundColor: 'white',
            padding: '24px',
            borderRadius: '8px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            marginBottom: '24px',
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', color: '#1e293b' }}>Edit User: {editingUser.username}</h3>
            {error && (
              <div style={{ marginBottom: '16px', padding: '10px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#dc2626', fontSize: '14px' }}>
                {error}
              </div>
            )}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 500, color: '#374151' }}>New Password (leave blank to keep current)</label>
              <input
                type="password"
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
                placeholder="New password"
                style={{ ...inputStyle, maxWidth: '300px' }}
              />
            </div>
            <div style={{ marginBottom: '16px', display: 'flex', gap: '24px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={editingUser.is_admin}
                  onChange={(e) => setEditingUser({ ...editingUser, is_admin: e.target.checked })}
                  disabled={editingUser.username === 'admin'}
                />
                <span style={{ fontSize: '14px', color: '#374151' }}>Admin privileges</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={editingUser.archived}
                  onChange={(e) => setEditingUser({ ...editingUser, archived: e.target.checked })}
                  disabled={editingUser.username === 'admin'}
                />
                <span style={{ fontSize: '14px', color: '#374151' }}>Archived</span>
              </label>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={handleUpdate}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#6366f1',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                Save Changes
              </button>
              <button
                onClick={() => { setEditingUser(null); setEditPassword(''); setError(''); }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'transparent',
                  color: '#6b7280',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Users Table */}
        <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
              Loading users...
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Username</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: '#374151', width: '100px' }}>Admin</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: '#374151', width: '100px' }}>Status</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#374151', width: '120px' }}>Created</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: '#374151', width: '200px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.username} style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: user.archived ? '#f8fafc' : 'transparent' }}>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ fontWeight: 500, color: user.archived ? '#9ca3af' : '#1e293b' }}>{user.username}</span>
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                      {user.is_admin && (
                        <span style={{
                          fontSize: '11px',
                          backgroundColor: '#6366f1',
                          color: 'white',
                          padding: '2px 8px',
                          borderRadius: '4px',
                        }}>
                          Admin
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                      <span style={{
                        fontSize: '11px',
                        backgroundColor: user.archived ? '#fecaca' : '#bbf7d0',
                        color: user.archived ? '#dc2626' : '#16a34a',
                        padding: '2px 8px',
                        borderRadius: '4px',
                      }}>
                        {user.archived ? 'Archived' : 'Active'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', color: '#64748b', fontSize: '14px' }}>
                      {formatDate(user.created_at)}
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => setEditingUser({ ...user })}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: 'transparent',
                            color: '#6366f1',
                            border: '1px solid #c7d2fe',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '13px',
                          }}
                        >
                          Edit
                        </button>
                        {user.username !== 'admin' && (
                          <>
                            <button
                              onClick={() => handleArchive(user.username, !user.archived)}
                              style={{
                                padding: '6px 12px',
                                backgroundColor: 'transparent',
                                color: user.archived ? '#16a34a' : '#f59e0b',
                                border: `1px solid ${user.archived ? '#bbf7d0' : '#fde68a'}`,
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '13px',
                              }}
                            >
                              {user.archived ? 'Restore' : 'Archive'}
                            </button>
                            <button
                              onClick={() => handleDelete(user.username)}
                              style={{
                                padding: '6px 12px',
                                backgroundColor: 'transparent',
                                color: '#ef4444',
                                border: '1px solid #fecaca',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '13px',
                              }}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
