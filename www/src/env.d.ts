interface ImportMetaEnv {
  readonly CHAT_WIDGET_ENABLED?: string;
  readonly GIS_CLIENT_ID?: string;
  readonly RADIO_WIDGET_ENABLED?: string;
}

interface ImportMeta {
  readonly env?: ImportMetaEnv;
}
