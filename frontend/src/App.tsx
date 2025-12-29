import { useEffect, useState, useCallback, useRef } from 'react'
import TriplesView from './components/TriplesView'
import ChatPanel from './components/ChatPanel'
import Admin from './components/Admin'
import Settings from './components/Settings'
import Landing from './components/Landing'
import LoginModal from './components/LoginModal'
import KGNameModal from './components/KGNameModal'
import FileManager from './components/FileManager'
import { API_URL, apiHeaders } from './utils/api'
import type { Node, Edge, AuthState, OntologyMeta, KnowledgeGraphMeta, KnowledgeGraphsResponse } from './types'

type TabType = 'file' | 'triples' | 'admin' | 'settings'

function App() {
  const [backendStatus, setBackendStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    const stored = localStorage.getItem('activeTab')
    if (stored && ['file', 'triples', 'admin', 'settings'].includes(stored)) {
      return stored as TabType
    }
    return 'file'
  })
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
  const [showJsonModal, setShowJsonModal] = useState(false)
  const [jsonModalData, setJsonModalData] = useState<{ title: string; json: string } | null>(null)

  useEffect(() => {
    fetch(`${API_URL}/health`, { headers: apiHeaders() })
      .then((res) => res.json())
      .then((data) => {
        if (data.status === 'ok') {
          setBackendStatus('ok')
          // Check if server has restarted (new server_id)
          const storedServerId = localStorage.getItem('server_id')
          if (data.server_id && storedServerId !== data.server_id) {
            // Server restarted - clear all login state
            localStorage.setItem('server_id', data.server_id)
            localStorage.removeItem('auth')
            localStorage.removeItem('currentOntology')
            setAuth({ isLoggedIn: false, username: null, isAdmin: false })
            setCurrentOntology(null)
            setNodes([])
            setEdges([])
          }
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

  // Persist activeTab to localStorage
  useEffect(() => {
    localStorage.setItem('activeTab', activeTab)
  }, [activeTab])

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

  // Update JSON modal when nodes/edges change (if modal is open and showing ontology)
  useEffect(() => {
    if (!showJsonModal || !currentOntology || selectedKnowledgeGraph) return

    // Helper to create safe URI
    const toUri = (label: string) => label.replace(/\s+/g, '_')

    // Create node ID to label mapping
    const idToLabel = new Map<string, string>()
    nodes.forEach((n) => {
      idToLabel.set(n.id, n.data.label || n.id)
    })

    // Generate ontology JSON-LD
    const graph: Record<string, unknown>[] = []

    // Add classes
    for (const node of nodes) {
      const label = node.data.label || node.id
      const classEntry: Record<string, unknown> = {
        "@id": toUri(label),
        "@type": "owl:Class",
        "rdfs:label": label
      }
      graph.push(classEntry)
    }

    // Add relationships
    for (const edge of edges) {
      const sourceLabel = idToLabel.get(edge.source) || edge.source
      const predicate = typeof edge.label === 'string' ? edge.label : 'relatedTo'

      if (edge.datatype) {
        // Datatype property
        const datatypeMap: Record<string, string> = {
          'string': 'xsd:string',
          'integer': 'xsd:integer',
          'float': 'xsd:float',
          'double': 'xsd:double',
          'boolean': 'xsd:boolean',
          'date': 'xsd:date',
          'datetime': 'xsd:dateTime',
        }
        const xsdType = datatypeMap[edge.datatype.toLowerCase()] || `xsd:${edge.datatype}`
        const existing = graph.find(e => e["@id"] === toUri(predicate) && e["@type"] === "owl:DatatypeProperty")
        if (!existing) {
          graph.push({
            "@id": toUri(predicate),
            "@type": "owl:DatatypeProperty",
            "rdfs:domain": { "@id": toUri(sourceLabel) },
            "rdfs:range": { "@id": xsdType }
          })
        }
      } else if (predicate === 'subClassOf' && edge.target) {
        const targetLabel = idToLabel.get(edge.target) || edge.target
        const entry = graph.find(e => e["@id"] === toUri(sourceLabel))
        if (entry) {
          entry["rdfs:subClassOf"] = { "@id": toUri(targetLabel) }
        }
      } else if (edge.target) {
        const targetLabel = idToLabel.get(edge.target) || edge.target
        const existing = graph.find(e => e["@id"] === toUri(predicate) && e["@type"] === "owl:ObjectProperty")
        if (!existing) {
          graph.push({
            "@id": toUri(predicate),
            "@type": "owl:ObjectProperty",
            "rdfs:domain": { "@id": toUri(sourceLabel) },
            "rdfs:range": { "@id": toUri(targetLabel) }
          })
        }
      }
    }

    const jsonld = {
      "@context": {
        "@vocab": "http://example.org/ontology#",
        "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
        "owl": "http://www.w3.org/2002/07/owl#",
        "xsd": "http://www.w3.org/2001/XMLSchema#"
      },
      "@id": toUri(currentOntology.name),
      "@type": "owl:Ontology",
      "rdfs:label": currentOntology.name,
      "@graph": graph
    }

    setJsonModalData({
      title: `${currentOntology.name} (Ontology)`,
      json: JSON.stringify(jsonld, null, 2)
    })
  }, [nodes, edges, showJsonModal, currentOntology, selectedKnowledgeGraph])

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
    setActiveTab('triples')
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

  const handleShowJson = async () => {
    if (!currentOntology) return

    // Helper to create safe URI
    const toUri = (label: string) => label.replace(/\s+/g, '_')

    // Create node ID to label mapping
    const idToLabel = new Map<string, string>()
    nodes.forEach((n) => {
      idToLabel.set(n.id, n.data.label || n.id)
    })

    if (selectedKnowledgeGraph) {
      // Show knowledge graph JSON-LD
      try {
        const response = await fetch(`${API_URL}/knowledge-graphs/${auth.username}/${currentOntology.id}/${selectedKnowledgeGraph}`, {
          headers: apiHeaders(),
        })
        const kgResponse = await response.json()
        const kgData = kgResponse.data || { instances: {}, relationships: {} }
        const kgName = knowledgeGraphs.find(kg => kg.id === selectedKnowledgeGraph)?.name || 'Knowledge Graph'

        // Convert to JSON-LD format
        const graph: Record<string, unknown>[] = []
        const instances = kgData.instances || {}
        const relationships = kgData.relationships || {}

        // Create instance entries
        for (const [className, instanceList] of Object.entries(instances)) {
          for (const instanceName of (instanceList as string[])) {
            const entry: Record<string, unknown> = {
              "@id": `instance:${toUri(instanceName)}`,
              "@type": toUri(className),
              "rdfs:label": instanceName
            }
            graph.push(entry)
          }
        }

        // Add relationships
        for (const [relKey, relValues] of Object.entries(relationships)) {
          const parts = relKey.split(':')
          if (parts.length !== 3) continue
          const [sourceClass, predicate, targetClass] = parts

          const sourceInstances = instances[sourceClass] || []
          for (const sourceInstance of (sourceInstances as string[])) {
            const sourceUri = `instance:${toUri(sourceInstance)}`
            const entry = graph.find(e => e["@id"] === sourceUri)
            if (entry) {
              const targets = (relValues as string[])
                .filter(t => ((instances[targetClass] || []) as string[]).includes(t))
                .map(t => ({ "@id": `instance:${toUri(t)}` }))
              if (targets.length > 0) {
                entry[toUri(predicate)] = targets.length === 1 ? targets[0] : targets
              }
            }
          }
        }

        const jsonld = {
          "@context": {
            "@vocab": "http://example.org/ontology#",
            "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
            "instance": "http://example.org/instance/"
          },
          "@graph": graph
        }

        setJsonModalData({
          title: `${kgName} (Knowledge Graph)`,
          json: JSON.stringify(jsonld, null, 2)
        })
      } catch (error) {
        console.error('Failed to load knowledge graph:', error)
        return
      }
    } else {
      // Show ontology JSON-LD
      const graph: Record<string, unknown>[] = []

      // Add classes
      for (const node of nodes) {
        const label = node.data.label || node.id
        const classEntry: Record<string, unknown> = {
          "@id": toUri(label),
          "@type": "owl:Class",
          "rdfs:label": label
        }
        graph.push(classEntry)
      }

      // Add relationships
      for (const edge of edges) {
        const sourceLabel = idToLabel.get(edge.source) || edge.source
        const predicate = typeof edge.label === 'string' ? edge.label : 'relatedTo'

        if (edge.datatype) {
          // Datatype property
          const datatypeMap: Record<string, string> = {
            'string': 'xsd:string',
            'integer': 'xsd:integer',
            'float': 'xsd:float',
            'double': 'xsd:double',
            'boolean': 'xsd:boolean',
            'date': 'xsd:date',
            'datetime': 'xsd:dateTime',
          }
          const xsdType = datatypeMap[edge.datatype.toLowerCase()] || `xsd:${edge.datatype}`
          const existing = graph.find(e => e["@id"] === toUri(predicate) && e["@type"] === "owl:DatatypeProperty")
          if (!existing) {
            graph.push({
              "@id": toUri(predicate),
              "@type": "owl:DatatypeProperty",
              "rdfs:domain": { "@id": toUri(sourceLabel) },
              "rdfs:range": { "@id": xsdType }
            })
          }
        } else if (predicate === 'subClassOf' && edge.target) {
          // Add subClassOf to the class entry
          const targetLabel = idToLabel.get(edge.target) || edge.target
          const entry = graph.find(e => e["@id"] === toUri(sourceLabel))
          if (entry) {
            entry["rdfs:subClassOf"] = { "@id": toUri(targetLabel) }
          }
        } else if (edge.target) {
          // Add as object property
          const targetLabel = idToLabel.get(edge.target) || edge.target
          const existing = graph.find(e => e["@id"] === toUri(predicate) && e["@type"] === "owl:ObjectProperty")
          if (!existing) {
            graph.push({
              "@id": toUri(predicate),
              "@type": "owl:ObjectProperty",
              "rdfs:domain": { "@id": toUri(sourceLabel) },
              "rdfs:range": { "@id": toUri(targetLabel) }
            })
          }
        }
      }

      const jsonld = {
        "@context": {
          "@vocab": "http://example.org/ontology#",
          "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
          "owl": "http://www.w3.org/2002/07/owl#",
          "xsd": "http://www.w3.org/2001/XMLSchema#"
        },
        "@id": toUri(currentOntology.name),
        "@type": "owl:Ontology",
        "rdfs:label": currentOntology.name,
        "@graph": graph
      }

      setJsonModalData({
        title: `${currentOntology.name} (Ontology)`,
        json: JSON.stringify(jsonld, null, 2)
      })
    }
    setShowJsonModal(true)
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
      {/* JSON Modal */}
      {showJsonModal && jsonModalData && (
        <>
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
            onClick={() => setShowJsonModal(false)}
          />
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              backgroundColor: '#1e293b',
              borderRadius: '8px',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.3)',
              zIndex: 1001,
              width: '80%',
              maxWidth: '800px',
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#f1f5f9' }}>
                {jsonModalData.title}
              </h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(jsonModalData.json)
                    alert('Copied to clipboard!')
                  }}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#6366f1',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  Copy
                </button>
                <button
                  onClick={() => {
                    const blob = new Blob([jsonModalData.json], { type: 'application/json' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `${jsonModalData.title.replace(/[^a-zA-Z0-9]/g, '_')}.json`
                    document.body.appendChild(a)
                    a.click()
                    document.body.removeChild(a)
                    URL.revokeObjectURL(url)
                  }}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#059669',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  Download
                </button>
                <button
                  onClick={() => setShowJsonModal(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '20px',
                    cursor: 'pointer',
                    color: '#94a3b8',
                    padding: '0 4px',
                  }}
                >
                  ×
                </button>
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
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
                {jsonModalData.json}
              </pre>
            </div>
          </div>
        </>
      )}
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
                    <button
                      onClick={handleCreateKnowledgeGraphClick}
                      disabled={!currentOntology}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: currentOntology ? '#6366f1' : '#94a3b8',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '14px',
                        fontWeight: 500,
                        cursor: currentOntology ? 'pointer' : 'not-allowed',
                        transition: 'background-color 0.2s',
                        opacity: currentOntology ? 1 : 0.6,
                      }}
                      onMouseEnter={(e) => {
                        if (currentOntology) {
                          e.currentTarget.style.backgroundColor = '#4f46e5'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (currentOntology) {
                          e.currentTarget.style.backgroundColor = '#6366f1'
                        }
                      }}
                      title={!currentOntology ? 'Select an ontology first' : ''}
                    >
                      Add Knowledge Graph Instance
                    </button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      onClick={handleShowJson}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#475569',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '14px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        transition: 'background-color 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#334155'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#475569'
                      }}
                    >
                      Show JSON
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
