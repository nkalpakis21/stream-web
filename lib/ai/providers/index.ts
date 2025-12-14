/**
 * AI Provider Registration
 * 
 * Register all available AI providers here.
 * Providers are pluggable and can be added/removed without
 * changing the core application logic.
 */

import { getAIService } from '../types';
import { StubAIProvider } from './stub';

// Initialize and register providers
const aiService = getAIService();

// Register stub provider for development
aiService.registerProvider(new StubAIProvider());

// TODO: Register real providers here
// aiService.registerProvider(new OpenAIProvider());
// aiService.registerProvider(new StabilityAIProvider());

export { aiService };

