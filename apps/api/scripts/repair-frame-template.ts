import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '../src/generated/prisma/client';
import { createPrismaAdapter } from '../src/prisma/prisma-pool';

function usageAndExit() {
  console.error('Usage: ts-node scripts/repair-frame-template.ts <jsonPath> [frameTitle] [tenantSlug]');
  process.exit(1);
}

function normalizePath(input: string) {
  return input.replace(/\\/g, '/');
}

function toDataUrl(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.jpg' || ext === '.jpeg'
    ? 'image/jpeg'
    : ext === '.webp'
      ? 'image/webp'
      : 'image/png';
  const base64 = fs.readFileSync(filePath).toString('base64');
  return `data:${mime};base64,${base64}`;
}

function resolveAssetPath(src: string, jsonDir: string) {
  const raw = normalizePath(src).trim();
  const direct = path.resolve(jsonDir, raw);
  if (fs.existsSync(direct)) {
    return direct;
  }

  const byBasename = path.resolve(jsonDir, '../skins', path.basename(raw));
  if (fs.existsSync(byBasename)) {
    return byBasename;
  }

  const skinsRoot = path.resolve(jsonDir, '../skins');
  if (fs.existsSync(skinsRoot)) {
    const stack = [skinsRoot];
    const targetName = path.basename(raw).toLowerCase();
    while (stack.length) {
      const current = stack.pop() as string;
      const entries = fs.readdirSync(current, { withFileTypes: true });
      for (const entry of entries) {
        const next = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(next);
        } else if (entry.isFile() && entry.name.toLowerCase() === targetName) {
          return next;
        }
      }
    }
  }

  return null;
}

function buildDynamicFields(layers: Array<Record<string, unknown>>) {
  const usedKeys = new Set<string>();
  const fields: Array<Record<string, unknown>> = [];

  for (const layer of layers) {
    const type = typeof layer.type === 'string' ? layer.type : '';
    const rawName = typeof layer.name === 'string' ? layer.name : '';
    const baseKey = rawName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || `field_${fields.length + 1}`;
    const key = usedKeys.has(baseKey) ? `${baseKey}_${fields.length + 1}` : baseKey;
    usedKeys.add(key);

    const label = rawName
      .trim()
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\b\w/g, ch => ch.toUpperCase()) || 'Field';

    if (type === 'text' && typeof layer.text === 'string') {
      let fieldType: 'text' | 'email' | 'url' | 'tel' = 'text';
      if (/email|mail/.test(baseKey)) fieldType = 'email';
      else if (/phone|mobile|contact|tel/.test(baseKey)) fieldType = 'tel';
      else if (/web|site|url|link/.test(baseKey)) fieldType = 'url';

      fields.push({
        key,
        label,
        type: fieldType,
        defaultValue: layer.text,
        x: typeof layer.x === 'number' ? layer.x : undefined,
        y: typeof layer.y === 'number' ? layer.y : undefined,
        width: typeof layer.width === 'number' ? layer.width : undefined,
        height: typeof layer.height === 'number' ? layer.height : undefined,
        font: typeof layer.font === 'string' ? layer.font : undefined,
        fontSize: typeof layer.size === 'number' ? layer.size : undefined,
        color: typeof layer.color === 'string' ? layer.color : undefined,
        lineHeight: typeof layer.lineHeight === 'number' ? layer.lineHeight : undefined,
        justification: typeof layer.justification === 'string' ? layer.justification : undefined,
      });
      continue;
    }

    if (type === 'image' && /logo|photo|image|product|avatar|profile|pic|brand/.test(baseKey) && typeof layer.src === 'string') {
      fields.push({
        key,
        label,
        type: 'image',
        defaultValue: layer.src,
        supportsBackgroundRemoval: true,
        x: typeof layer.x === 'number' ? layer.x : undefined,
        y: typeof layer.y === 'number' ? layer.y : undefined,
        width: typeof layer.width === 'number' ? layer.width : undefined,
        height: typeof layer.height === 'number' ? layer.height : undefined,
      });
    }
  }

  return fields;
}

