import { inject } from '@angular/core';

import { RADIO_WIDGET_ENABLED, SOUNDCLOUD_PLAYLIST_URL } from './radio.constants';
import { RadioService } from './radio.service';

const EMPTY_INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {},
  additionalProperties: false as const,
};

function radioUnavailable(): string {
  return 'Radio widget is disabled in this build.';
}

/** Empty-schema WebMCP tools that control the in-page SoundCloud radio. */
export function createRadioWebMcpTools() {
  if (!RADIO_WIDGET_ENABLED) {
    return [];
  }
  return [
    {
      name: 'get_radio_info',
      description:
        'Returns Play ITC radio metadata and current in-page playback state (not remote MCP audio).',
      inputSchema: EMPTY_INPUT_SCHEMA,
      execute: () => {
        const radio = inject(RadioService);
        radio.ensureListening();
        return radio.infoText();
      },
    },
    {
      name: 'play_radio',
      description: `Starts the Interchouette SoundCloud playlist (${SOUNDCLOUD_PLAYLIST_URL}) in this browser tab.`,
      inputSchema: EMPTY_INPUT_SCHEMA,
      execute: () => {
        const radio = inject(RadioService);
        radio.ensureListening();
        return radio.applyControl('play');
      },
    },
    {
      name: 'pause_radio',
      description: 'Pauses the Interchouette radio player in this browser tab.',
      inputSchema: EMPTY_INPUT_SCHEMA,
      execute: () => {
        const radio = inject(RadioService);
        radio.ensureListening();
        return radio.applyControl('pause');
      },
    },
    {
      name: 'toggle_radio',
      description: 'Toggles play/pause on the Interchouette radio player.',
      inputSchema: EMPTY_INPUT_SCHEMA,
      execute: () => {
        const radio = inject(RadioService);
        radio.ensureListening();
        return radio.applyControl('toggle');
      },
    },
    {
      name: 'next_radio_track',
      description: 'Skips to the next track on the Interchouette SoundCloud playlist.',
      inputSchema: EMPTY_INPUT_SCHEMA,
      execute: () => {
        const radio = inject(RadioService);
        radio.ensureListening();
        return radio.applyControl('next');
      },
    },
    {
      name: 'toggle_radio_mute',
      description: 'Toggles mute on the Interchouette radio player.',
      inputSchema: EMPTY_INPUT_SCHEMA,
      execute: () => {
        const radio = inject(RadioService);
        radio.ensureListening();
        return radio.applyControl('mute');
      },
    },
  ];
}

export function radioWebMcpDisabledTools() {
  if (RADIO_WIDGET_ENABLED) {
    return [];
  }
  return [
    {
      name: 'get_radio_info',
      description: 'Radio widget status (disabled in this build).',
      inputSchema: EMPTY_INPUT_SCHEMA,
      execute: () => radioUnavailable(),
    },
  ];
}
