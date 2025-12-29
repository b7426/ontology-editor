/**
 * Shared type definitions
 */

/**
 * Graph node data
 */
export interface NodeData {
  label?: string;
  [key: string]: unknown;
}

/**
 * Graph node
 */
export interface Node {
  id: string;
  type?: string;
  data: NodeData;
}

/**
 * Graph edge
 * For object properties: source -> target (both are class nodes)
 * For datatype properties: source only, with datatype field (e.g., "string", "integer")
 */
export interface Edge {
  id: string;
  source: string;
  target?: string;  // Optional for datatype properties
  label?: string;
  type?: string;
  datatype?: string;  // For datatype properties (e.g., "string", "integer", "date")
}

/**
 * Ontology metadata
 */
export interface OntologyMeta {
  id: string;
  name: string;
  owner: string;
  created_at: string;
  updated_at: string;
}

/**
 * User information
 */
export interface User {
  username: string;
  is_admin: boolean;
  archived: boolean;
  created_at: string | null;
}

/**
 * Authentication state
 */
export interface AuthState {
  isLoggedIn: boolean;
  username: string | null;
  isAdmin: boolean;
}

/**
 * Login response from API
 */
export interface LoginResponse {
  success: boolean;
  username: string | null;
  is_admin: boolean;
  message: string | null;
}

/**
 * API response for ontology list
 */
export interface OntologiesResponse {
  ontologies: OntologyMeta[];
}

/**
 * API response for users list
 */
export interface UsersResponse {
  users: User[];
}

/**
 * API response for ontology creation/import
 */
export interface OntologyCreateResponse {
  status: string;
  ontology: OntologyMeta;
}

/**
 * API response for health check
 */
export interface HealthResponse {
  status: string;
}

/**
 * Graph data structure
 */
export interface GraphData {
  nodes: Node[];
  edges: Edge[];
}

/**
 * Ontology with full graph data
 */
export interface OntologyWithGraph {
  meta: OntologyMeta;
  graph: GraphData;
}

/**
 * Knowledge Graph metadata
 */
export interface KnowledgeGraphMeta {
  id: string;
  name: string;
  owner: string;
  ontology_id: string;
  created_at: string;
  updated_at: string;
}

/**
 * API response for knowledge graphs list
 */
export interface KnowledgeGraphsResponse {
  knowledge_graphs: KnowledgeGraphMeta[];
}
