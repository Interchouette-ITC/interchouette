import { inject } from '@angular/core';

import { CHAT_WIDGET_ENABLED } from './chat.constants';
import { ChatService } from './chat.service';

const EMPTY_INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {},
  additionalProperties: false as const,
};

const SEND_MESSAGE_INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    message: {
      type: 'string' as const,
      description: 'Visitor message to send in the site chat (Greg live or ITCy away).',
      minLength: 1,
      maxLength: 2000,
    },
  },
  required: ['message'] as const,
  additionalProperties: false as const,
};

export function chatCapabilitiesText(): string {
  if (!CHAT_WIDGET_ENABLED) {
    return 'Site chat widget is disabled in this build.';
  }
  return [
    'Site chat widget (bottom-right FAB) talks to api.interchouette.net.',
    'Live: Greg replies via Slack DM into the panel.',
    'Away: ITCy answers using remote Interchouette MCP + OpenRouter.',
    'WebMCP tools: list_chat_capabilities, open_site_chat, send_site_chat_message.',
    'Declarative form tool on the compose form: send_site_chat_message (toolname attribute).',
    'Remote MCP also exposes token-gated Slack tools at https://mcp.interchouette.net/',
  ].join('\n');
}

/** Empty-schema chat discovery / open tools. */
export function createChatInfoWebMcpTools() {
  if (!CHAT_WIDGET_ENABLED) {
    return [];
  }
  return [
    {
      name: 'list_chat_capabilities',
      description:
        'Explains Interchouette site chat (live vs away) and which WebMCP / remote MCP chat tools exist.',
      inputSchema: EMPTY_INPUT_SCHEMA,
      execute: () => chatCapabilitiesText(),
    },
    {
      name: 'open_site_chat',
      description: 'Opens the Interchouette site chat panel (FAB) in this browser tab.',
      inputSchema: EMPTY_INPUT_SCHEMA,
      execute: async () => {
        const chat = inject(ChatService);
        await chat.openPanel();
        return `Chat panel open. Mode: ${chat.mode()}. Ticket: ${chat.shortCode() || '(connecting)'}`;
      },
    },
  ];
}

/** Message-arg chat send tool. */
export function createChatSendWebMcpTools() {
  if (!CHAT_WIDGET_ENABLED) {
    return [];
  }
  return [
    {
      name: 'send_site_chat_message',
      description:
        'Opens site chat if needed and sends a visitor message (same path as the compose form).',
      inputSchema: SEND_MESSAGE_INPUT_SCHEMA,
      execute: async ({ message }: { message: string }) => {
        const text = message.trim();
        if (!text) {
          throw new Error('message is required');
        }
        const chat = inject(ChatService);
        if (!chat.open()) {
          await chat.openPanel();
        }
        if (!chat.wsReady()) {
          await chat.warm();
          await chat.openPanel();
        }
        if (!chat.wsReady()) {
          throw new Error(chat.error() ?? 'Chat is not connected');
        }
        chat.send(text);
        return `Sent. Mode: ${chat.mode()}. Ticket: ${chat.shortCode()}`;
      },
    },
  ];
}
