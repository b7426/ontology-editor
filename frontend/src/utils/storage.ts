/**
 * Local storage utilities for chat and settings
 */

const STORAGE_KEYS = {
  CHAT_MESSAGES: 'ontology-editor-chat-messages',
  CHAT_PROMPT: 'ontology-editor-chat-prompt',
  CHAT_PANEL_WIDTH: 'ontology-editor-chat-panel-width',
} as const;

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export const DEFAULT_CHAT_PROMPT = `You are an ontology assistant. Output JSON action blocks to make changes. Without JSON blocks, no changes are made.

Available actions:

1. Add STRING PROPERTY (DEFAULT):
\`\`\`json
{"action": "add_property", "class": "ClassName", "property": "propertyName"}
\`\`\`

2. Add CLASS (only if user says "class", "node", or "concept"):
\`\`\`json
{"action": "add_node", "label": "ClassName", "parent": "OptionalParent"}
\`\`\`

3. Link to EXISTING class (only if target class already exists):
\`\`\`json
{"action": "add_edge", "source": "SourceClass", "target": "ExistingClass", "label": "predicate"}
\`\`\`

4. Remove:
\`\`\`json
{"action": "remove_node", "label": "ClassName"}
{"action": "remove_edge", "source": "Source", "target": "Target"}
\`\`\`

ALWAYS DEFAULT TO STRING PROPERTY (add_property) unless:
- User explicitly says "class", "node", or "concept" -> use add_node
- User wants to link to a class that ALREADY EXISTS in the ontology -> use add_edge

Examples:
- "add commonName to Sandwich" -> add_property (string)
- "Sandwich has a name" -> add_property (string)
- "add Ingredient as a class" -> add_node (new class)
- "Sandwich uses Bread" (Bread exists) -> add_edge (link)

Keep responses brief.`;

export const CHAT_GREETING = `Hello! I can help you refine your ontology. You can ask me to:

- **Add** new classes or concepts
- **Remove** existing nodes
- **Connect** classes with relationships
- **Clarify** or explain the structure

Try something like "Add a new class called Ingredient" or "Remove the Condiment class"`;

/**
 * Get chat messages for a specific ontology
 */
export function getChatMessages(ontologyId: string): ChatMessage[] {
  try {
    const stored = localStorage.getItem(`${STORAGE_KEYS.CHAT_MESSAGES}-${ontologyId}`);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

/**
 * Save chat messages for a specific ontology
 */
export function saveChatMessages(ontologyId: string, messages: ChatMessage[]): void {
  try {
    localStorage.setItem(`${STORAGE_KEYS.CHAT_MESSAGES}-${ontologyId}`, JSON.stringify(messages));
  } catch (e) {
    console.error('Failed to save chat messages:', e);
  }
}

/**
 * Clear chat messages for a specific ontology
 */
export function clearChatMessages(ontologyId: string): void {
  try {
    localStorage.removeItem(`${STORAGE_KEYS.CHAT_MESSAGES}-${ontologyId}`);
  } catch (e) {
    console.error('Failed to clear chat messages:', e);
  }
}

/**
 * Get the custom chat prompt
 */
export function getChatPrompt(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.CHAT_PROMPT);
    return stored || DEFAULT_CHAT_PROMPT;
  } catch {
    return DEFAULT_CHAT_PROMPT;
  }
}

/**
 * Save the custom chat prompt
 */
export function saveChatPrompt(prompt: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.CHAT_PROMPT, prompt);
  } catch (e) {
    console.error('Failed to save chat prompt:', e);
  }
}

/**
 * Reset chat prompt to default
 */
export function resetChatPrompt(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.CHAT_PROMPT);
  } catch (e) {
    console.error('Failed to reset chat prompt:', e);
  }
}

/**
 * Get saved chat panel width percentage
 */
export function getChatPanelWidth(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.CHAT_PANEL_WIDTH);
    const width = stored ? parseFloat(stored) : 30;
    return Math.min(50, Math.max(20, width));
  } catch {
    return 30;
  }
}

/**
 * Save chat panel width percentage
 */
export function saveChatPanelWidth(width: number): void {
  try {
    const clampedWidth = Math.min(50, Math.max(20, width));
    localStorage.setItem(STORAGE_KEYS.CHAT_PANEL_WIDTH, clampedWidth.toString());
  } catch (e) {
    console.error('Failed to save chat panel width:', e);
  }
}
