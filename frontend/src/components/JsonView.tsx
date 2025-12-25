import { useState } from 'react';
import type { Node, Edge } from 'reactflow';
import { generateTurtle } from '../utils/exportRdf';

interface JsonViewProps {
  nodes: Node[];
  edges: Edge[];
  ontologyName?: string;
}

export default function JsonView({ nodes, edges, ontologyName }: JsonViewProps) {
  const [copied, setCopied] = useState(false);

  const jsonData = {
    nodes: nodes.map((n) => ({
      id: n.id,
      label: n.data.label,
      position: n.position,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
    })),
  };

  const jsonString = JSON.stringify(jsonData, null, 2);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadJson = () => {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ontologyName || 'ontology'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadTurtle = () => {
    const turtle = generateTurtle(nodes, edges);
    const blob = new Blob([turtle], { type: 'text/turtle' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ontologyName || 'ontology'}.ttl`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const buttonStyle = {
    padding: '8px 16px',
    backgroundColor: '#6366f1',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
  };

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#1e293b',
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #334155',
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
        }}
      >
        <button onClick={handleCopy} style={buttonStyle}>
          {copied ? 'Copied!' : 'Copy to Clipboard'}
        </button>
        <button onClick={handleDownloadJson} style={buttonStyle}>
          Download JSON
        </button>
        <button
          onClick={handleDownloadTurtle}
          style={{ ...buttonStyle, backgroundColor: '#059669' }}
        >
          Download Turtle
        </button>
        <span style={{ marginLeft: 'auto', color: '#64748b', fontSize: '13px' }}>
          {nodes.length} nodes, {edges.length} edges
        </span>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
        <pre
          style={{
            margin: 0,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            fontSize: '13px',
            lineHeight: 1.6,
            color: '#e2e8f0',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {jsonString}
        </pre>
      </div>
    </div>
  );
}
