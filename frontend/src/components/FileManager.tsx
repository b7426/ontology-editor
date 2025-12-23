import { useState, useEffect, useRef } from 'react';
import { API_URL, apiHeaders } from '../utils/api';
import type { OntologyMeta } from '../types';

interface FileManagerProps {
  username: string;
  currentOntologyId: string | null;
  onSelectOntology: (ontology: OntologyMeta) => void;
  onCreateOntology: (ontology: OntologyMeta) => void;
}

export default function FileManager({ username, currentOntologyId, onSelectOntology, onCreateOntology }: FileManagerProps) {
  const [ontologies, setOntologies] = useState<OntologyMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [importMode, setImportMode] = useState(false);
  const [importError, setImportError] = useState('');
  const [jsonldContent, setJsonldContent] = useState<object | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadOntologies();
  }, [username]);

  const loadOntologies = async () => {
    try {
      const response = await fetch(`${API_URL}/ontologies/${username}`, {
        headers: apiHeaders(),
      });
      const data = await response.json();
      setOntologies(data.ontologies || []);
    } catch (error) {
      console.error('Failed to load ontologies:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;

    setCreating(true);
    try {
      const response = await fetch(`${API_URL}/ontologies/${username}`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await response.json();
      if (data.ontology) {
        setOntologies([...ontologies, data.ontology]);
        onCreateOntology(data.ontology);
        setNewName('');
        setShowNewDialog(false);
      }
    } catch (error) {
      console.error('Failed to create ontology:', error);
    } finally {
      setCreating(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportError('');
    setJsonldContent(null);

    try {
      const text = await file.text();
      const json = JSON.parse(text);

      // Validate JSON-LD (must have @context)
      if (!json['@context']) {
        setImportError('Invalid JSON-LD: Missing @context');
        return;
      }

      setJsonldContent(json);
      // Auto-fill name from file or ontology name
      if (!newName) {
        const ontologyName = json.name || json['rdfs:label'] || file.name.replace(/\.(jsonld|json)$/i, '');
        setNewName(ontologyName);
      }
    } catch {
      setImportError('Invalid JSON file');
    }
  };

  const handleImport = async () => {
    if (!newName.trim() || !jsonldContent) return;

    setCreating(true);
    setImportError('');
    try {
      const response = await fetch(`${API_URL}/ontologies/${username}/import`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ name: newName.trim(), jsonld: jsonldContent }),
      });
      const data = await response.json();

      if (!response.ok) {
        setImportError(data.detail || 'Import failed');
        return;
      }

      if (data.ontology) {
        setOntologies([...ontologies, data.ontology]);
        onCreateOntology(data.ontology);
        resetDialog();
      }
    } catch (error) {
      console.error('Failed to import ontology:', error);
      setImportError('Failed to import ontology');
    } finally {
      setCreating(false);
    }
  };

  const resetDialog = () => {
    setShowNewDialog(false);
    setNewName('');
    setImportMode(false);
    setImportError('');
    setJsonldContent(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (ontologyId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this ontology?')) return;

    try {
      await fetch(`${API_URL}/ontologies/${username}/${ontologyId}`, {
        method: 'DELETE',
        headers: apiHeaders(),
      });
      setOntologies(ontologies.filter(o => o.id !== ontologyId));
    } catch (error) {
      console.error('Failed to delete ontology:', error);
    }
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'auto', padding: '32px', backgroundColor: '#f8fafc' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#1e293b', margin: 0 }}>My Ontologies</h2>
          <button
            onClick={() => setShowNewDialog(true)}
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
            + New Ontology
          </button>
        </div>

        {/* New Ontology Dialog */}
        {showNewDialog && (
          <div style={{
            backgroundColor: 'white',
            padding: '24px',
            borderRadius: '8px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            marginBottom: '24px',
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', color: '#1e293b' }}>
              {importMode ? 'Import from JSON-LD' : 'Create New Ontology'}
            </h3>

            {/* Mode toggle */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <button
                onClick={() => setImportMode(false)}
                style={{
                  padding: '6px 12px',
                  backgroundColor: !importMode ? '#6366f1' : 'transparent',
                  color: !importMode ? 'white' : '#6b7280',
                  border: !importMode ? 'none' : '1px solid #d1d5db',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                Blank
              </button>
              <button
                onClick={() => setImportMode(true)}
                style={{
                  padding: '6px 12px',
                  backgroundColor: importMode ? '#6366f1' : 'transparent',
                  color: importMode ? 'white' : '#6b7280',
                  border: importMode ? 'none' : '1px solid #d1d5db',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                Import JSON-LD
              </button>
            </div>

            {/* Error message */}
            {importError && (
              <div style={{
                padding: '10px',
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '6px',
                color: '#dc2626',
                fontSize: '14px',
                marginBottom: '16px',
              }}>
                {importError}
              </div>
            )}

            {/* Import file input */}
            {importMode && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 500, color: '#374151' }}>
                  Select JSON-LD File
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".jsonld,.json"
                  onChange={handleFileSelect}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                  }}
                />
                {jsonldContent && (
                  <div style={{
                    marginTop: '8px',
                    padding: '8px',
                    backgroundColor: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: '4px',
                    color: '#16a34a',
                    fontSize: '13px',
                  }}>
                    Valid JSON-LD file loaded
                  </div>
                )}
              </div>
            )}

            {/* Name input */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 500, color: '#374151' }}>
                Ontology Name
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ontology name..."
                onKeyDown={(e) => e.key === 'Enter' && (importMode ? handleImport() : handleCreate())}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={importMode ? handleImport : handleCreate}
                disabled={creating || !newName.trim() || (importMode && !jsonldContent)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: creating || !newName.trim() || (importMode && !jsonldContent) ? '#9ca3af' : '#6366f1',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: creating || !newName.trim() || (importMode && !jsonldContent) ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                }}
              >
                {creating ? (importMode ? 'Importing...' : 'Creating...') : (importMode ? 'Import' : 'Create')}
              </button>
              <button
                onClick={resetDialog}
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

        {/* Ontology List */}
        <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
              Loading ontologies...
            </div>
          ) : ontologies.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
              <p style={{ marginBottom: '16px' }}>No ontologies yet.</p>
              <button
                onClick={() => setShowNewDialog(true)}
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
                Create your first ontology
              </button>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Name</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Last Modified</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: '#374151', width: '100px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {ontologies.map((ontology) => (
                  <tr
                    key={ontology.id}
                    onClick={() => onSelectOntology(ontology)}
                    style={{
                      borderBottom: '1px solid #e2e8f0',
                      cursor: 'pointer',
                      backgroundColor: ontology.id === currentOntologyId ? '#f0f9ff' : 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (ontology.id !== currentOntologyId) {
                        e.currentTarget.style.backgroundColor = '#f8fafc';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (ontology.id !== currentOntologyId) {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }
                    }}
                  >
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '20px' }}>&#128209;</span>
                        <span style={{ fontWeight: 500, color: '#1e293b' }}>{ontology.name}</span>
                        {ontology.id === currentOntologyId && (
                          <span style={{
                            fontSize: '11px',
                            backgroundColor: '#6366f1',
                            color: 'white',
                            padding: '2px 8px',
                            borderRadius: '4px',
                          }}>
                            Open
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', color: '#64748b', fontSize: '14px' }}>
                      {formatDate(ontology.updated_at)}
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <button
                        onClick={(e) => handleDelete(ontology.id, e)}
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
