import { useState, useEffect } from 'react';
import type { Node, Edge } from '../types';
import { API_URL, apiHeaders } from '../utils/api';

interface TriplesViewProps {
  nodes: Node[];
  edges: Edge[];
  selectedKnowledgeGraphId?: string | null;
  ontologyId?: string | null;
  username?: string | null;
  onKnowledgeGraphUpdate?: () => void;
}

interface NodeGroup {
  nodeId: string;
  label: string;
  depth: number;
  properties: { predicate: string; object: string; depth: number; childNodeId?: string }[];
}

function buildHierarchy(nodes: Node[], edges: Edge[]): NodeGroup[] {
  // Build parent -> children map based on subClassOf edges
  const children = new Map<string, string[]>();
  const parents = new Map<string, string>();

  edges.forEach((edge) => {
    const predicate = typeof edge.label === 'string' ? edge.label : '';
    if (predicate === 'subClassOf') {
      const parentId = edge.target;
      const childId = edge.source;
      if (!children.has(parentId)) {
        children.set(parentId, []);
      }
      children.get(parentId)!.push(childId);
      parents.set(childId, parentId);
    }
  });

  // Find root nodes (nodes that are not children of any other node)
  const roots = nodes.filter((n) => !parents.has(n.id));

  // Build ordered list - only root nodes get their own group
  // Child nodes appear as properties of their parents
  const result: NodeGroup[] = [];
  const visited = new Set<string>();

  function collectProperties(nodeId: string, depth: number): { predicate: string; object: string; depth: number; childNodeId?: string }[] {
    const properties: { predicate: string; object: string; depth: number; childNodeId?: string }[] = [];

    // Add non-subClassOf edges where this node is the source
    edges.forEach((edge) => {
      if (edge.source === nodeId) {
        const predicate = typeof edge.label === 'string' ? edge.label : 'relatedTo';
        if (predicate === 'subClassOf') return; // Handle subClassOf separately
        const targetNode = nodes.find((n) => n.id === edge.target);
        if (targetNode) {
          properties.push({
            predicate,
            object: targetNode.data.label || targetNode.id,
            depth,
          });
        }
      }
    });

    // Add children as subClassOf properties, then recursively add their properties
    const nodeChildren = children.get(nodeId) || [];
    nodeChildren.forEach((childId) => {
      if (visited.has(childId)) return;
      visited.add(childId);

      const childNode = nodes.find((n) => n.id === childId);
      if (childNode) {
        const childLabel = childNode.data.label || childNode.id;
        // Add the child as a subClassOf property
        properties.push({
          predicate: 'subClassOf',
          object: childLabel,
          depth,
          childNodeId: childId,
        });
        // Recursively add the child's properties (indented further)
        const childProps = collectProperties(childId, depth + 1);
        properties.push(...childProps);
      }
    });

    return properties;
  }

  // Visit all roots
  roots.forEach((root) => {
    if (visited.has(root.id)) return;
    visited.add(root.id);

    const node = nodes.find((n) => n.id === root.id);
    if (!node) return;

    const label = node.data.label || node.id;
    const properties = collectProperties(root.id, 0);

    result.push({ nodeId: root.id, label, depth: 0, properties });
  });

  // Visit any unvisited nodes (disconnected - treat as roots)
  nodes.forEach((node) => {
    if (!visited.has(node.id)) {
      visited.add(node.id);
      const label = node.data.label || node.id;
      const properties = collectProperties(node.id, 0);
      result.push({ nodeId: node.id, label, depth: 0, properties });
    }
  });

  return result;
}

