export type AiMessageRole = 'user' | 'assistant';
export type AiMessageFeedback = 'helpful' | 'unhelpful' | null;

export type AiMessageRecord = {
  id: string;
  role: AiMessageRole;
  content: string;
  provider?: string;
  feedback: AiMessageFeedback;
  createdAt: string;
};

export type AiConversationSummary = {
  id: string;
  title: string;
  archived: boolean;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
};

export type AiConversationDetail = AiConversationSummary & { messages: AiMessageRecord[] };

export type AiConversationChatResult = {
  conversation: AiConversationSummary;
  userMessage: AiMessageRecord;
  assistantMessage: AiMessageRecord;
};

export function conversationTitle(message: string) {
  const normalized = message.replace(/\s+/g, ' ').trim();
  return normalized.slice(0, 28) || '新的学习对话';
}
