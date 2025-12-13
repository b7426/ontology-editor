import type { Node, Edge } from 'reactflow';

interface TriplesViewProps {
  nodes: Node[];
  edges: Edge[];
}

interface Triple {
  subject: string;
  predicate: string;
  object: string;
}

export default function TriplesView({ nodes, edges }: TriplesViewProps) {
  const triples: Triple[] = [];

  // Add type triples for each node
  nodes.forEach((node) => {
    triples.push({
      subject: node.data.label || node.id,
      predicate: 'rdf:type',
      object: 'owl:Class',
    });
  });

  // Add relationship triples from edges
  edges.forEach((edge) => {
    const sourceNode = nodes.find((n) => n.id === edge.source);
    const targetNode = nodes.find((n) => n.id === edge.target);
    if (sourceNode && targetNode) {
      triples.push({
        subject: sourceNode.data.label || sourceNode.id,
        predicate: typeof edge.label === 'string' ? edge.label : 'relatedTo',
        object: targetNode.data.label || targetNode.id,
      });
    }
  });

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'auto', padding: '20px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'monospace' }}>
        <thead>
          <tr style={{ backgroundColor: '#f1f5f9', textAlign: 'left' }}>
            <th style={{ padding: '12px', borderBottom: '2px solid #e2e8f0' }}>Subject</th>
            <th style={{ padding: '12px', borderBottom: '2px solid #e2e8f0' }}>Predicate</th>
            <th style={{ padding: '12px', borderBottom: '2px solid #e2e8f0' }}>Object</th>
          </tr>
        </thead>
        <tbody>
          {triples.map((triple, index) => (
            <tr key={index} style={{ backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
              <td style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0', color: '#6366f1' }}>
                {triple.subject}
              </td>
              <td style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0', color: '#059669' }}>
                {triple.predicate}
              </td>
              <td style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0', color: '#6366f1' }}>
                {triple.object}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {triples.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
          No triples to display. Add nodes and edges in the Graph view.
        </div>
      )}
      <div style={{ marginTop: '20px', padding: '12px', backgroundColor: '#f1f5f9', borderRadius: '6px', fontSize: '14px', color: '#64748b' }}>
        Total: {triples.length} triples ({nodes.length} nodes, {edges.length} edges)
      </div>
    </div>
  );
}
