import { Injectable } from '@nestjs/common';
import { AssetKind } from '../generated/prisma/client';
import { OpenAiImageProvider } from './providers/openai-image.provider';
import { RunwayVideoProvider } from './providers/runway-video.provider';
import { BackgroundRemovalService } from './background-removal.service';

@Injectable()
export class GenerationExecutionService {
  constructor(
    private readonly openAiImageProvider: OpenAiImageProvider,
    private readonly runwayVideoProvider: RunwayVideoProvider,
    private readonly backgroundRemovalService: BackgroundRemovalService,
  ) {}

  async execute(input: {
    assetId: string;
    kind: AssetKind;
    prompt?: string | null;
    negativePrompt?: string | null;
    model?: string | null;
    frameInputs?: {
      text?: Record<string, string>;
      images?: Record<string, { dataUrl: string; backgroundMode: 'with' | 'without' }>;
    };
  }) {
    if (input.prompt?.includes('[fail]')) {
      throw new Error('Provider rejected prompt');
    }

    const processedInputs = await this.processFrameInputs(input.frameInputs);
    const composedPrompt = this.composePrompt(input.prompt ?? '', processedInputs.text, processedInputs.images);

    if (input.kind === 'VIDEO') {
      return this.runwayVideoProvider.generate({
        assetId: input.assetId,
        prompt: composedPrompt,
        model: input.model,
      });
    }

    return this.openAiImageProvider.generate({
      assetId: input.assetId,
      prompt: composedPrompt,
      negativePrompt: input.negativePrompt,
      model: input.model,
    });
  }

  private async processFrameInputs(input?: {
    text?: Record<string, string>;
    images?: Record<string, { dataUrl: string; backgroundMode: 'with' | 'without' }>;
  }) {
    const text = input?.text ?? {};
    const images = input?.images ?? {};
    const normalizedImages: Record<string, { dataUrl: string; backgroundMode: 'with' | 'without' }> = {};

    for (const [key, value] of Object.entries(images)) {
      if (!value || typeof value.dataUrl !== 'string' || value.dataUrl.length === 0) {
        continue;
      }

      if (value.backgroundMode === 'without') {
        const removed = await this.backgroundRemovalService.removeBackground(value.dataUrl);
        normalizedImages[key] = {
          dataUrl: removed.dataUrl,
          backgroundMode: 'without',
        };
        continue;
      }

      normalizedImages[key] = {
        dataUrl: value.dataUrl,
        backgroundMode: 'with',
      };
    }

    return { text, images: normalizedImages };
  }

  private composePrompt(
    basePrompt: string,
    textInputs: Record<string, string>,
    imageInputs: Record<string, { dataUrl: string; backgroundMode: 'with' | 'without' }>,
  ) {
    const textLines = Object.entries(textInputs)
      .filter((entry) => entry[1]?.trim().length > 0)
      .map(([key, value]) => `- ${key}: ${value.trim()}`);

    const imageLines = Object.entries(imageInputs).map(([key, value]) =>
      `- ${key}: ${value.backgroundMode === 'without' ? 'background removed' : 'with background'}`,
    );

    const sections: string[] = [basePrompt.trim()];

    if (textLines.length > 0) {
      sections.push('Frame field values:\n' + textLines.join('\n'));
    }

    if (imageLines.length > 0) {
      sections.push('Image field modes:\n' + imageLines.join('\n'));
    }

    return sections.filter(Boolean).join('\n\n');
  }
}
