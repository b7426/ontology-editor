import type { Node, Edge } from 'reactflow';

interface TriplesViewProps {
  nodes: Node[];
  edges: Edge[];
}

interface Triple {
  subject: string;
  predicate: string;
  object: string;
  depth: number;
}

function calculateDepths(nodes: Node[], edges: Edge[]): Map<string, number> {
  const depths = new Map<string, number>();
  const children = new Map<string, string[]>();

  // Build parent -> children map based on subClassOf edges
  // In subClassOf, source is child of target (source subClassOf target)
  edges.forEach((edge) => {
    const predicate = typeof edge.label === 'string' ? edge.label : '';
    if (predicate === 'subClassOf') {
      const parentId = edge.target;
      const childId = edge.source;
      if (!children.has(parentId)) {
        children.set(parentId, []);
      }
      children.get(parentId)!.push(childId);
    }
  });

  // Find root nodes (nodes that are not children of any other node)
  const allChildren = new Set<string>();
  children.forEach((childList) => {
    childList.forEach((c) => allChildren.add(c));
  });

  const roots = nodes.filter((n) => !allChildren.has(n.id));

  // BFS to calculate depths
  const queue: { id: string; depth: number }[] = roots.map((n) => ({ id: n.id, depth: 0 }));
  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (!depths.has(id)) {
      depths.set(id, depth);
      const nodeChildren = children.get(id) || [];
      nodeChildren.forEach((childId) => {
        queue.push({ id: childId, depth: depth + 1 });
      });
    }
  }

  // Assign depth 0 to any nodes not reached (disconnected)
  nodes.forEach((n) => {
    if (!depths.has(n.id)) {
      depths.set(n.id, 0);
    }
  });

  return depths;
}

export default function TriplesView({ nodes, edges }: TriplesViewProps) {
  const depths = calculateDepths(nodes, edges);
  const triples: Triple[] = [];

  // Sort nodes by depth for hierarchical display
  const sortedNodes = [...nodes].sort((a, b) => {
    const depthA = depths.get(a.id) || 0;
    const depthB = depths.get(b.id) || 0;
    return depthA - depthB;
  });

  // Add type triples for each node
  sortedNodes.forEach((node) => {
    const depth = depths.get(node.id) || 0;
    triples.push({
      subject: node.data.label || node.id,
      predicate: 'rdf:type',
      object: 'owl:Class',
      depth,
    });
  });

  // Add relationship triples from edges
  edges.forEach((edge) => {
    const sourceNode = nodes.find((n) => n.id === edge.source);
    const targetNode = nodes.find((n) => n.id === edge.target);
    if (sourceNode && targetNode) {
      const depth = depths.get(sourceNode.id) || 0;
      triples.push({
        subject: sourceNode.data.label || sourceNode.id,
        predicate: typeof edge.label === 'string' ? edge.label : 'relatedTo',
        object: targetNode.data.label || targetNode.id,
        depth,
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
              <td style={{ padding: '10px 12px', paddingLeft: `${12 + triple.depth * 20}px`, borderBottom: '1px solid #e2e8f0', color: '#6366f1' }}>
                {triple.depth > 0 && <span style={{ color: '#cbd5e1', marginRight: '6px' }}>{'└'}</span>}
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
