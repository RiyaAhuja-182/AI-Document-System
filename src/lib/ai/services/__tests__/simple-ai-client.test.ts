import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SimpleAIClient } from '../simple-ai-client';

const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

describe('SimpleAIClient OpenRouter free router', () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
    delete process.env.OPENAI_API_KEY;
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'nvidia/nemotron-3-super-120b-a12b:free',
        choices: [{ message: { content: 'ok' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
      })
    } as Response);
  });

  it('sends the configured free router model to OpenRouter', async () => {
    const client = new SimpleAIClient();

    await client.generateCompletion({
      model: 'nvidia/nemotron-3-super-120b-a12b:free',
      messages: [{ role: 'user', content: 'Hello' }]
    });

    const [, request] = mockFetch.mock.calls[0];
    const body = JSON.parse(request?.body as string) as { model: string };

    expect(mockFetch.mock.calls[0][0]).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(body.model).toBe('nvidia/nemotron-3-super-120b-a12b:free');
  });
});
