import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CallStage, CoachingMethodology, ProviderCapabilities } from '../src/types/call';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

/** Version reported by `/api/health` and the Gemini User-Agent; read once at boot. */
export const APP_VERSION = (() => {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(moduleDir, '..', 'package.json'), 'utf-8')
    ) as {
      version?: string;
    };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

export function hasValidGeminiKey(): boolean {
  const key = process.env.GEMINI_API_KEY?.trim();
  return Boolean(key && key !== 'MY_GEMINI_API_KEY');
}

export function hasOpenAiCompatibleConfig(): boolean {
  const baseUrl = process.env.LLM_BASE_URL?.trim();
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  return Boolean(baseUrl || (apiKey && apiKey !== 'MY_OPENAI_API_KEY'));
}

export function hasAudioTranscriptionBackend(): boolean {
  if (hasValidGeminiKey()) return true;
  const whisperUrl = process.env.WHISPER_BASE_URL?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  return Boolean(whisperUrl || (openaiKey && openaiKey !== 'MY_OPENAI_API_KEY'));
}

export function getProviderCapabilities(): ProviderCapabilities {
  const forcedProvider = process.env.CADENCE_PROVIDER?.trim().toLowerCase();
  if (forcedProvider === 'local') {
    return {
      llmProvider: 'local',
      audioTranscription: false,
      providerLabel: 'Zero-Key Local Engine',
    };
  }
  if (
    (forcedProvider === 'auto' || !forcedProvider || forcedProvider === 'gemini') &&
    hasValidGeminiKey()
  ) {
    return {
      llmProvider: 'gemini',
      audioTranscription: true,
      providerLabel: 'Gemini API',
    };
  }
  if (hasOpenAiCompatibleConfig()) {
    const model = process.env.LLM_MODEL?.trim() || 'gpt-4o-mini';
    return {
      llmProvider: 'openai-compatible',
      audioTranscription: hasAudioTranscriptionBackend(),
      providerLabel: `OpenAI-compatible (${model})`,
    };
  }
  return {
    llmProvider: 'local',
    audioTranscription: false,
    providerLabel: 'Zero-Key Local Engine',
  };
}

export function resolveAudioMimeType(
  mimetype: string | undefined,
  filename: string | undefined
): string {
  if (mimetype && mimetype.startsWith('audio/')) {
    return mimetype;
  }
  if (mimetype === 'video/webm') {
    return 'audio/webm';
  }
  const ext = (filename || '').toLowerCase().split('.').pop();
  switch (ext) {
    case 'mp3':
      return 'audio/mp3';
    case 'wav':
      return 'audio/wav';
    case 'm4a':
      return 'audio/mp4';
    case 'ogg':
      return 'audio/ogg';
    case 'flac':
      return 'audio/flac';
    case 'aac':
      return 'audio/aac';
    case 'webm':
    default:
      return 'audio/webm';
  }
}

export function resolveMethodology(val: unknown): CoachingMethodology {
  if (val === 'MEDDPICC' || val === 'SPIN Selling' || val === 'Challenger') {
    return val;
  }
  return 'General B2B';
}

export function resolveCallStage(val: unknown): CallStage {
  if (
    val === 'Discovery' ||
    val === 'Product Demo' ||
    val === 'Renewal & Expansion' ||
    val === 'Security & Procurement'
  ) {
    return val;
  }
  return 'Discovery';
}
