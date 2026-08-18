import { Injectable } from '@nestjs/common';

@Injectable()
export class BackgroundRemovalService {
  async removeBackground(dataUrl: string): Promise<{ dataUrl: string; removed: boolean; provider: string }> {
    const apiKey = process.env.REMOVE_BG_API_KEY;
    if (!apiKey) {
      return {
        dataUrl,
        removed: false,
        provider: 'none',
      };
    }

    const base64 = this.extractBase64(dataUrl);
    if (!base64) {
      return {
        dataUrl,
        removed: false,
        provider: 'none',
      };
    }

    const form = new FormData();
    form.append('size', 'auto');
    form.append('format', 'png');
    form.append('image_file_b64', base64);

    const response = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
      },
      body: form,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Background removal failed: ${response.status} ${body}`);
    }

    const bytes = await response.arrayBuffer();
    const encoded = Buffer.from(bytes).toString('base64');

    return {
      dataUrl: `data:image/png;base64,${encoded}`,
      removed: true,
      provider: 'remove.bg',
    };
  }

  private extractBase64(dataUrl: string) {
    const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
    return match?.[1] ?? null;
  }
}
