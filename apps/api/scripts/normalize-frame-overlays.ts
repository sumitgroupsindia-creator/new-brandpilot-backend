import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PNG } from 'pngjs';

type Layer = {
  type?: string;
  name?: string;
  src?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  [key: string]: unknown;
};

function parseArgs() {
  const args = process.argv.slice(2);
  const options: { tenantSlug: string; frameTitle?: string } = {
    tenantSlug: 'default',
  };

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === '--tenant' && args[i + 1]) {
      options.tenantSlug = args[i + 1] as string;
      i += 1;
      continue;
    }
    if (token === '--frame' && args[i + 1]) {
      options.frameTitle = args[i + 1] as string;
      i += 1;
    }
  }

  return options;
}

function dataUrlToPng(src: string) {
  const match = src.match(/^data:image\/png;base64,(.+)$/i);
  if (!match) {
    return null;
  }

  const base64 = match[1] ?? '';
  const buffer = Buffer.from(base64, 'base64');
  return PNG.sync.read(buffer);
}

function pngToDataUrl(png: PNG) {
  const output = PNG.sync.write(png);
  return `data:image/png;base64,${output.toString('base64')}`;
}

function isFullCanvasLayer(layer: Layer, width: number, height: number) {
  const lw = typeof layer.width === 'number' ? layer.width : 0;
  const lh = typeof layer.height === 'number' ? layer.height : 0;
  const lx = Math.abs(typeof layer.x === 'number' ? layer.x : 0);
  const ly = Math.abs(typeof layer.y === 'number' ? layer.y : 0);

  return (
    lw >= width * 0.88
    && lh >= height * 0.88
    && lx <= width * 0.12
    && ly <= height * 0.12
  );
}

function isBackgroundLayer(layer: Layer, width: number, height: number) {
  const name = (layer.name ?? '').toLowerCase();
  const src = (layer.src ?? '').toLowerCase();
  const bgToken = /(^|[_\-\s])(bg|background)([_\-\s]|$)/.test(name) || /\bbg\b|background/.test(src);
  return bgToken && isFullCanvasLayer(layer, width, height);
}

function isOverlayFrameLayer(layer: Layer, width: number, height: number) {
  const name = (layer.name ?? '').toLowerCase();
  const src = (layer.src ?? '').toLowerCase();
  const token = /frame|overlay|layer/.test(name) || /frame|overlay|layer/.test(src);
  return token && isFullCanvasLayer(layer, width, height);
}

function normalizeOverlayByDiff(overlay: PNG, background: PNG) {
  if (overlay.width !== background.width || overlay.height !== background.height) {
    return { changed: false, changedPixels: 0 };
  }

  const data = overlay.data;
  const bg = background.data;
  const width = overlay.width;
  const height = overlay.height;
  const lowerBandStart = Math.floor(height * 0.82);

  let changedPixels = 0;

  for (let i = 0; i < data.length; i += 4) {
    const index = i / 4;
    const y = Math.floor(index / width);

    if (y >= lowerBandStart) {
      continue;
    }

    const oa = data[i + 3] ?? 255;
    if (oa === 0) {
      continue;
    }

    const or = data[i] ?? 0;
    const og = data[i + 1] ?? 0;
    const ob = data[i + 2] ?? 0;

    const br = bg[i] ?? 0;
    const bgc = bg[i + 1] ?? 0;
    const bb = bg[i + 2] ?? 0;
    const ba = bg[i + 3] ?? 255;

    const dr = or - br;
    const dg = og - bgc;
    const db = ob - bb;
    const colorDistance = Math.sqrt(dr * dr + dg * dg + db * db);
    const alphaDiff = Math.abs(oa - ba);
    const max = Math.max(or, og, ob);
    const min = Math.min(or, og, ob);
    const chroma = max - min;
    const luma = 0.2126 * or + 0.7152 * og + 0.0722 * ob;
    const isNeutralMatte = chroma < 24 && luma >= 145 && luma <= 245;

    if ((colorDistance <= 52 && alphaDiff <= 120) || isNeutralMatte) {
      data[i + 3] = 0;
      changedPixels += 1;
    }
  }

  return { changed: changedPixels > 0, changedPixels };
}

