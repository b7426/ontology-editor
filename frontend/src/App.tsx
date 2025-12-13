import { useEffect, useState, useCallback } from 'react'
import OntologyGraph from './components/OntologyGraph'
import TriplesView from './components/TriplesView'
import { downloadTurtle } from './utils/exportRdf'
import type { Node, Edge } from 'reactflow'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

type TabType = 'graph' | 'triples'

function App() {
  const [backendStatus, setBackendStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  const [activeTab, setActiveTab] = useState<TabType>('graph')
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])

  useEffect(() => {
    fetch(`${API_URL}/health`)
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

  const handleGraphChange = useCallback((newNodes: Node[], newEdges: Edge[]) => {
    setNodes(newNodes)
    setEdges(newEdges)
  }, [])

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

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{
        backgroundColor: '#1e293b',
        color: 'white',
        padding: '16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>Ontology Editor</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '14px' }}>
          <button
            onClick={() => downloadTurtle(nodes, edges)}
            disabled={nodes.length === 0}
            style={{
              padding: '6px 12px',
              backgroundColor: nodes.length === 0 ? '#475569' : '#059669',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: nodes.length === 0 ? 'not-allowed' : 'pointer',
              fontSize: '13px',
            }}
          >
            Export Turtle
          </button>
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
        </div>
      </header>
      <div style={{ backgroundColor: '#1e293b', paddingLeft: '16px', paddingBottom: '0' }}>
        <button style={tabStyle('graph')} onClick={() => setActiveTab('graph')}>
          Graph View
        </button>
        <button style={tabStyle('triples')} onClick={() => setActiveTab('triples')}>
          Triples View
        </button>
      </div>
      <main style={{ flex: 1, backgroundColor: activeTab === 'triples' ? '#ffffff' : undefined }}>
        {activeTab === 'graph' && <OntologyGraph onGraphChange={handleGraphChange} />}
        {activeTab === 'triples' && <TriplesView nodes={nodes} edges={edges} />}
      </main>
    </div>
  )
}

export default App
