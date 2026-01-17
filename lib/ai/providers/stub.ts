/**
 * Stub AI Provider
 * 
 * A placeholder provider for development and testing.
 * Returns mock data without actually calling any AI service.
 */

import { AIProvider, AIGenerationRequest, AIGenerationResponse } from '../types';

export class StubAIProvider implements AIProvider {
  readonly id = 'stub';
  readonly name = 'Stub Provider (Development)';

  isAvailable(): boolean {
    return true; // Always available for development
  }

  async generateSong(
    request: AIGenerationRequest
  ): Promise<AIGenerationResponse> {
    // Simulate async processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Return mock response
    return {
      audioURL: '/mock-audio.mp3', // Placeholder URL
      stems: ['/mock-stem-1.mp3', '/mock-stem-2.mp3'],
      metadata: {
        duration: 180,
        sampleRate: 44100,
        format: 'mp3',
        prompt: request.prompt.freeText,
      },
      provider: this.id,
      generationId: `stub-${Date.now()}`,
    };
  }
}



