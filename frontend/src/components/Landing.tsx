interface LandingProps {
  onLoginClick: () => void;
}

export default function Landing({ onLoginClick }: LandingProps) {
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f8fafc',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <header style={{
        backgroundColor: 'white',
        borderBottom: '1px solid #e2e8f0',
        padding: '16px 32px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#6366f1', margin: 0 }}>
          Ontology Editor
        </h1>
        <button
          onClick={onLoginClick}
          style={{
            padding: '10px 24px',
            backgroundColor: '#6366f1',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Log In
        </button>
      </header>

      {/* Hero Section */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 32px' }}>
        <div style={{ textAlign: 'center', maxWidth: '800px' }}>
          <h2 style={{
            fontSize: '48px',
            fontWeight: 'bold',
            color: '#1e293b',
            marginBottom: '24px',
            lineHeight: 1.2,
          }}>
            Build and Visualize Knowledge Graphs with Ease
          </h2>
          <p style={{
            fontSize: '20px',
            color: '#64748b',
            marginBottom: '40px',
            lineHeight: 1.6,
          }}>
            Create, edit, and export ontologies using an intuitive visual interface.
            Perfect for researchers, data scientists, and knowledge engineers.
          </p>
          <button
            onClick={onLoginClick}
            style={{
              padding: '16px 48px',
              backgroundColor: '#6366f1',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '18px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)',
            }}
          >
            Get Started
          </button>
        </div>

        {/* Features */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '32px',
          marginTop: '80px',
          width: '100%',
          maxWidth: '1000px',
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '32px',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}>
            <div style={{ fontSize: '32px', marginBottom: '16px' }}>&#128200;</div>
            <h3 style={{ fontSize: '20px', fontWeight: 600, color: '#1e293b', marginBottom: '12px' }}>
              Visual Graph Editor
            </h3>
            <p style={{ color: '#64748b', lineHeight: 1.6 }}>
              Drag and drop nodes, create relationships, and see your ontology come to life in real-time.
            </p>
          </div>

          <div style={{
            backgroundColor: 'white',
            padding: '32px',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}>
            <div style={{ fontSize: '32px', marginBottom: '16px' }}>&#128196;</div>
            <h3 style={{ fontSize: '20px', fontWeight: 600, color: '#1e293b', marginBottom: '12px' }}>
              Triples View
            </h3>
            <p style={{ color: '#64748b', lineHeight: 1.6 }}>
              See your knowledge graph as RDF triples with hierarchical indentation for easy understanding.
            </p>
          </div>

          <div style={{
            backgroundColor: 'white',
            padding: '32px',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}>
            <div style={{ fontSize: '32px', marginBottom: '16px' }}>&#128190;</div>
            <h3 style={{ fontSize: '20px', fontWeight: 600, color: '#1e293b', marginBottom: '12px' }}>
              Export to Turtle
            </h3>
            <p style={{ color: '#64748b', lineHeight: 1.6 }}>
              Export your ontology in Turtle format for use with semantic web tools and triple stores.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer style={{
        backgroundColor: '#1e293b',
        color: '#94a3b8',
        padding: '24px 32px',
        textAlign: 'center',
        fontSize: '14px',
      }}>
        Ontology Editor - Built for Knowledge Engineers
      </footer>
    </div>
  );
}
