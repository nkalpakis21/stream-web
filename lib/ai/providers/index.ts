/**
 * AI Provider Registration
 * 
 * Register all available AI providers here.
 * Providers are pluggable and can be added/removed without
 * changing the core application logic.
 */

import { getAIService } from '../types';
import { StubAIProvider } from './stub';
import { MusicGPTProvider } from './musicgpt';

// Initialize and register providers
const aiService = getAIService();

// Register stub provider for development
aiService.registerProvider(new StubAIProvider());

// Register MusicGPT provider for production usage. This provider only
// registers async tasks; audio is delivered later via webhook.
aiService.registerProvider(new MusicGPTProvider());

export { aiService };

