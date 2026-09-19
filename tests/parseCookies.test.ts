import { describe, it, expect } from 'vitest';
import { parseCookieInput } from '../src/config.ts';

describe('parseCookieInput', () => {
  it('parses cookie header style', () => {
    const input = 'guest_id=v1%3A123; twid=u%3D1984; ct0=abc123def; lang=ja; auth_token=9876543210abcdef';
    expect(parseCookieInput(input)).toEqual({ AUTH_TOKEN: '9876543210abcdef', CT0: 'abc123def' });
  });

  it('parses raw JSON', () => {
    const input = '{"auth_token": "tok1", "ct0": "ct0val"}';
    expect(parseCookieInput(input)).toEqual({ AUTH_TOKEN: 'tok1', CT0: 'ct0val' });
  });

  it('parses name:value style on separate lines', () => {
    const input = 'auth_token: aaaabbbb\nct0 = ccccdddd';
    expect(parseCookieInput(input)).toEqual({ AUTH_TOKEN: 'aaaabbbb', CT0: 'ccccdddd' });
  });

  it('returns null on garbage', () => {
    expect(parseCookieInput('hello world')).toBeNull();
    expect(parseCookieInput('')).toBeNull();
    expect(parseCookieInput('ct0=only')).toBeNull();
  });

  it('decodes URI components', () => {
    const input = 'auth_token=a%2Bb; ct0=c%2Cd';
    expect(parseCookieInput(input)).toEqual({ AUTH_TOKEN: 'a+b', CT0: 'c,d' });
  });
});
