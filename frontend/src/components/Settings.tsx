import { useState, useEffect } from 'react';
import {
  getChatPrompt,
  saveChatPrompt,
  resetChatPrompt,
  DEFAULT_CHAT_PROMPT,
} from '../utils/storage';

export default function Settings() {
  const [activeTab, setActiveTab] = useState<'general' | 'prompts'>('general');
  const [chatPrompt, setChatPrompt] = useState('');
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    setChatPrompt(getChatPrompt());
  }, []);

  const handleSavePrompt = () => {
    saveChatPrompt(chatPrompt);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleResetPrompt = () => {
    resetChatPrompt();
    setChatPrompt(DEFAULT_CHAT_PROMPT);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const tabStyle = (tab: 'general' | 'prompts') => ({
    padding: '8px 16px',
    backgroundColor: activeTab === tab ? '#6366f1' : '#e2e8f0',
    color: activeTab === tab ? 'white' : '#64748b',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
  });

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'auto', padding: '32px', backgroundColor: '#f8fafc' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '24px', color: '#1e293b' }}>Settings</h2>

        {/* Tab navigation */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
          <button style={tabStyle('general')} onClick={() => setActiveTab('general')}>
            General
          </button>
          <button style={tabStyle('prompts')} onClick={() => setActiveTab('prompts')}>
            Chat Prompts
          </button>
        </div>

        {activeTab === 'general' && (
          <div style={{
            backgroundColor: 'white',
            padding: '48px',
            borderRadius: '8px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>&#9881;</div>
            <h3 style={{ fontSize: '20px', fontWeight: 600, color: '#1e293b', marginBottom: '12px' }}>
              General Settings
            </h3>
            <p style={{ color: '#64748b', fontSize: '14px', maxWidth: '400px', margin: '0 auto' }}>
              Additional configuration options will be available in a future update.
            </p>
          </div>
        )}

        {activeTab === 'prompts' && (
          <div style={{
            backgroundColor: 'white',
            padding: '24px',
            borderRadius: '8px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
              Chat System Prompt
            </h3>
            <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '16px' }}>
              Customize the instructions given to the AI assistant. This prompt defines how the assistant
              understands and responds to your requests about ontology modifications.
            </p>

            <textarea
              value={chatPrompt}
              onChange={(e) => setChatPrompt(e.target.value)}
              style={{
                width: '100%',
                minHeight: '300px',
                padding: '12px',
                borderRadius: '6px',
                border: '1px solid #e2e8f0',
                fontSize: '13px',
                fontFamily: 'monospace',
                lineHeight: '1.5',
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />

            <div style={{ display: 'flex', gap: '12px', marginTop: '16px', justifyContent: 'flex-end' }}>
              <button
                onClick={handleResetPrompt}
                style={{
                  padding: '10px 16px',
                  backgroundColor: 'transparent',
                  color: '#64748b',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                Reset to Default
              </button>
              <button
                onClick={handleSavePrompt}
                style={{
                  padding: '10px 16px',
                  backgroundColor: '#6366f1',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                }}
              >
                {isSaved ? 'Saved!' : 'Save Prompt'}
              </button>
            </div>

            <div style={{
              marginTop: '24px',
              padding: '16px',
              backgroundColor: '#f8fafc',
              borderRadius: '6px',
              border: '1px solid #e2e8f0',
            }}>
              <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
                Tips for Effective Prompts
              </h4>
              <ul style={{ color: '#64748b', fontSize: '13px', margin: 0, paddingLeft: '20px', lineHeight: '1.6' }}>
                <li>Define the JSON format for ontology actions (add_node, remove_node, add_edge, remove_edge)</li>
                <li>Include examples of expected commands and responses</li>
                <li>Specify any domain-specific terminology or constraints</li>
                <li>Keep the prompt concise to save tokens and improve response time</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
