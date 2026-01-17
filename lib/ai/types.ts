/**
 * AI Service Abstraction Layer
 * 
 * This layer abstracts AI provider implementations, allowing
 * pluggable providers without hard-coding vendor assumptions.
 */

export interface AIGenerationRequest {
  prompt: {
    structured: Record<string, unknown>;
    freeText: string;
  };
  parameters: {
    duration?: number;
    quality?: 'low' | 'medium' | 'high';
    [key: string]: unknown;
  };
  artistContext?: {
    styleDNA: {
      genres: string[];
      moods: string[];
      tempoRange: { min: number; max: number };
      influences: string[];
    };
    lore: string;
  };
}

export interface AIGenerationResponse {
  audioURL: string;
  stems?: string[];
  metadata: Record<string, unknown>;
  provider: string;
  generationId: string;
}

export interface AIProvider {
  /**
   * Unique identifier for this provider
   */
  readonly id: string;

  /**
   * Human-readable name
   */
  readonly name: string;

  /**
   * Generate a song based on the request
   */
  generateSong(request: AIGenerationRequest): Promise<AIGenerationResponse>;

  /**
   * Check if the provider is available/configured
   */
  isAvailable(): boolean;
}

/**
 * AI Service - Main interface for AI operations
 */
export class AIService {
  private providers: Map<string, AIProvider> = new Map();

  /**
   * Register an AI provider
   */
  registerProvider(provider: AIProvider): void {
    this.providers.set(provider.id, provider);
  }

  /**
   * Get a provider by ID
   */
  getProvider(providerId: string): AIProvider | null {
    return this.providers.get(providerId) || null;
  }

  /**
   * Get all available providers
   */
  getAvailableProviders(): AIProvider[] {
    return Array.from(this.providers.values()).filter(p => p.isAvailable());
  }

  /**
   * Generate a song using the specified provider
   */
  async generateSong(
    providerId: string,
    request: AIGenerationRequest
  ): Promise<AIGenerationResponse> {
    const provider = this.getProvider(providerId);
    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }
    if (!provider.isAvailable()) {
      throw new Error(`Provider ${providerId} is not available`);
    }
    return provider.generateSong(request);
  }
}

// Singleton instance
let aiServiceInstance: AIService | null = null;

export const getAIService = (): AIService => {
  if (!aiServiceInstance) {
    aiServiceInstance = new AIService();
  }
  return aiServiceInstance;
};



