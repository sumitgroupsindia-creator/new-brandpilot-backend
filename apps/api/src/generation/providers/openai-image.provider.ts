import { Injectable } from '@nestjs/common';

export interface ImageGenerationInput {
  assetId: string;
  prompt: string;
  negativePrompt?: string | null;
  model?: string | null;
}

export interface ProviderOutput {
  provider: string;
  model: string;
  outputUrl: string;
  thumbnailUrl: string;
  providerJobId?: string;
}

@Injectable()
export class OpenAiImageProvider {
  async generate(input: ImageGenerationInput): Promise<ProviderOutput> {
    const apiKey = process.env.OPENAI_API_KEY;
    const model = input.model || process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';

    if (!apiKey) {
      return {
        provider: 'openai',
        model,
        outputUrl: `https://cdn.brandpilot.local/generated/${input.assetId}.png`,
        thumbnailUrl: `https://cdn.brandpilot.local/generated/${input.assetId}.thumb.png`,
      };
    }

    const prompt = input.negativePrompt
      ? `${input.prompt}\n\nAvoid: ${input.negativePrompt}`
      : input.prompt;

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt,
        size: '1024x1024',
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI image generation failed: ${response.status} ${body}`);
    }

    const json = (await response.json()) as {
      data?: Array<{ url?: string; b64_json?: string }>;
    };

    const generatedUrl = json.data?.[0]?.url;
    if (!generatedUrl) {
      const b64 = json.data?.[0]?.b64_json;
      if (!b64) {
        throw new Error('OpenAI image generation returned no output');
      }
      return {
        provider: 'openai',
        model,
        outputUrl: `data:image/png;base64,${b64}`,
        thumbnailUrl: `data:image/png;base64,${b64}`,
      };
    }

    return {
      provider: 'openai',
      model,
      outputUrl: generatedUrl,
      thumbnailUrl: generatedUrl,
    };
  }
}
