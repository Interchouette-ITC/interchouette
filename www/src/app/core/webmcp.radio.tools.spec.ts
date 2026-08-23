import { createRadioWebMcpTools } from './webmcp.radio.tools';
import { RADIO_WIDGET_ENABLED } from './radio.constants';

describe('webmcp.radio.tools', () => {
  it('registers radio control tools when widget enabled', () => {
    const tools = createRadioWebMcpTools();
    if (!RADIO_WIDGET_ENABLED) {
      expect(tools).toEqual([]);
      return;
    }
    expect(tools.map((t) => t.name)).toEqual([
      'get_radio_info',
      'play_radio',
      'pause_radio',
      'toggle_radio',
      'next_radio_track',
      'toggle_radio_mute',
    ]);
  });
});
