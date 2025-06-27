import { openAIApi } from '../api/index.js';
import { createPromptRequest } from '../models/index.js';

export async function generateCode(propmtData) {
  try {
    const payload = createPromptRequest(propmtData);
    const { data } = await openAIApi.post('/generate', payload);
    return { ok: true, data };
  } catch (error) {
    console.log(error);
    return { ok: false, error };
  }
}
