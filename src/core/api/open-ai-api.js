import axios from 'axios';
import { baseURL } from '../helpers/index.js';

export const openAIApi = axios.create({
  baseURL: `${baseURL}/prompts`,
});