async function main() {
  const cwd = process.cwd();
  dotenv.config({ path: path.resolve(cwd, '.env') });
  dotenv.config({ path: path.resolve(cwd, '../../.env'), override: false });

  const { tenantSlug, frameTitle } = parseArgs();
  const prisma = new PrismaClient();

  try {
    const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } });
    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantSlug}`);
    }

    const frames = await prisma.frame.findMany({
      where: {
        tenantId: tenant.id,
        ...(frameTitle ? { title: frameTitle } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        template: true,
      },
    });

    let scanned = 0;
    let fixed = 0;
    const details: Array<Record<string, unknown>> = [];

    for (const frame of frames) {
      scanned += 1;
      const template = frame.template as Record<string, unknown> | null;
      if (!template || typeof template !== 'object' || Array.isArray(template)) {
        continue;
      }

      const layersRaw = Array.isArray(template.layers) ? template.layers : [];
      const layers = layersRaw
        .filter(item => item && typeof item === 'object' && !Array.isArray(item))
        .map(item => ({ ...(item as Layer) }));

      if (!layers.length) {
        continue;
      }

      const canvasWidth = Number(template.width) || Math.max(...layers.map(l => Number(l.x || 0) + Number(l.width || 0)), 0);
      const canvasHeight = Number(template.height) || Math.max(...layers.map(l => Number(l.y || 0) + Number(l.height || 0)), 0);
      const width = Math.max(1, Math.floor(canvasWidth || 0));
      const height = Math.max(1, Math.floor(canvasHeight || 0));

      const bgLayerIndex = layers.findIndex(layer => layer.type === 'image' && typeof layer.src === 'string' && isBackgroundLayer(layer, width, height));
      const overlayLayerIndex = layers.findIndex(layer => layer.type === 'image' && typeof layer.src === 'string' && isOverlayFrameLayer(layer, width, height) && !isBackgroundLayer(layer, width, height));

      if (bgLayerIndex < 0 || overlayLayerIndex < 0) {
        continue;
      }

      const bgLayer = layers[bgLayerIndex] as Layer;
      const overlayLayer = layers[overlayLayerIndex] as Layer;
      if (typeof bgLayer.src !== 'string' || typeof overlayLayer.src !== 'string') {
        continue;
      }

      const bgPng = dataUrlToPng(bgLayer.src);
      const overlayPng = dataUrlToPng(overlayLayer.src);
      if (!bgPng || !overlayPng) {
        continue;
      }

      const result = normalizeOverlayByDiff(overlayPng, bgPng);
      if (!result.changed) {
        continue;
      }

      overlayLayer.src = pngToDataUrl(overlayPng);

      const nextTemplate: Record<string, unknown> = {
        ...template,
        width,
        height,
        layers,
        uploadMeta: {
          ...((template.uploadMeta && typeof template.uploadMeta === 'object' && !Array.isArray(template.uploadMeta))
            ? (template.uploadMeta as Record<string, unknown>)
            : {}),
          overlayNormalizedBy: 'normalize-frame-overlays',
          overlayNormalizedAt: new Date().toISOString(),
          overlayNormalizedPixels: result.changedPixels,
        },
      };

      await prisma.frame.update({
        where: { id: frame.id },
        data: {
          template: nextTemplate as any,
          version: { increment: 1 },
        },
      });

      fixed += 1;
      details.push({
        frameId: frame.id,
        frameTitle: frame.title,
        changedPixels: result.changedPixels,
      });
    }

    console.log(JSON.stringify({
      ok: true,
      tenantSlug,
      frameFilter: frameTitle ?? null,
      scanned,
      fixed,
      details,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
