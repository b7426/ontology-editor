import { useEffect, useState, useCallback, useRef } from 'react'
import OntologyGraph from './components/OntologyGraph'
import TriplesView from './components/TriplesView'
import ChatPanel from './components/ChatPanel'
import Admin from './components/Admin'
import Settings from './components/Settings'
import Landing from './components/Landing'
import LoginModal from './components/LoginModal'
import KGNameModal from './components/KGNameModal'
import FileManager from './components/FileManager'
import JsonView from './components/JsonView'
import { API_URL, apiHeaders } from './utils/api'
import type { Node, Edge } from 'reactflow'
import type { AuthState, OntologyMeta, KnowledgeGraphMeta, KnowledgeGraphsResponse } from './types'

type TabType = 'file' | 'triples' | 'graph' | 'json' | 'admin' | 'settings'

function App() {
  const [backendStatus, setBackendStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  const [activeTab, setActiveTab] = useState<TabType>('file')
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [auth, setAuth] = useState<AuthState>(() => {
    const stored = localStorage.getItem('auth')
    if (stored) {
      try {
        return JSON.parse(stored)
      } catch {
        return { isLoggedIn: false, username: null, isAdmin: false }
      }
    }
    return { isLoggedIn: false, username: null, isAdmin: false }
  })
  const [currentOntology, setCurrentOntology] = useState<OntologyMeta | null>(() => {
    const stored = localStorage.getItem('currentOntology')
    if (stored) {
      try {
        return JSON.parse(stored)
      } catch {
        return null
      }
    }
    return null
  })
  const [knowledgeGraphs, setKnowledgeGraphs] = useState<KnowledgeGraphMeta[]>([])
  const [selectedKnowledgeGraph, setSelectedKnowledgeGraph] = useState<string | null>(null)
  const [showKGNameModal, setShowKGNameModal] = useState(false)

  useEffect(() => {
    fetch(`${API_URL}/health`, { headers: apiHeaders() })
      .then((res) => res.json())
      .then((data) => {
        if (data.status === 'ok') {
          setBackendStatus('ok')
        } else {
          setBackendStatus('error')
        }
      })
      .catch(() => {
        setBackendStatus('error')
      })
  }, [])

  // Persist auth state to localStorage
  useEffect(() => {
    localStorage.setItem('auth', JSON.stringify(auth))
  }, [auth])

  // Persist currentOntology to localStorage
  useEffect(() => {
    if (currentOntology) {
      localStorage.setItem('currentOntology', JSON.stringify(currentOntology))
    } else {
      localStorage.removeItem('currentOntology')
    }
  }, [currentOntology])

  // Track if we've done the initial load
  const initialLoadDone = useRef(false)

  // Load ontology data on initial mount if we have auth and currentOntology
  useEffect(() => {
    if (!initialLoadDone.current && auth.isLoggedIn && auth.username && currentOntology) {
      initialLoadDone.current = true
      fetch(`${API_URL}/ontologies/${auth.username}/${currentOntology.id}`, {
        headers: apiHeaders(),
      })
        .then((res) => res.json())
        .then((data) => {
          setNodes(data.graph?.nodes || [])
          setEdges(data.graph?.edges || [])
        })
        .catch((error) => {
          console.error('Failed to load ontology:', error)
        })
    }
  }, [auth.isLoggedIn, auth.username, currentOntology])

  // Load knowledge graphs when ontology changes
  useEffect(() => {
    if (auth.isLoggedIn && auth.username && currentOntology) {
      fetch(`${API_URL}/knowledge-graphs/${auth.username}/${currentOntology.id}`, {
        headers: apiHeaders(),
      })
        .then((res) => res.json())
        .then((data: KnowledgeGraphsResponse) => {
          setKnowledgeGraphs(data.knowledge_graphs || [])
          setSelectedKnowledgeGraph(null) // Reset selection when ontology changes
        })
        .catch((error) => {
          console.error('Failed to load knowledge graphs:', error)
          setKnowledgeGraphs([])
        })
    } else {
      setKnowledgeGraphs([])
      setSelectedKnowledgeGraph(null)
    }
  }, [auth.isLoggedIn, auth.username, currentOntology])

  const handleGraphChange = useCallback((newNodes: Node[], newEdges: Edge[]) => {
    setNodes(newNodes)
    setEdges(newEdges)
  }, [])

  const handleLogin = async (username: string, password: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const response = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ username, password }),
      })
      const data = await response.json()

      if (data.success) {
        setAuth({
          isLoggedIn: true,
          username: data.username,
          isAdmin: data.is_admin,
        })
        return { success: true }
      } else {
        return { success: false, message: data.message || 'Login failed' }
      }
    } catch {
      return { success: false, message: 'Connection error' }
    }
  }

  const handleLogout = () => {
    setAuth({
      isLoggedIn: false,
      username: null,
      isAdmin: false,
    })
    setCurrentOntology(null)
    setNodes([])
    setEdges([])
    setActiveTab('file')
  }

  const handleSelectOntology = async (ontology: OntologyMeta) => {
    try {
      const response = await fetch(`${API_URL}/ontologies/${auth.username}/${ontology.id}`, {
        headers: apiHeaders(),
      })
      const data = await response.json()
      setCurrentOntology(ontology)
      setNodes(data.graph?.nodes || [])
      setEdges(data.graph?.edges || [])
      setActiveTab('triples')
    } catch (error) {
      console.error('Failed to load ontology:', error)
    }
  }

  const handleCreateOntology = (ontology: OntologyMeta) => {
    setCurrentOntology(ontology)
    setNodes([])
    setEdges([])
    setActiveTab('graph')
  }

  const handleCreateKnowledgeGraphClick = () => {
    if (!currentOntology || !auth.username) {
      alert('Please select an ontology first')
      return
    }
    setShowKGNameModal(true)
  }

  const handleCreateKnowledgeGraph = async (name: string) => {
    if (!currentOntology || !auth.username) {
      console.error('Cannot create knowledge graph: missing ontology or username')
      return
    }

    try {
      console.log('Creating knowledge graph:', name)
      const response = await fetch(`${API_URL}/knowledge-graphs/${auth.username}/${currentOntology.id}`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ name }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Failed to create knowledge graph' }))
        console.error('Failed to create knowledge graph:', errorData)
        alert(errorData.detail || 'Failed to create knowledge graph')
        return
      }

      const result = await response.json()
      console.log('Knowledge graph created:', result)

      // Refresh knowledge graphs list
      const kgResponse = await fetch(`${API_URL}/knowledge-graphs/${auth.username}/${currentOntology.id}`, {
        headers: apiHeaders(),
      })
      if (kgResponse.ok) {
        const kgData: KnowledgeGraphsResponse = await kgResponse.json()
        setKnowledgeGraphs(kgData.knowledge_graphs || [])
        // Select the newly created knowledge graph
        if (result.knowledge_graph) {
          setSelectedKnowledgeGraph(result.knowledge_graph.id)
        }
      }

      setShowKGNameModal(false)
    } catch (error) {
      console.error('Failed to create knowledge graph:', error)
      alert('Failed to create knowledge graph. Please check the console for details.')
    }
  }

  const tabStyle = (tab: TabType) => ({
    padding: '8px 16px',
    backgroundColor: activeTab === tab ? '#6366f1' : 'transparent',
    color: activeTab === tab ? 'white' : '#94a3b8',
    border: 'none',
    borderRadius: '6px 6px 0 0',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
  })

  // Show landing page if not logged in
  if (!auth.isLoggedIn) {
    return (
      <>
        <Landing onLoginClick={() => setShowLoginModal(true)} />
        <LoginModal
          isOpen={showLoginModal}
          onClose={() => setShowLoginModal(false)}
          onLogin={handleLogin}
        />
      </>
    )
  }

  return (
    <>
      <KGNameModal
        isOpen={showKGNameModal}
        onClose={() => setShowKGNameModal(false)}
        onConfirm={handleCreateKnowledgeGraph}
      />
      <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <header style={{
        backgroundColor: '#1e293b',
        color: 'white',
        padding: '16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>Ontology Editor</h1>
          {currentOntology && (
            <span style={{ color: '#94a3b8', fontSize: '14px' }}>
              / {currentOntology.name}
            </span>
          )}
        </div>
        <div>
          <button
            onClick={handleLogout}
            style={{
              padding: '6px 12px',
              backgroundColor: 'transparent',
              color: '#94a3b8',
              border: '1px solid #475569',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            Log Out
          </button>
        </div>
      </header>
      <div style={{ backgroundColor: '#1e293b', paddingLeft: '16px', paddingRight: '16px', paddingBottom: '0', display: 'flex', justifyContent: 'space-between' }}>
        <div>
          <button style={tabStyle('file')} onClick={() => setActiveTab('file')}>
            File
          </button>
          <button style={tabStyle('triples')} onClick={() => setActiveTab('triples')}>
            Triples
          </button>
          <button style={tabStyle('graph')} onClick={() => setActiveTab('graph')}>
            Graph
          </button>
          <button style={tabStyle('json')} onClick={() => setActiveTab('json')}>
            JSON
          </button>
        </div>
        <div>
          {auth.isAdmin && (
            <button style={tabStyle('admin')} onClick={() => setActiveTab('admin')}>
              Admin
            </button>
          )}
          <button style={tabStyle('settings')} onClick={() => setActiveTab('settings')}>
            Settings
          </button>
        </div>
      </div>
      <main style={{ flex: 1, backgroundColor: activeTab === 'triples' ? '#ffffff' : undefined, display: 'flex', overflow: 'hidden' }}>
        {activeTab === 'file' && auth.username && (
          <FileManager
            username={auth.username}
            currentOntologyId={currentOntology?.id || null}
            onSelectOntology={handleSelectOntology}
            onCreateOntology={handleCreateOntology}
          />
        )}
        {activeTab === 'triples' && (
          <>
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {currentOntology && (
                <div style={{ padding: '12px 20px', backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'space-between' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 500, color: '#1e293b' }}>
                    <span>Knowledge Graph:</span>
                    <select
                      value={selectedKnowledgeGraph || ''}
                      onChange={(e) => setSelectedKnowledgeGraph(e.target.value || null)}
                      style={{
                        padding: '6px 12px',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        fontSize: '14px',
                        backgroundColor: '#ffffff',
                        color: '#1e293b',
                        cursor: 'pointer',
                        minWidth: '200px',
                      }}
                    >
                      <option value="">None (use ontology graph)</option>
                      {knowledgeGraphs.map((kg) => (
                        <option key={kg.id} value={kg.id}>
                          {kg.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      onClick={handleCreateKnowledgeGraphClick}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#6366f1',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '14px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        transition: 'background-color 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#4f46e5'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#6366f1'
                      }}
                    >
                      Add
                    </button>
                    <button
                      onClick={() => {
                        if (selectedKnowledgeGraph && currentOntology && auth.username) {
                          const saveFunction = (window as any).saveKnowledgeGraph;
                          if (saveFunction && typeof saveFunction === 'function') {
                            saveFunction();
                          } else {
                            alert('Save function not available. Please wait a moment and try again.');
                          }
                        } else {
                          alert('Please select a knowledge graph to save');
                        }
                      }}
                      disabled={!selectedKnowledgeGraph}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: selectedKnowledgeGraph ? '#22c55e' : '#94a3b8',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '14px',
                        fontWeight: 500,
                        cursor: selectedKnowledgeGraph ? 'pointer' : 'not-allowed',
                        transition: 'background-color 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        if (selectedKnowledgeGraph) {
                          e.currentTarget.style.backgroundColor = '#16a34a'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (selectedKnowledgeGraph) {
                          e.currentTarget.style.backgroundColor = '#22c55e'
                        }
                      }}
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <TriplesView
                  nodes={nodes}
                  edges={edges}
                  selectedKnowledgeGraphId={selectedKnowledgeGraph}
                  ontologyId={currentOntology?.id || null}
                  username={auth.username}
                  onKnowledgeGraphUpdate={() => {
                    // Refresh knowledge graphs list if needed
                    if (auth.username && currentOntology) {
                      fetch(`${API_URL}/knowledge-graphs/${auth.username}/${currentOntology.id}`, {
                        headers: apiHeaders(),
                      })
                        .then((res) => res.json())
                        .then((data: KnowledgeGraphsResponse) => {
                          setKnowledgeGraphs(data.knowledge_graphs || [])
                        })
                        .catch(console.error)
                    }
                  }}
                />
              </div>
            </div>
            <ChatPanel
              ontologyId={currentOntology?.id || null}
              ontologyName={currentOntology?.name || null}
              username={auth.username}
              nodes={nodes}
              edges={edges}
              onGraphUpdate={handleGraphChange}
            />
          </>
        )}
        {activeTab === 'graph' && (
          <OntologyGraph
            onGraphChange={handleGraphChange}
            currentOntology={currentOntology}
            username={auth.username}
          />
        )}
        {activeTab === 'json' && (
          <JsonView
            nodes={nodes}
            edges={edges}
            ontologyName={currentOntology?.name}
          />
        )}
        {activeTab === 'admin' && auth.isAdmin && auth.username && <Admin adminUser={auth.username} />}
        {activeTab === 'settings' && <Settings />}
      </main>
      <footer style={{
        backgroundColor: '#1e293b',
        color: 'white',
        padding: '12px 16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: '14px',
        borderTop: '1px solid #334155'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>Backend:</span>
          {backendStatus === 'loading' && (
            <span style={{ color: '#facc15' }}>Connecting...</span>
          )}
          {backendStatus === 'ok' && (
            <span style={{ color: '#4ade80', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '8px', height: '8px', backgroundColor: '#4ade80', borderRadius: '50%' }}></span>
              Connected
            </span>
          )}
          {backendStatus === 'error' && (
            <span style={{ color: '#f87171', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '8px', height: '8px', backgroundColor: '#f87171', borderRadius: '50%' }}></span>
              Disconnected
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#94a3b8' }}>
            {auth.username}
            {auth.isAdmin && <span style={{ marginLeft: '6px', fontSize: '11px', backgroundColor: '#6366f1', padding: '2px 6px', borderRadius: '4px' }}>Admin</span>}
          </span>
        </div>
      </footer>
      </div>
    </>
  )
}

export default App
