/** The direct OpenRouter path is usable with a key even if adapter startup failed. */
export function canAttemptOpenRouterRequest(availableProviders: string[], hasOpenRouterKey: boolean): boolean {
  return hasOpenRouterKey || availableProviders.some((provider) => provider !== 'mock-demo');
}