async function main() {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
  dotenv.config({ path: path.resolve(process.cwd(), '../../.env'), override: false });

  const [jsonPathArg, frameTitleArg, tenantSlugArg] = process.argv.slice(2);
  if (!jsonPathArg) {
    usageAndExit();
  }

  const frameTitle = frameTitleArg?.trim() || 'Fream1';
  const tenantSlug = tenantSlugArg?.trim() || 'default';
  const jsonPath = path.resolve(jsonPathArg);
  const jsonDir = path.dirname(jsonPath);

  if (!fs.existsSync(jsonPath)) {
    throw new Error(`JSON not found: ${jsonPath}`);
  }

  const raw = fs.readFileSync(jsonPath, 'utf-8');
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const originalLayers = Array.isArray(parsed.layers) ? parsed.layers : [];
  const layers = originalLayers
    .filter(layer => layer && typeof layer === 'object' && !Array.isArray(layer))
    .map(layer => ({ ...(layer as Record<string, unknown>) }));

  let inlinedAssets = 0;
  for (const layer of layers) {
    if (typeof layer.src !== 'string') continue;
    const src = layer.src;
    if (/^data:/i.test(src) || /^https?:\/\//i.test(src)) continue;

    const resolved = resolveAssetPath(src, jsonDir);
    if (!resolved) continue;

    layer.src = toDataUrl(resolved);
    inlinedAssets += 1;
  }

  let width = typeof parsed.width === 'number' ? parsed.width : 0;
  let height = typeof parsed.height === 'number' ? parsed.height : 0;
  if (!width || !height) {
    for (const layer of layers) {
      const x = typeof layer.x === 'number' ? layer.x : 0;
      const y = typeof layer.y === 'number' ? layer.y : 0;
      const w = typeof layer.width === 'number' ? layer.width : 0;
      const h = typeof layer.height === 'number' ? layer.height : 0;
      width = Math.max(width, Math.ceil(x + w));
      height = Math.max(height, Math.ceil(y + h));
    }
  }

  const dynamicFields = buildDynamicFields(layers);

  let thumbnailUrl: string | undefined;
  const thumbCandidate = path.resolve(jsonDir, '../skins/BP_P_6/thumb.png');
  if (fs.existsSync(thumbCandidate)) {
    thumbnailUrl = toDataUrl(thumbCandidate);
  }

  const nextTemplate: Record<string, unknown> = {
    ...parsed,
    width: width || 1280,
    height: height || 720,
    layers,
    dynamicFields,
    uploadMeta: {
      source: 'repair-frame-template-script',
      sourceJsonPath: jsonPath,
      repairedAt: new Date().toISOString(),
      inlinedAssets,
    },
  };

  if (thumbnailUrl) {
    nextTemplate.thumbnailUrl = thumbnailUrl;
  }

  const prisma = new PrismaClient({ adapter: createPrismaAdapter() });
  try {
    const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } });
    if (!tenant) {
      throw new Error(`Tenant not found for slug: ${tenantSlug}`);
    }

    const frame = await prisma.frame.findFirst({
      where: {
        tenantId: tenant.id,
        title: frameTitle,
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true },
    });

    if (!frame) {
      throw new Error(`Frame not found for title: ${frameTitle}`);
    }

    await prisma.frame.update({
      where: { id: frame.id },
      data: {
        template: nextTemplate as any,
        version: { increment: 1 },
        updatedAt: new Date(),
      },
    });

    const verified = await prisma.frame.findUnique({
      where: { id: frame.id },
      select: { id: true, title: true, template: true, updatedAt: true },
    });

    const stored = (verified?.template ?? {}) as Record<string, unknown>;
    const storedLayers = Array.isArray(stored.layers) ? stored.layers : [];
    const dataUrlLayers = storedLayers.filter(layer => {
      if (!layer || typeof layer !== 'object' || Array.isArray(layer)) return false;
      const src = (layer as Record<string, unknown>).src;
      return typeof src === 'string' && src.startsWith('data:image/');
    }).length;

    console.log(JSON.stringify({
      ok: true,
      tenantSlug,
      frameId: frame.id,
      frameTitle: frame.title,
      inlinedAssets,
      layerCount: storedLayers.length,
      dataUrlLayerCount: dataUrlLayers,
      updatedAt: verified?.updatedAt,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
