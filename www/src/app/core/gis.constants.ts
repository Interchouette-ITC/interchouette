/** Google Identity Services OAuth client id (public). Override with `GIS_CLIENT_ID` in `.env`. */
const GIS_CLIENT_ID_DEFAULT =
  '774566063707-vt0597s55c7on1ivfach7a36cchf94e6.apps.googleusercontent.com';

export const GIS_CLIENT_ID = (import.meta.env?.GIS_CLIENT_ID ?? GIS_CLIENT_ID_DEFAULT).trim();
