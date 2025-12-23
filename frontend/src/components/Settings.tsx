export default function Settings() {
  return (
    <div style={{ width: '100%', height: '100%', overflow: 'auto', padding: '32px', backgroundColor: '#f8fafc' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '24px', color: '#1e293b' }}>Settings</h2>

        <div style={{
          backgroundColor: 'white',
          padding: '48px',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>&#9881;</div>
          <h3 style={{ fontSize: '20px', fontWeight: 600, color: '#1e293b', marginBottom: '12px' }}>
            Settings Coming Soon
          </h3>
          <p style={{ color: '#64748b', fontSize: '14px', maxWidth: '400px', margin: '0 auto' }}>
            Configuration options for language models and API keys will be available in a future update.
          </p>
        </div>
      </div>
    </div>
  );
}
