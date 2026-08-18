import { describe, expect, it } from 'vitest';

import { profileFromGisJwt, profileFromUserinfo } from './gis-signin';

function jwtWithPayload(payload: object): string {
  const json = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/u, '');
  return `hdr.${json}.sig`;
}

describe('profileFromGisJwt', () => {
  it('reads name, email, picture, and sub', () => {
    const token = jwtWithPayload({
      sub: 'sub-9',
      email: 'ada@example.com',
      name: 'Ada Lovelace',
      picture: 'https://example.com/ada.png',
    });
    expect(profileFromGisJwt(token)).toEqual({
      sub: 'sub-9',
      email: 'ada@example.com',
      name: 'Ada Lovelace',
      picture: 'https://example.com/ada.png',
    });
  });

  it('returns null when fields are missing', () => {
    expect(profileFromGisJwt(jwtWithPayload({ email: 'x@y.z' }))).toBeNull();
    expect(profileFromGisJwt('not-a-jwt')).toBeNull();
  });
});

describe('profileFromUserinfo', () => {
  it('reads name, email, picture, and sub', () => {
    expect(
      profileFromUserinfo({
        sub: 'sub-9',
        email: 'ada@example.com',
        name: 'Ada Lovelace',
        picture: 'https://example.com/ada.png',
      }),
    ).toEqual({
      sub: 'sub-9',
      email: 'ada@example.com',
      name: 'Ada Lovelace',
      picture: 'https://example.com/ada.png',
    });
  });
});
