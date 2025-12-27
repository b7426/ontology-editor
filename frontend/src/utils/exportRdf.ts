import type { Node, Edge } from '../types';

export function generateTurtle(nodes: Node[], edges: Edge[]): string {
  const lines: string[] = [];

  // Prefixes
  lines.push('@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .');
  lines.push('@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .');
  lines.push('@prefix owl: <http://www.w3.org/2002/07/owl#> .');
  lines.push('@prefix : <http://example.org/ontology#> .');
  lines.push('');

  // Generate class declarations for each node
  nodes.forEach((node) => {
    const label = node.data.label || node.id;
    const uri = `:${label.replace(/\s+/g, '_')}`;
    lines.push(`${uri} a owl:Class ;`);
    lines.push(`    rdfs:label "${label}" .`);
    lines.push('');
  });

  // Generate relationships from edges
  edges.forEach((edge) => {
    const sourceNode = nodes.find((n) => n.id === edge.source);
    const targetNode = nodes.find((n) => n.id === edge.target);
    if (sourceNode && targetNode) {
      const sourceLabel = sourceNode.data.label || sourceNode.id;
      const targetLabel = targetNode.data.label || targetNode.id;
      const sourceUri = `:${sourceLabel.replace(/\s+/g, '_')}`;
      const targetUri = `:${targetLabel.replace(/\s+/g, '_')}`;
      const predicate = typeof edge.label === 'string' ? edge.label : 'relatedTo';

      if (predicate === 'subClassOf') {
        lines.push(`${sourceUri} rdfs:subClassOf ${targetUri} .`);
      } else {
        // For other predicates, create a property assertion
        const predicateUri = `:${predicate.replace(/\s+/g, '_')}`;
        lines.push(`${predicateUri} a owl:ObjectProperty ;`);
        lines.push(`    rdfs:domain ${sourceUri} ;`);
        lines.push(`    rdfs:range ${targetUri} .`);
      }
      lines.push('');
    }
  });

  return lines.join('\n');
}

export function downloadTurtle(nodes: Node[], edges: Edge[], filename = 'ontology.ttl') {
  const turtle = generateTurtle(nodes, edges);
  const blob = new Blob([turtle], { type: 'text/turtle' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
