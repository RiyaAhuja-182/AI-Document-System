import { parseAIAPIError } from '../ai-api-errors';

describe('parseAIAPIError', () => {
  it('extracts public error fields from a JSON API response', () => {
    expect(parseAIAPIError(JSON.stringify({
      error: 'Rate limit exceeded',
      message: 'Wait and retry.',
      code: 'RATE_LIMIT_EXCEEDED',
      details: { internal: 'not forwarded' },
    }))).toEqual({
      error: 'Rate limit exceeded',
      message: 'Wait and retry.',
      code: 'RATE_LIMIT_EXCEEDED',
    });
  });

  it('returns an empty result for empty or malformed bodies', () => {
    expect(parseAIAPIError('')).toEqual({});
    expect(parseAIAPIError('<html>gateway error</html>')).toEqual({});
  });
});
