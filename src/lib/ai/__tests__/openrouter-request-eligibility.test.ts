import { canAttemptOpenRouterRequest } from '../openrouter-request-eligibility';

describe('canAttemptOpenRouterRequest', () => {
  it('allows the direct OpenRouter path when a key exists but the adapter registry is empty', () => {
    expect(canAttemptOpenRouterRequest([], true)).toBe(true);
  });

  it('does not treat the mock provider as a real provider without a key', () => {
    expect(canAttemptOpenRouterRequest(['mock-demo'], false)).toBe(false);
  });

  it('allows a registered real provider', () => {
    expect(canAttemptOpenRouterRequest(['openrouter'], false)).toBe(true);
  });
});
