export const createPromptRequest = (promptData) => ({
  prompt: promptData.prompt,
  model: promptData.model || 'gpt-4o-mini',
});
