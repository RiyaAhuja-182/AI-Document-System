export function createAIProviderUnavailableResponse(): Response {
  return Response.json({
    success: false,
    error: 'AI provider unavailable',
    code: 'PROVIDER_UNAVAILABLE',
    message: 'The configured AI provider could not generate a response. Check the provider configuration and try again.'
  }, { status: 503 });
}
