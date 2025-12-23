import { useCallback, useState, useEffect, useRef } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  BackgroundVariant,
  Panel,
  useReactFlow,
  ReactFlowProvider,
} from 'reactflow';
import type { Connection, Node, Edge } from 'reactflow';
import 'reactflow/dist/style.css';
import { API_URL, apiHeaders } from '../utils/api';
import type { OntologyMeta } from '../types';

let nodeId = 100;

interface OntologyGraphProps {
  onGraphChange?: (nodes: Node[], edges: Edge[]) => void;
  currentOntology?: OntologyMeta | null;
  username?: string | null;
}

function OntologyGraphInner({ onGraphChange, currentOntology, username }: OntologyGraphProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [loading, setLoading] = useState(false);
  const [newNodeLabel, setNewNodeLabel] = useState('');
  const [showNodeInput, setShowNodeInput] = useState(false);
  const [inputPosition, setInputPosition] = useState({ x: 0, y: 0 });
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  // Load ontology when it changes
  useEffect(() => {
    if (!currentOntology || !username) {
      setNodes([]);
      setEdges([]);
      return;
    }

    setLoading(true);
    fetch(`${API_URL}/ontologies/${username}/${currentOntology.id}`, { headers: apiHeaders() })
      .then((res) => res.json())
      .then((data) => {
        const graphNodes = data.graph?.nodes || [];
        const graphEdges = data.graph?.edges || [];
        setNodes(graphNodes);
        setEdges(graphEdges);
        if (graphNodes.length > 0) {
          const maxId = Math.max(...graphNodes.map((n: Node) => parseInt(n.id) || 0));
          nodeId = maxId + 1;
        } else {
          nodeId = 1;
        }
      })
      .catch(() => {
        setNodes([]);
        setEdges([]);
      })
      .finally(() => setLoading(false));
  }, [currentOntology?.id, username, setNodes, setEdges]);

  // Notify parent of graph changes
  useEffect(() => {
    if (onGraphChange && !loading) {
      onGraphChange(nodes, edges);
    }
  }, [nodes, edges, loading, onGraphChange]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const handleSave = async () => {
    if (!currentOntology || !username) {
      setSaveStatus('error');
      return;
    }

    setSaveStatus('saving');
    try {
      const response = await fetch(`${API_URL}/ontologies/${username}/${currentOntology.id}`, {
        method: 'PUT',
        headers: apiHeaders(),
        body: JSON.stringify({
          id: currentOntology.id,
          name: currentOntology.name,
          graph: { nodes, edges }
        }),
      });
      if (response.ok) {
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } else {
        setSaveStatus('error');
      }
    } catch {
      setSaveStatus('error');
    }
  };

  const onPaneDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setInputPosition(position);
      setShowNodeInput(true);
      setNewNodeLabel('');
    },
    [screenToFlowPosition]
  );

  const createOrUpdateNodeOrEdge = useCallback(() => {
    if (!newNodeLabel.trim()) {
      setShowNodeInput(false);
      setEditingNodeId(null);
      setEditingEdgeId(null);
      return;
    }

    if (editingEdgeId) {
      // Update existing edge
      setEdges((eds) =>
        eds.map((edge) =>
          edge.id === editingEdgeId
            ? { ...edge, label: newNodeLabel.trim() }
            : edge
        )
      );
    } else if (editingNodeId) {
      // Update existing node
      setNodes((nds) =>
        nds.map((node) =>
          node.id === editingNodeId
            ? { ...node, data: { ...node.data, label: newNodeLabel.trim() } }
            : node
        )
      );
    } else {
      // Create new node
      const newNode: Node = {
        id: String(nodeId++),
        type: 'default',
        position: inputPosition,
        data: { label: newNodeLabel.trim() },
        style: { background: '#6366f1', color: 'white', border: 'none' },
      };
      setNodes((nds) => [...nds, newNode]);
    }

    setShowNodeInput(false);
    setEditingNodeId(null);
    setEditingEdgeId(null);
    setNewNodeLabel('');
  }, [newNodeLabel, inputPosition, editingNodeId, editingEdgeId, setNodes, setEdges]);

  const onNodeDoubleClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.stopPropagation();
      setEditingNodeId(node.id);
      setEditingEdgeId(null);
      setNewNodeLabel(node.data.label || '');
      setInputPosition(node.position);
      setShowNodeInput(true);
    },
    []
  );

  const onEdgeDoubleClick = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.stopPropagation();
      const sourceNode = nodes.find((n) => n.id === edge.source);
      const targetNode = nodes.find((n) => n.id === edge.target);
      if (sourceNode && targetNode) {
        const midX = (sourceNode.position.x + targetNode.position.x) / 2;
        const midY = (sourceNode.position.y + targetNode.position.y) / 2;
        setInputPosition({ x: midX, y: midY });
      }
      setEditingEdgeId(edge.id);
      setEditingNodeId(null);
      setNewNodeLabel(typeof edge.label === 'string' ? edge.label : '');
      setShowNodeInput(true);
    },
    [nodes]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      createOrUpdateNodeOrEdge();
    } else if (e.key === 'Escape') {
      setShowNodeInput(false);
      setEditingNodeId(null);
      setEditingEdgeId(null);
    }
  };

  if (!currentOntology) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' }}>
        <div style={{ textAlign: 'center', color: '#64748b' }}>
          <p style={{ fontSize: '18px', marginBottom: '8px' }}>No ontology selected</p>
          <p style={{ fontSize: '14px' }}>Select or create an ontology from the File tab</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#6366f1', fontSize: '16px' }}>Loading graph...</span>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%' }} ref={reactFlowWrapper}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onPaneClick={() => {
          if (showNodeInput) {
            setShowNodeInput(false);
            setEditingNodeId(null);
            setEditingEdgeId(null);
          }
        }}
        onDoubleClick={onPaneDoubleClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onEdgeDoubleClick={onEdgeDoubleClick}
        deleteKeyCode={['Backspace', 'Delete']}
        fitView
      >
        <Controls />
        <MiniMap />
        <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
        <Panel position="top-right">
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleSave}
              disabled={saveStatus === 'saving'}
              style={{
                padding: '8px 16px',
                backgroundColor: saveStatus === 'saved' ? '#22c55e' : saveStatus === 'error' ? '#ef4444' : '#6366f1',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: saveStatus === 'saving' ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: 500,
              }}
            >
              {saveStatus === 'saving' && 'Saving...'}
              {saveStatus === 'saved' && 'Saved!'}
              {saveStatus === 'error' && 'Error'}
              {saveStatus === 'idle' && 'Save Graph'}
            </button>
          </div>
        </Panel>
        <Panel position="top-left">
          <div style={{
            backgroundColor: 'rgba(255,255,255,0.9)',
            padding: '8px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            color: '#666'
          }}>
            Double-click: add node / edit node or edge label • Backspace: delete selected
          </div>
        </Panel>
      </ReactFlow>
      {showNodeInput && (
        <div
          style={{
            position: 'absolute',
            left: inputPosition.x + (reactFlowWrapper.current?.getBoundingClientRect().left || 0),
            top: inputPosition.y + (reactFlowWrapper.current?.getBoundingClientRect().top || 0),
            zIndex: 1000,
          }}
        >
          <input
            type="text"
            value={newNodeLabel}
            onChange={(e) => setNewNodeLabel(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={createOrUpdateNodeOrEdge}
            autoFocus
            placeholder={editingEdgeId ? "Edge label..." : "Node label..."}
            style={{
              padding: '8px 12px',
              border: '2px solid #6366f1',
              borderRadius: '6px',
              fontSize: '14px',
              outline: 'none',
              minWidth: '150px',
            }}
          />
        </div>
      )}
    </div>
  );
}

export default function OntologyGraph({ onGraphChange, currentOntology, username }: OntologyGraphProps) {
  return (
    <ReactFlowProvider>
      <OntologyGraphInner onGraphChange={onGraphChange} currentOntology={currentOntology} username={username} />
    </ReactFlowProvider>
  );
}