export default function TriplesView({ nodes, edges, selectedKnowledgeGraphId, ontologyId, username, onKnowledgeGraphUpdate }: TriplesViewProps) {
  const hierarchy = buildHierarchy(nodes, edges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [kgData, setKgData] = useState<Record<string, string[]>>({});
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [relationshipValues, setRelationshipValues] = useState<Record<string, string>>({});

  // Expose save function via window for the save button
  useEffect(() => {
    const handleSave = async () => {
      if (!selectedKnowledgeGraphId || !ontologyId || !username) return;

      // Build instances from all input values
      const instances: Record<string, string[]> = {};
      Object.keys(inputValues).forEach((className) => {
        const values = inputValues[className]
          ?.split(',')
          .map((v) => v.trim())
          .filter((v) => v.length > 0) || [];
        if (values.length > 0) {
          instances[className] = values;
        }
      });

      // Build relationships from relationship values
      const relationships: Record<string, string[]> = {};
      Object.keys(relationshipValues).forEach((key) => {
        const values = relationshipValues[key]
          ?.split(',')
          .map((v) => v.trim())
          .filter((v) => v.length > 0) || [];
        if (values.length > 0) {
          relationships[key] = values;
        }
      });

      try {
        const kgMeta = await fetch(`${API_URL}/knowledge-graphs/${username}/${ontologyId}/${selectedKnowledgeGraphId}`, {
          headers: apiHeaders(),
        }).then((res) => res.json());

        await fetch(`${API_URL}/knowledge-graphs/${username}/${ontologyId}/${selectedKnowledgeGraphId}`, {
          method: 'PUT',
          headers: apiHeaders(),
          body: JSON.stringify({
            id: selectedKnowledgeGraphId,
            name: kgMeta.meta.name,
            data: {
              instances,
              relationships,
            },
          }),
        });

        setKgData(instances);
        if (onKnowledgeGraphUpdate) {
          onKnowledgeGraphUpdate();
        }
      } catch (error) {
        console.error('Failed to save knowledge graph:', error);
        alert('Failed to save knowledge graph');
      }
    };

    (window as any).saveKnowledgeGraph = handleSave;

    return () => {
      delete (window as any).saveKnowledgeGraph;
    };
  }, [inputValues, selectedKnowledgeGraphId, ontologyId, username, onKnowledgeGraphUpdate])

  // Load knowledge graph data when selected
  useEffect(() => {
    if (selectedKnowledgeGraphId && ontologyId && username) {
      fetch(`${API_URL}/knowledge-graphs/${username}/${ontologyId}/${selectedKnowledgeGraphId}`, {
        headers: apiHeaders(),
      })
        .then((res) => res.json())
        .then((data) => {
          const instances = data.data?.instances || {};
          const relationships = data.data?.relationships || {};
          setKgData(instances);
          // Initialize input values with current instances (comma-separated)
          const initialInputs: Record<string, string> = {};
          Object.keys(instances).forEach((className) => {
            initialInputs[className] = Array.isArray(instances[className]) ? instances[className].join(', ') : '';
          });
          setInputValues(initialInputs);
          // Initialize relationship values
          const initialRelationships: Record<string, string> = {};
          Object.keys(relationships).forEach((key) => {
            const relValue = relationships[key];
            if (Array.isArray(relValue)) {
              initialRelationships[key] = relValue.join(', ');
            } else if (typeof relValue === 'string') {
              initialRelationships[key] = relValue;
            }
          });
          setRelationshipValues(initialRelationships);
        })
        .catch((error) => {
          console.error('Failed to load knowledge graph:', error);
          setKgData({});
          setInputValues({});
          setRelationshipValues({});
        });
    } else {
      setKgData({});
      setInputValues({});
      setRelationshipValues({});
    }
  }, [selectedKnowledgeGraphId, ontologyId, username]);

  // Get instances for a given class name
  const getInstancesForClass = (className: string): string[] => {
    return (kgData[className] || []).sort();
  };

  // Check if a target class name is actually a class in the ontology
  const isClassInOntology = (className: string): boolean => {
    return nodes.some(n => (n.data.label || n.id) === className);
  };

  const handleValueChange = (className: string, value: string) => {
    setInputValues((prev) => ({
      ...prev,
      [className]: value,
    }));
  };

  const handleRelationshipChange = (relationshipKey: string, value: string) => {
    setRelationshipValues((prev) => ({
      ...prev,
      [relationshipKey]: value,
    }));
  };

  const handleRelationshipDropdownChange = (relationshipKey: string, _targetClass: string, selectedInstance: string) => {
    const currentValue = relationshipValues[relationshipKey] || '';
    const values = currentValue
      ?.split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0) || [];

    if (!values.includes(selectedInstance)) {
      const newValue = values.length > 0 ? `${currentValue}, ${selectedInstance}` : selectedInstance;
      setRelationshipValues((prev) => ({
        ...prev,
        [relationshipKey]: newValue,
      }));
    }
  };

  const handleRelationshipBlur = async (relationshipKey: string) => {
    if (!selectedKnowledgeGraphId || !ontologyId || !username) return;

    const values = relationshipValues[relationshipKey]
      ?.split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0) || [];

    // Save relationship data
    try {
      const kgMeta = await fetch(`${API_URL}/knowledge-graphs/${username}/${ontologyId}/${selectedKnowledgeGraphId}`, {
        headers: apiHeaders(),
      }).then((res) => res.json());

      const currentData = kgMeta.data || {};
      const relationships = currentData.relationships || {};
      relationships[relationshipKey] = values;

      await fetch(`${API_URL}/knowledge-graphs/${username}/${ontologyId}/${selectedKnowledgeGraphId}`, {
        method: 'PUT',
        headers: apiHeaders(),
        body: JSON.stringify({
          id: selectedKnowledgeGraphId,
          name: kgMeta.meta.name,
          data: {
            instances: kgData,
            relationships: relationships,
          },
        }),
      });

      if (onKnowledgeGraphUpdate) {
        onKnowledgeGraphUpdate();
      }
    } catch (error) {
      console.error('Failed to save relationship:', error);
    }
  };

  const handleValueBlur = async (className: string) => {
    if (!selectedKnowledgeGraphId || !ontologyId || !username) return;

    // Parse comma-separated values
    const values = inputValues[className]
      ?.split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0) || [];

    const newInstances = {
      ...kgData,
      [className]: values,
    };

    setKgData(newInstances);

    // Save to backend - preserve relationships
    try {
      const kgMeta = await fetch(`${API_URL}/knowledge-graphs/${username}/${ontologyId}/${selectedKnowledgeGraphId}`, {
        headers: apiHeaders(),
      }).then((res) => res.json());

      const currentData = kgMeta.data || {};
      const relationships = currentData.relationships || {};

      await fetch(`${API_URL}/knowledge-graphs/${username}/${ontologyId}/${selectedKnowledgeGraphId}`, {
        method: 'PUT',
        headers: apiHeaders(),
        body: JSON.stringify({
          id: selectedKnowledgeGraphId,
          name: kgMeta.meta.name,
          data: {
            instances: newInstances,
            relationships: relationships,
          },
        }),
      });

      if (onKnowledgeGraphUpdate) {
        onKnowledgeGraphUpdate();
      }
    } catch (error) {
      console.error('Failed to save knowledge graph:', error);
    }
  };

  const rows: { subject: string; predicate: string; object: string; depth: number; isFirst: boolean; nodeId?: string; childNodeId?: string }[] = [];

  hierarchy.forEach((group) => {
    // Add the subject row (only for root nodes)
    rows.push({
      subject: group.label,
      predicate: '',
      object: '',
      depth: 0,
      isFirst: true,
      nodeId: group.nodeId,
    });
    // Add property rows with their own depth
    group.properties.forEach((prop) => {
      rows.push({
        subject: group.label,
        predicate: prop.predicate,
        object: prop.object,
        depth: prop.depth,
        isFirst: false,
        childNodeId: prop.childNodeId,
      });
    });
  });

  const selectedNode = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) : null;

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'auto', padding: '20px', position: 'relative' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'monospace' }}>
        <thead>
          <tr style={{ backgroundColor: '#f1f5f9', textAlign: 'left' }}>
            <th style={{ padding: '12px', borderBottom: '2px solid #e2e8f0' }}>Classes &amp; Properties</th>
            {selectedKnowledgeGraphId && (
              <th style={{ padding: '12px', borderBottom: '2px solid #e2e8f0', width: '300px' }}>Instances</th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} style={{ backgroundColor: row.isFirst ? '#ffffff' : '#fafafa' }}>
              <td
                style={{
                  padding: '10px 12px',
                  paddingLeft: `${12 + row.depth * 24}px`,
                  borderBottom: '1px solid #e2e8f0',
                  color: '#6366f1',
                  fontWeight: row.isFirst ? 600 : 400,
                }}
              >
                {row.isFirst ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{row.subject}</span>
                    <button
                      onClick={() => setSelectedNodeId(row.nodeId || null)}
                      style={{
                        background: `url('/info-sign-icon-set-about-us-icon-faq-icon-vector.jpg') no-repeat`,
                        backgroundPosition: '100% 0%',
                        backgroundSize: '200% 200%',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                        display: 'inline-block',
                        width: '18px',
                        height: '18px',
                        borderRadius: '4px',
                        transition: 'opacity 0.2s',
                        opacity: 0.7,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.opacity = '1';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = '0.7';
                      }}
                      title="View node information"
                    />
                  </div>
                ) : (
                  <span>
                    <span style={{ color: '#059669' }}>{row.predicate}</span>
                    {' '}
                    <span style={{ color: '#6366f1' }}>{row.object}</span>
                  </span>
                )}
              </td>
              {selectedKnowledgeGraphId && (
                <td
                  style={{
                    padding: '10px 12px',
                    borderBottom: '1px solid #e2e8f0',
                  }}
                >
                  {row.isFirst ? (
                    <input
                      type="text"
                      value={inputValues[row.subject] || ''}
                      onChange={(e) => handleValueChange(row.subject, e.target.value)}
                      onBlur={() => handleValueBlur(row.subject)}
                      placeholder="Enter instances (comma-separated)..."
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        border: '1px solid #cbd5e1',
                        borderRadius: '4px',
                        fontSize: '13px',
                        fontFamily: 'inherit',
                      }}
                    />
                  ) : (() => {
                    // For subClassOf rows, show instance input for that child class
                    if (row.predicate === 'subClassOf' && row.childNodeId) {
                      const childClass = row.object;
                      return (
                        <input
                          type="text"
                          value={inputValues[childClass] || ''}
                          onChange={(e) => handleValueChange(childClass, e.target.value)}
                          onBlur={() => handleValueBlur(childClass)}
                          placeholder="Enter instances (comma-separated)..."
                          style={{
                            width: '100%',
                            padding: '6px 8px',
                            border: '1px solid #cbd5e1',
                            borderRadius: '4px',
                            fontSize: '13px',
                            fontFamily: 'inherit',
                          }}
                        />
                      );
                    }

                    // For other property rows, check if the object is a class with instances
                    const targetClass = row.object;
                    const relationshipKey = `${row.subject}:${row.predicate}:${targetClass}`;
                    const isClass = isClassInOntology(targetClass);

                    // Only show dropdown if target is a class in the ontology
                    if (!isClass) {
                      return <span style={{ color: '#94a3b8', fontSize: '12px' }}>—</span>;
                    }

                    const availableInstances = getInstancesForClass(targetClass);

                    if (availableInstances.length > 0) {
                      // Get currently selected instances to filter them out
                      const currentSelected = (relationshipValues[relationshipKey] || '')
                        .split(',')
                        .map((v) => v.trim())
                        .filter((v) => v.length > 0);
                      
                      // Filter out already selected instances
                      const selectableInstances = availableInstances.filter(
                        (instance) => !currentSelected.includes(instance)
                      );

                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <input
                            type="text"
                            value={relationshipValues[relationshipKey] || ''}
                            onChange={(e) => handleRelationshipChange(relationshipKey, e.target.value)}
                            onBlur={() => handleRelationshipBlur(relationshipKey)}
                            placeholder={`Select ${targetClass} instances...`}
                            style={{
                              width: '100%',
                              padding: '4px 8px',
                              border: '1px solid #cbd5e1',
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontFamily: 'inherit',
                            }}
                          />
                          {selectableInstances.length > 0 && (
                            <select
                              onChange={(e) => {
                                if (e.target.value) {
                                  handleRelationshipDropdownChange(relationshipKey, targetClass, e.target.value);
                                  e.target.value = ''; // Reset dropdown
                                }
                              }}
                              style={{
                                width: '100%',
                                padding: '4px 8px',
                                border: '1px solid #cbd5e1',
                                borderRadius: '4px',
                                fontSize: '12px',
                                backgroundColor: '#ffffff',
                                color: '#1e293b',
                                cursor: 'pointer',
                              }}
                              defaultValue=""
                            >
                              <option value="" disabled>
                                Select {targetClass} instance...
                              </option>
                              {selectableInstances.map((instance) => (
                                <option key={instance} value={instance}>
                                  {instance}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      );
                    }
                    return <span style={{ color: '#94a3b8', fontSize: '12px' }}>—</span>;
                  })()}
                </td>
              )}
            </tr>
          ))}
          {/* Classes row */}
          <tr style={{ backgroundColor: '#f8fafc' }}>
            <td
              colSpan={selectedKnowledgeGraphId ? 2 : 1}
              style={{
                padding: '12px',
                borderTop: '2px solid #e2e8f0',
                borderBottom: '1px solid #e2e8f0',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, color: '#475569' }}>Classes:</span>
                {nodes.map((node, idx) => (
                  <span
                    key={node.id}
                    style={{
                      color: '#6366f1',
                      fontWeight: 500,
                    }}
                  >
                    {node.data.label || node.id}
                    {idx < nodes.length - 1 && <span style={{ color: '#94a3b8', marginLeft: '8px' }}>,</span>}
                  </span>
                ))}
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      {rows.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
          No triples to display. Add nodes and edges in the Graph view.
        </div>
      )}
      <div style={{ marginTop: '20px', padding: '12px', backgroundColor: '#f1f5f9', borderRadius: '6px', fontSize: '14px', color: '#64748b' }}>
        Total: {rows.length} triples ({nodes.length} classes, {edges.length} relationships)
      </div>

      {/* Node Info Popup */}
      {selectedNode && (
        <>
          {/* Overlay */}
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 1000,
              cursor: 'pointer',
            }}
            onClick={() => setSelectedNodeId(null)}
          />
          {/* Popup */}
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              padding: '24px',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
              zIndex: 1001,
              minWidth: '300px',
              maxWidth: '500px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#1e293b' }}>
                Node Information
              </h3>
              <button
                onClick={() => setSelectedNodeId(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '20px',
                  cursor: 'pointer',
                  color: '#64748b',
                  padding: '0',
                  width: '24px',
                  height: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ×
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', fontWeight: 500 }}>
                  Label
                </div>
                <div style={{ fontSize: '14px', color: '#1e293b' }}>
                  {selectedNode.data.label || selectedNode.id}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', fontWeight: 500 }}>
                  Node ID
                </div>
                <div style={{ fontSize: '14px', color: '#1e293b', fontFamily: 'monospace' }}>
                  {selectedNode.id}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', fontWeight: 500 }}>
                  Type
                </div>
                <div style={{ fontSize: '14px', color: '#1e293b' }}>
                  {selectedNode.type || 'default'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', fontWeight: 500 }}>
                  Position
                </div>
                <div style={{ fontSize: '14px', color: '#1e293b', fontFamily: 'monospace' }}>
                  ({selectedNode.position.x.toFixed(0)}, {selectedNode.position.y.toFixed(0)})
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
