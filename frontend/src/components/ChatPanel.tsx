import { useState, useEffect, useRef, useCallback } from 'react';
import type { Node, Edge } from 'reactflow';
import type { ChatMessage } from '../utils/storage';
import {
  getChatMessages,
  saveChatMessages,
  clearChatMessages,
  getChatPrompt,
  getChatPanelWidth,
  saveChatPanelWidth,
  CHAT_GREETING,
} from '../utils/storage';
import { API_URL, apiHeaders } from '../utils/api';

interface ChatPanelProps {
  ontologyId: string | null;
  ontologyName: string | null;
  username: string | null;
  nodes: Node[];
  edges: Edge[];
  onGraphUpdate: (nodes: Node[], edges: Edge[]) => void;
}

interface ChatAction {
  action: 'add_node' | 'remove_node' | 'add_edge' | 'remove_edge';
  label?: string;
  parent?: string;
  source?: string;
  target?: string;
}

export default function ChatPanel({ ontologyId, ontologyName, username, nodes, edges, onGraphUpdate }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [panelWidth, setPanelWidth] = useState(getChatPanelWidth);
  const [isResizing, setIsResizing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep refs to latest nodes/edges to avoid stale closures in async callbacks
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  useEffect(() => {
    nodesRef.current = nodes;
    edgesRef.current = edges;
  }, [nodes, edges]);

  // Load messages when ontology changes
  useEffect(() => {
    if (ontologyId) {
      const stored = getChatMessages(ontologyId);
      if (stored.length === 0) {
        // Add greeting message
        const greeting: ChatMessage = {
          id: 'greeting',
          role: 'assistant',
          content: CHAT_GREETING,
          timestamp: Date.now(),
        };
        setMessages([greeting]);
        saveChatMessages(ontologyId, [greeting]);
      } else {
        setMessages(stored);
      }
    } else {
      setMessages([]);
    }
  }, [ontologyId]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle resize
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current?.parentElement) return;
      const parentWidth = containerRef.current.parentElement.offsetWidth;
      const newWidth = ((parentWidth - e.clientX + containerRef.current.parentElement.getBoundingClientRect().left) / parentWidth) * 100;
      const clampedWidth = Math.min(50, Math.max(20, newWidth));
      setPanelWidth(clampedWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      saveChatPanelWidth(panelWidth);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, panelWidth]);

  // Extract JSON actions from message
  const extractActions = (content: string): ChatAction[] => {
    const actions: ChatAction[] = [];

    // Match ```json ... ``` blocks
    const jsonBlockRegex = /```json\s*([\s\S]*?)```/gi;
    let match;
    while ((match = jsonBlockRegex.exec(content)) !== null) {
      const jsonStr = match[1].trim();

      // Try parsing as single JSON first
      try {
        const parsed = JSON.parse(jsonStr);
        if (parsed.action) {
          actions.push(parsed as ChatAction);
        } else if (Array.isArray(parsed)) {
          // Handle array of actions
          parsed.forEach((item: ChatAction) => {
            if (item.action) actions.push(item);
          });
        }
        continue;
      } catch {
        // Not valid single JSON, try line by line
      }

      // Parse each line as separate JSON (handles multiple objects in one block)
      const lines = jsonStr.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('{')) continue;
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed.action) {
            actions.push(parsed as ChatAction);
          }
        } catch {
          // Ignore parse errors for individual lines
        }
      }
    }

    // Also try to find inline JSON objects with "action" field
    if (actions.length === 0) {
      const inlineRegex = /\{[^{}]*"action"\s*:\s*"[^"]+(?:_[^"]+)?"[^{}]*\}/g;
      while ((match = inlineRegex.exec(content)) !== null) {
        try {
          const parsed = JSON.parse(match[0]);
          if (parsed.action) {
            actions.push(parsed as ChatAction);
          }
        } catch {
          // Ignore parse errors for inline attempts
        }
      }
    }

    return actions;
  };

  // Apply actions to graph
  const applyActions = (actions: ChatAction[]) => {
    let newNodes = [...nodesRef.current];
    let newEdges = [...edgesRef.current];

    for (const action of actions) {
      switch (action.action) {
        case 'add_node': {
          if (!action.label) break;
          const existingNode = newNodes.find(n => n.data.label === action.label);
          if (existingNode) break;

          // Find position (place below parent or at bottom)
          let y = 150;
          let x = 50;
          if (action.parent) {
            const parentNode = newNodes.find(n => n.data.label === action.parent);
            if (parentNode) {
              y = parentNode.position.y + 120;
              x = parentNode.position.x;
            }
          } else {
            // Find max y position
            const maxY = Math.max(...newNodes.map(n => n.position.y), 0);
            y = maxY + 120;
          }
          // Avoid overlap
          while (newNodes.some(n => Math.abs(n.position.x - x) < 50 && Math.abs(n.position.y - y) < 50)) {
            x += 180;
          }

          const newNode: Node = {
            id: `node-${Date.now()}`,
            type: 'default',
            position: { x, y },
            data: { label: action.label },
            style: { background: '#6366f1', color: 'white', border: 'none' },
          };
          newNodes.push(newNode);

          // Add edge to parent if specified
          if (action.parent) {
            const parentNode = newNodes.find(n => n.data.label === action.parent);
            if (parentNode) {
              newEdges.push({
                id: `edge-${Date.now()}`,
                source: newNode.id,
                target: parentNode.id,
                label: 'subClassOf',
              });
            }
          }
          break;
        }

        case 'remove_node': {
          if (!action.label) break;
          const nodeToRemove = newNodes.find(n => n.data.label === action.label);
          if (!nodeToRemove) break;

          newNodes = newNodes.filter(n => n.id !== nodeToRemove.id);
          newEdges = newEdges.filter(e => e.source !== nodeToRemove.id && e.target !== nodeToRemove.id);
          break;
        }

        case 'add_edge': {
          if (!action.source || !action.target) break;
          const sourceNode = newNodes.find(n => n.data.label === action.source);
          const targetNode = newNodes.find(n => n.data.label === action.target);
          if (!sourceNode || !targetNode) break;

          const existingEdge = newEdges.find(
            e => e.source === sourceNode.id && e.target === targetNode.id
          );
          if (existingEdge) break;

          newEdges.push({
            id: `edge-${Date.now()}-${Math.random()}`,
            source: sourceNode.id,
            target: targetNode.id,
            label: action.label || 'relatedTo',
          });
          break;
        }

        case 'remove_edge': {
          if (!action.source || !action.target) break;
          const sourceNode = newNodes.find(n => n.data.label === action.source);
          const targetNode = newNodes.find(n => n.data.label === action.target);
          if (!sourceNode || !targetNode) break;

          newEdges = newEdges.filter(
            e => !(e.source === sourceNode.id && e.target === targetNode.id)
          );
          break;
        }
      }
    }

    // Always update if we processed actions - the arrays are always new
    onGraphUpdate(newNodes, newEdges);

    // Save to backend
    if (ontologyId && username && ontologyName) {
      fetch(`${API_URL}/ontologies/${username}/${ontologyId}`, {
        method: 'PUT',
        headers: apiHeaders(),
        body: JSON.stringify({
          id: ontologyId,
          name: ontologyName,
          graph: { nodes: newNodes, edges: newEdges }
        }),
      }).catch((error) => {
        console.error('Failed to save ontology:', error);
      });
    }
  };

  const handleSend = async () => {
    if (!inputValue.trim() || !ontologyId || isLoading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: inputValue.trim(),
      timestamp: Date.now(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    saveChatMessages(ontologyId, newMessages);
    setInputValue('');
    setIsLoading(true);

    try {
      // Build context about current ontology
      const nodeLabels = nodes.map(n => n.data.label).join(', ');
      const edgeDescriptions = edges.map(e => {
        const sourceNode = nodes.find(n => n.id === e.source);
        const targetNode = nodes.find(n => n.id === e.target);
        return `${sourceNode?.data.label || e.source} -[${e.label || 'relatedTo'}]-> ${targetNode?.data.label || e.target}`;
      }).join('\n');

      const systemPrompt = getChatPrompt();
      const contextPrompt = `Current ontology state:
Nodes: ${nodeLabels || 'none'}
Relationships:
${edgeDescriptions || 'none'}

${systemPrompt}`;

      const response = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({
          messages: [
            { role: 'system', content: contextPrompt },
            ...newMessages.filter(m => m.role !== 'system').map(m => ({
              role: m.role,
              content: m.content,
            })),
          ],
        }),
      });

      if (!response.ok) {
        throw new Error('Chat request failed');
      }

      const data = await response.json();
      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.content,
        timestamp: Date.now(),
      };

      const updatedMessages = [...newMessages, assistantMessage];
      setMessages(updatedMessages);
      saveChatMessages(ontologyId, updatedMessages);

      // Apply any actions in the response
      const actions = extractActions(data.content);
      if (actions.length > 0) {
        applyActions(actions);
      }
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please make sure the backend is running and has an OpenAI API key configured.',
        timestamp: Date.now(),
      };
      const updatedMessages = [...newMessages, errorMessage];
      setMessages(updatedMessages);
      saveChatMessages(ontologyId, updatedMessages);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    if (!ontologyId) return;
    clearChatMessages(ontologyId);
    const greeting: ChatMessage = {
      id: 'greeting',
      role: 'assistant',
      content: CHAT_GREETING,
      timestamp: Date.now(),
    };
    setMessages([greeting]);
    saveChatMessages(ontologyId, [greeting]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!ontologyId) {
    return (
      <div
        ref={containerRef}
        style={{
          width: `${panelWidth}%`,
          height: '100%',
          backgroundColor: '#f8fafc',
          borderLeft: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#94a3b8',
          fontSize: '14px',
        }}
      >
        Select an ontology to use the chat assistant
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: `${panelWidth}%`,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#ffffff',
        borderLeft: '1px solid #e2e8f0',
        position: 'relative',
      }}
    >
      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: '4px',
          cursor: 'ew-resize',
          backgroundColor: isResizing ? '#6366f1' : 'transparent',
          transition: 'background-color 0.2s',
          zIndex: 10,
        }}
        onMouseEnter={(e) => {
          if (!isResizing) (e.target as HTMLElement).style.backgroundColor = '#cbd5e1';
        }}
        onMouseLeave={(e) => {
          if (!isResizing) (e.target as HTMLElement).style.backgroundColor = 'transparent';
        }}
      />

      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#f8fafc',
        }}
      >
        <span style={{ fontWeight: 600, color: '#1e293b', fontSize: '14px' }}>
          Ontology Assistant
        </span>
        <button
          onClick={handleClearChat}
          style={{
            padding: '4px 8px',
            backgroundColor: 'transparent',
            color: '#64748b',
            border: '1px solid #e2e8f0',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          Clear
        </button>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {messages.map((message) => (
          <div
            key={message.id}
            style={{
              display: 'flex',
              justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <div
              style={{
                maxWidth: '85%',
                padding: '10px 14px',
                borderRadius: message.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                backgroundColor: message.role === 'user' ? '#6366f1' : '#f1f5f9',
                color: message.role === 'user' ? 'white' : '#1e293b',
                fontSize: '14px',
                lineHeight: '1.5',
                whiteSpace: 'pre-wrap',
              }}
            >
              {message.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '16px 16px 16px 4px',
                backgroundColor: '#f1f5f9',
                color: '#64748b',
                fontSize: '14px',
              }}
            >
              Thinking...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid #e2e8f0',
          backgroundColor: '#f8fafc',
        }}
      >
        <div style={{ display: 'flex', gap: '8px' }}>
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your ontology..."
            disabled={isLoading}
            style={{
              flex: 1,
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              fontSize: '14px',
              resize: 'none',
              minHeight: '40px',
              maxHeight: '120px',
              fontFamily: 'inherit',
            }}
            rows={1}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !inputValue.trim()}
            style={{
              padding: '10px 16px',
              backgroundColor: isLoading || !inputValue.trim() ? '#94a3b8' : '#6366f1',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: isLoading || !inputValue.trim() ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: 500,
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
