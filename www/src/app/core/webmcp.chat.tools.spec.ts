import {
  chatCapabilitiesText,
  createChatInfoWebMcpTools,
  createChatSendWebMcpTools,
} from './webmcp.chat.tools';

describe('webmcp.chat.tools', () => {
  it('describes live and away chat plus remote MCP', () => {
    const text = chatCapabilitiesText();
    expect(text).toContain('api.interchouette.net');
    expect(text).toContain('open_site_chat');
    expect(text).toContain('send_site_chat_message');
    expect(text).toContain('mcp.interchouette.net');
  });

  it('registers discovery and send tools when the widget is enabled', () => {
    const info = createChatInfoWebMcpTools();
    const send = createChatSendWebMcpTools();
    expect(info.map((t) => t.name)).toEqual(['list_chat_capabilities', 'open_site_chat']);
    expect(send.map((t) => t.name)).toEqual(['send_site_chat_message']);
  });
});
