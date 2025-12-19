'use client';

import { useState, useEffect } from 'react';
import type { GenerationDocument } from '@/types/firestore';

interface DeveloperSectionProps {
  generations: Array<Omit<GenerationDocument, 'createdAt' | 'completedAt'> & {
    createdAt: number;
    completedAt: number | null;
  }>;
  songId: string;
}

export function DeveloperSection({ generations, songId }: DeveloperSectionProps) {
  const [simulating, setSimulating] = useState(false);
  const [simulationResults, setSimulationResults] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLocalhost, setIsLocalhost] = useState(false);

  // Check if we're on localhost (client-side only)
  useEffect(() => {
    setIsLocalhost(window.location.hostname.includes('localhost'));
  }, []);

  const musicGPTGenerations = generations.filter(g => g.provider === 'musicgpt');

  const handleSimulateWebhooks = async () => {
    setSimulating(true);
    setSimulationResults([]);
    const results: string[] = [];

    try {
      for (const generation of musicGPTGenerations) {
        if (!generation.providerTaskId || !generation.providerConversionIds?.length) {
          results.push(`⚠️ Generation ${generation.id}: Missing task_id or conversion_ids`);
          continue;
        }

        // Extract conversion IDs
        const conversion1Id = generation.providerConversionIds[0];
        const conversion2Id = generation.providerConversionIds[1];

        // IMPORTANT: This simulator must match the webhook handler logic.
        // The webhook handler receives conversion_path from MusicGPT's webhook payload,
        // but we need to fetch it via getConversionDataByConversionID to simulate the same behavior.
        // See: app/api/webhooks/musicgpt/route.ts for the actual webhook handler logic.
        
        // Fetch conversion details from MusicGPT API (same as webhook handler does)
        // This is what provides the conversion_path URLs
        // Note: The API returns {success: true, conversion: {...}} where conversion contains
        // conversion_path_1, conversion_path_2, conversion_id_1, conversion_id_2, etc.
        const conversionDataMap: Record<string, { success: boolean; conversion: Record<string, unknown> }> = {};
        
        for (const conversionId of generation.providerConversionIds) {
          results.push(`🔄 Fetching conversion details for ${conversionId.substring(0, 8)}...`);
          
          try {
            // Call API route that proxies getConversionDataByConversionID
            const response = await fetch(`/api/musicgpt/conversion/${conversionId}`);
            
            if (response.ok) {
              const details = await response.json() as { success: boolean; conversion: Record<string, unknown> };
              conversionDataMap[conversionId] = details;
              results.push(`✅ Fetched details for ${conversionId.substring(0, 8)}...`);
            } else {
              const error = await response.json().catch(() => ({ error: 'Unknown error' }));
              results.push(`❌ Failed to fetch ${conversionId.substring(0, 8)}...: ${error.error}`);
            }
          } catch (error) {
            results.push(`❌ Error fetching ${conversionId.substring(0, 8)}...: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }

        // Helper function to extract conversion data for a specific conversion_id
        // The API returns conversion_path_1, conversion_path_2, etc. based on conversion_id_1, conversion_id_2
        const getConversionDataForId = (conversionId: string, index: number) => {
          const response = conversionDataMap[conversionId];
          if (!response || !response.success || !response.conversion) {
            return null;
          }
          
          const conversion = response.conversion;
          
          // Match conversion_id to conversion_id_1 or conversion_id_2
          const isConversion1 = conversion.conversion_id_1 === conversionId;
          const isConversion2 = conversion.conversion_id_2 === conversionId;
          
          // Extract the appropriate fields based on which conversion this is
          if (isConversion1) {
            return {
              conversion_path: conversion.conversion_path_1 as string | undefined,
              conversion_path_wav: conversion.conversion_path_wav_1 as string | undefined,
              conversion_duration: conversion.conversion_duration_1 as number | undefined,
              lyrics: conversion.lyrics_1 as string | undefined,
              lyrics_timestamped: conversion.lyrics_timestamped_1 as unknown,
              title: conversion.title_1 as string | undefined,
            };
          } else if (isConversion2) {
            return {
              conversion_path: conversion.conversion_path_2 as string | undefined,
              conversion_path_wav: conversion.conversion_path_wav_2 as string | undefined,
              conversion_duration: conversion.conversion_duration_2 as number | undefined,
              lyrics: conversion.lyrics_2 as string | undefined,
              lyrics_timestamped: conversion.lyrics_timestamped_2 as unknown,
              title: conversion.title_2 as string | undefined,
            };
          }
          
          // Fallback: try to use index-based fields
          return {
            conversion_path: (conversion[`conversion_path_${index}`] || conversion.conversion_path) as string | undefined,
            conversion_path_wav: (conversion[`conversion_path_wav_${index}`] || conversion.conversion_path_wav) as string | undefined,
            conversion_duration: (conversion[`conversion_duration_${index}`] || conversion.conversion_duration) as number | undefined,
            lyrics: (conversion[`lyrics_${index}`] || conversion.lyrics) as string | undefined,
            lyrics_timestamped: (conversion[`lyrics_timestamped_${index}`] || conversion.lyrics_timestamped) as unknown,
            title: (conversion[`title_${index}`] || conversion.title) as string | undefined,
          };
        };

        // Build webhook payloads using fetched conversion details
        // This matches what MusicGPT's webhook sends (see MusicGPTWebhookPayload interface)
        const webhooks = [];

        // Conversion 1
        if (conversion1Id) {
          const conv1Data = getConversionDataForId(conversion1Id, 1);
          if (!conv1Data || !conv1Data.conversion_path) {
            results.push(`⚠️ Conversion ${conversion1Id}: No conversion_path found. Skipping.`);
            continue;
          }
          
          webhooks.push({
            success: true,
            conversion_type: 'Music AI',
            task_id: generation.providerTaskId,
            conversion_id: conversion1Id,
            conversion_path: conv1Data.conversion_path,
            conversion_path_wav: conv1Data.conversion_path_wav,
            conversion_duration: conv1Data.conversion_duration,
            is_flagged: false,
            lyrics: conv1Data.lyrics,
            lyrics_timestamped: conv1Data.lyrics_timestamped,
            title: conv1Data.title || 'Generated Song (Variation 1)',
          });
        }

        // Conversion 2
        if (conversion2Id) {
          const conv2Data = getConversionDataForId(conversion2Id, 2);
          if (!conv2Data || !conv2Data.conversion_path) {
            results.push(`⚠️ Conversion ${conversion2Id}: No conversion_path found. Skipping.`);
            continue;
          }
          
          webhooks.push({
            success: true,
            conversion_type: 'Music AI',
            task_id: generation.providerTaskId,
            conversion_id: conversion2Id,
            conversion_path: conv2Data.conversion_path,
            conversion_path_wav: conv2Data.conversion_path_wav,
            conversion_duration: conv2Data.conversion_duration,
            is_flagged: false,
            lyrics: conv2Data.lyrics,
            lyrics_timestamped: conv2Data.lyrics_timestamped,
            title: conv2Data.title || 'Generated Song (Variation 2)',
          });
        }

        // Send webhooks
        for (const webhook of webhooks) {
          try {
            const response = await fetch('/api/webhooks/musicgpt', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(webhook),
            });

            const result = await response.text();
            if (response.ok) {
              results.push(`✅ Conversion ${webhook.conversion_id}: Webhook processed`);
            } else {
              results.push(`❌ Conversion ${webhook.conversion_id}: ${result}`);
            }
          } catch (error) {
            results.push(`❌ Conversion ${webhook.conversion_id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
      }

      setSimulationResults(results);
    } catch (error) {
      results.push(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setSimulationResults(results);
    } finally {
      setSimulating(false);
    }
  };

  // Only show in localhost
  if (!isLocalhost || musicGPTGenerations.length === 0) {
    return null;
  }

  return (
    <section className="border-t border-gray-200 dark:border-gray-800 pt-8 mt-8">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-4 text-left hover:bg-yellow-100 dark:hover:bg-yellow-900/30 transition-colors"
      >
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold text-yellow-800 dark:text-yellow-200">
              🔧 Developer Tools (Localhost Only)
            </h2>
            <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
              {isOpen ? 'Click to collapse' : 'Click to expand'} • {musicGPTGenerations.length} MusicGPT generation(s)
            </p>
          </div>
          <span className="text-2xl text-yellow-800 dark:text-yellow-200">
            {isOpen ? '▼' : '▶'}
          </span>
        </div>
      </button>

      {isOpen && (
        <div>
          {musicGPTGenerations.map((generation) => (
            <div key={generation.id} className="mb-6 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <h3 className="font-semibold mb-3">Generation: {generation.id}</h3>
              <div className="space-y-2 text-sm font-mono">
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Status:</span>{' '}
                  <span className={`font-semibold ${
                    generation.status === 'completed' ? 'text-green-600' :
                    generation.status === 'failed' ? 'text-red-600' :
                    'text-yellow-600'
                  }`}>
                    {generation.status}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Provider:</span>{' '}
                  <code className="bg-gray-200 dark:bg-gray-800 px-2 py-1 rounded">
                    {generation.provider}
                  </code>
                </div>
                {generation.providerTaskId && (
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Task ID:</span>{' '}
                    <code className="bg-gray-200 dark:bg-gray-800 px-2 py-1 rounded text-xs break-all">
                      {generation.providerTaskId}
                    </code>
                  </div>
                )}
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Conversion IDs:</span>{' '}
                  {generation.providerConversionIds && generation.providerConversionIds.length > 0 ? (
                    <ul className="ml-4 mt-1 space-y-1">
                      {generation.providerConversionIds.map((id, idx) => (
                        <li key={id || idx}>
                          <code className="bg-gray-200 dark:bg-gray-800 px-2 py-1 rounded text-xs break-all">
                            {idx + 1}: {id || 'N/A'}
                            {generation.providerProcessedConversions?.includes(id) && (
                              <span className="ml-2 text-green-600">✓ Processed</span>
                            )}
                          </code>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-yellow-600">Not set (check metadata below)</span>
                  )}
                </div>
                {/* Debug: Show raw providerConversionIds value */}
                <div className="text-xs text-gray-500 mt-1">
                  <span>Raw value: </span>
                  <code>{JSON.stringify(generation.providerConversionIds)}</code>
                </div>
                {generation.providerProcessedConversions && generation.providerProcessedConversions.length > 0 && (
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Processed:</span>{' '}
                    <span className="text-green-600">
                      {generation.providerProcessedConversions.length} / {generation.providerConversionIds?.length || 0}
                    </span>
                  </div>
                )}
                {generation.error && (
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Error:</span>{' '}
                    <span className="text-red-600">{generation.error}</span>
                  </div>
                )}
            {generation.output.metadata && (
              <details className="mt-3">
                <summary className="cursor-pointer text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
                  View Metadata (click to expand) - Look for conversion_path URLs here
                </summary>
                <pre className="mt-2 p-2 bg-gray-200 dark:bg-gray-800 rounded text-xs overflow-auto max-h-64">
                  {JSON.stringify(generation.output.metadata, null, 2)}
                </pre>
                <p className="mt-2 text-xs text-yellow-600">
                  💡 Tip: If you have the actual conversion_path URLs from MusicGPT, you can manually update the song versions in Firestore, or wait for the real webhooks to arrive.
                </p>
              </details>
            )}
              </div>
            </div>
          ))}

          <div className="mt-4">
            <button
              onClick={handleSimulateWebhooks}
              disabled={simulating}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {simulating ? 'Simulating Webhooks...' : 'Simulate Webhook Events'}
            </button>

            {simulationResults.length > 0 && (
              <div className="mt-4 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <h4 className="font-semibold mb-2">Simulation Results:</h4>
                <ul className="space-y-1 text-sm">
                  {simulationResults.map((result, idx) => (
                    <li key={idx}>{result}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
