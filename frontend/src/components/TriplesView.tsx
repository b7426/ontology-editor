import type { Node, Edge } from 'reactflow';

interface TriplesViewProps {
  nodes: Node[];
  edges: Edge[];
}

interface NodeGroup {
  nodeId: string;
  label: string;
  depth: number;
  properties: { predicate: string; object: string }[];
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

  // Build ordered list with depths using DFS
  const result: NodeGroup[] = [];
  const visited = new Set<string>();

  function visit(nodeId: string, depth: number) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const label = node.data.label || node.id;

    // Collect all properties for this node (rdf:type owl:Class is shown on the subject line)
    const attributes: { predicate: string; object: string }[] = [];
    const relationships: { predicate: string; object: string }[] = [];

    // Add edges where this node is the source (excluding subClassOf since hierarchy is shown via indentation)
    edges.forEach((edge) => {
      if (edge.source === nodeId) {
        const predicate = typeof edge.label === 'string' ? edge.label : 'relatedTo';
        if (predicate === 'subClassOf') return; // Skip subClassOf - already shown via hierarchy
        const targetNode = nodes.find((n) => n.id === edge.target);
        if (targetNode) {
          relationships.push({
            predicate,
            object: targetNode.data.label || targetNode.id,
          });
        }
      }
    });

    // Combine: attributes first, then relationships
    const properties = [...attributes, ...relationships];

    result.push({ nodeId, label, depth, properties });

    // Visit children
    const nodeChildren = children.get(nodeId) || [];
    nodeChildren.forEach((childId) => visit(childId, depth + 1));
  }

  // Visit all roots first
  roots.forEach((root) => visit(root.id, 0));

  // Visit any unvisited nodes (disconnected)
  nodes.forEach((node) => {
    if (!visited.has(node.id)) {
      visit(node.id, 0);
    }
  });

  return result;
}

export default function TriplesView({ nodes, edges }: TriplesViewProps) {
  const hierarchy = buildHierarchy(nodes, edges);

  const rows: { subject: string; predicate: string; object: string; depth: number; isFirst: boolean }[] = [];

  hierarchy.forEach((group) => {
    // Always add the subject row
    rows.push({
      subject: group.label,
      predicate: '',
      object: '',
      depth: group.depth,
      isFirst: true,
    });
    // Add property rows
    group.properties.forEach((prop) => {
      rows.push({
        subject: group.label,
        predicate: prop.predicate,
        object: prop.object,
        depth: group.depth,
        isFirst: false,
      });
    });
  });

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'auto', padding: '20px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'monospace' }}>
        <thead>
          <tr style={{ backgroundColor: '#f1f5f9', textAlign: 'left' }}>
            <th style={{ padding: '12px', borderBottom: '2px solid #e2e8f0' }}>Classes &amp; Properties</th>
            <th style={{ padding: '12px', borderBottom: '2px solid #e2e8f0', width: '150px' }}>Type</th>
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
                  <>
                    {row.depth > 0 && <span style={{ color: '#94a3b8', marginRight: '8px' }}>└</span>}
                    {row.subject}
                  </>
                ) : (
                  <span style={{ paddingLeft: '20px' }}>
                    <span style={{ color: '#059669' }}>{row.predicate}</span>
                    {' '}
                    <span style={{ color: '#6366f1' }}>{row.object}</span>
                  </span>
                )}
              </td>
              <td
                style={{
                  padding: '10px 12px',
                  borderBottom: '1px solid #e2e8f0',
                  color: '#059669',
                }}
              >
                {row.isFirst ? 'owl:Class' : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
          No triples to display. Add nodes and edges in the Graph view.
        </div>
      )}
      <div style={{ marginTop: '20px', padding: '12px', backgroundColor: '#f1f5f9', borderRadius: '6px', fontSize: '14px', color: '#64748b' }}>
        Total: {rows.length} triples ({nodes.length} nodes, {edges.length} edges)
      </div>
    </div>
  );
}
