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

export const DEFAULT_CHAT_PROMPT = `You are an ontology assistant. You MUST output JSON action blocks to make changes to the ontology. Without the JSON blocks, no changes will be made.

IMPORTANT: When the user asks to add, remove, or modify anything, you MUST include the appropriate JSON block(s) in your response. The JSON blocks are executed automatically.

Available actions:

Add a node (class):
\`\`\`json
{"action": "add_node", "label": "ClassName", "parent": "OptionalParentClass"}
\`\`\`

Remove a node:
\`\`\`json
{"action": "remove_node", "label": "ClassName"}
\`\`\`

Add a relationship/attribute - ALWAYS include a meaningful predicate:
\`\`\`json
{"action": "add_edge", "source": "SourceClass", "target": "TargetClass", "label": "predicateName"}
\`\`\`
Examples of good predicates:
- For attributes: hasNickname, hasAge, hasColor, hasSize
- For relationships: isPartOf, contains, uses, creates, belongsTo

Remove a relationship:
\`\`\`json
{"action": "remove_edge", "source": "SourceClass", "target": "TargetClass"}
\`\`\`

You can include multiple JSON blocks in one response to make multiple changes.

Keep explanations brief. Always output the JSON blocks when making changes - do not just describe what you would do. When adding edges, always use a descriptive predicate that makes the relationship clear (e.g., "hasNickname" not just "has").`;

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
