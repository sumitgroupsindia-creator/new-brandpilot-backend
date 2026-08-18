import { Injectable } from '@nestjs/common';
import { ProviderOutput } from './openai-image.provider';

export interface VideoGenerationInput {
  assetId: string;
  prompt: string;
  model?: string | null;
}

type RunwayTaskResponse = {
  id?: string;
  status?: string;
  output?: Array<{ url?: string }>;
  error?: string;
};

const RUNWAY_API_VERSION = '2024-11-06';
const RUNWAY_TEXT_TO_VIDEO_MODELS = new Set([
  'gen4.5',
  'kling2.5_turbo_pro',
  'kling3.0_pro',
  'kling3.0_4k',
  'kling3.0_standard',
  'klingO3_pro',
  'klingO3_standard',
  'klingO3_4k',
  'seedance2',
  'seedance2_fast',
  'seedance2_mini',
  'happyhorse_1_0',
  'veo3',
  'veo3.1',
  'veo3.1_fast',
  'gemini_omni_flash',
]);

const DEFAULT_POLL_TIMEOUT_MS = 8 * 60 * 1000;
const DEFAULT_POLL_INITIAL_INTERVAL_MS = 2000;
const DEFAULT_POLL_MAX_INTERVAL_MS = 15000;
const DEFAULT_POLL_BACKOFF_MULTIPLIER = 1.2;

@Injectable()
export class RunwayVideoProvider {
  async generate(input: VideoGenerationInput): Promise<ProviderOutput> {
    const apiKey = process.env.RUNWAY_API_KEY;
    const requestedModel = input.model || process.env.RUNWAY_MODEL || 'gen4.5';
    const model = RUNWAY_TEXT_TO_VIDEO_MODELS.has(requestedModel) ? requestedModel : 'gen4.5';

    if (!apiKey) {
      return {
        provider: 'runway',
        model,
        outputUrl: `https://cdn.brandpilot.local/generated/${input.assetId}.mp4`,
        thumbnailUrl: `https://cdn.brandpilot.local/generated/${input.assetId}.thumb.png`,
      };
    }

    const baseUrl = process.env.RUNWAY_API_BASE_URL || 'https://api.dev.runwayml.com/v1';
    const normalizedBaseUrl = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl.replace(/\/$/, '')}/v1`;
    const createResponse = await fetch(`${normalizedBaseUrl}/text_to_video`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Runway-Version': RUNWAY_API_VERSION,
      },
      body: JSON.stringify({
        model,
        promptText: input.prompt,
        ratio: '1280:720',
        duration: 5,
      }),
    });

    if (!createResponse.ok) {
      const body = await createResponse.text();
      throw new Error(`Runway task creation failed: ${createResponse.status} ${body}`);
    }

    const created = (await createResponse.json()) as RunwayTaskResponse;
    const taskId = created.id;
    if (!taskId) {
      throw new Error('Runway task id missing');
    }

    const completed = await this.pollUntilComplete(normalizedBaseUrl, apiKey, taskId);
    const url = completed.output?.[0]?.url;
    if (!url) {
      throw new Error('Runway completed without output URL');
    }

    return {
      provider: 'runway',
      model,
      outputUrl: url,
      thumbnailUrl: `https://cdn.brandpilot.local/generated/${input.assetId}.thumb.png`,
      providerJobId: taskId,
    };
  }

  private async pollUntilComplete(baseUrl: string, apiKey: string, taskId: string) {
    const timeoutMs = this.readNumberEnv('RUNWAY_POLL_TIMEOUT_MS', DEFAULT_POLL_TIMEOUT_MS, 30_000);
    const maxIntervalMs = this.readNumberEnv(
      'RUNWAY_POLL_MAX_INTERVAL_MS',
      DEFAULT_POLL_MAX_INTERVAL_MS,
      1_000,
    );
    let intervalMs = this.readNumberEnv(
      'RUNWAY_POLL_INITIAL_INTERVAL_MS',
      DEFAULT_POLL_INITIAL_INTERVAL_MS,
      500,
    );
    const backoffMultiplier = this.readNumberEnv(
      'RUNWAY_POLL_BACKOFF_MULTIPLIER',
      DEFAULT_POLL_BACKOFF_MULTIPLIER,
      1,
    );

    const startedAt = Date.now();
    const deadline = startedAt + timeoutMs;
    let polls = 0;

    while (Date.now() < deadline) {
      polls += 1;
      const res = await fetch(`${baseUrl}/tasks/${taskId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'X-Runway-Version': RUNWAY_API_VERSION,
        },
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Runway task poll failed: ${res.status} ${body}`);
      }

      const task = (await res.json()) as RunwayTaskResponse;
      const status = (task.status || '').toUpperCase();

      if (status === 'SUCCEEDED' || status === 'COMPLETED') {
        return task;
      }
      if (status === 'FAILED' || status === 'CANCELED' || status === 'TIMED_OUT') {
        throw new Error(task.error || `Runway task failed with status ${status}`);
      }

      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        break;
      }

      await new Promise(resolve => setTimeout(resolve, Math.min(intervalMs, remainingMs)));
      intervalMs = Math.min(maxIntervalMs, Math.round(intervalMs * backoffMultiplier));
    }

    const elapsedMs = Date.now() - startedAt;
    throw new Error(`Runway task timed out after ${elapsedMs}ms (${polls} polls)`);
  }

  private readNumberEnv(name: string, fallback: number, min: number): number {
    const raw = process.env[name];
    if (!raw) {
      return fallback;
    }

    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < min) {
      return fallback;
    }

    return parsed;
  }
}
