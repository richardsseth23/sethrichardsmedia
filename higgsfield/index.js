#!/usr/bin/env node
/**
 * Seth Richards Media — Higgsfield AI Tool
 *
 * Usage:
 *   node index.js img2vid <image-url> "<prompt>" [model]
 *   node index.js txt2vid "<prompt>"
 *   node index.js txt2img "<prompt>" [aspect_ratio]
 *
 * Set credentials via env vars:
 *   export HF_KEY_ID=your_key_id
 *   export HF_KEY_SECRET=your_key_secret
 *
 * Models for img2vid: dop (default), dop-turbo
 * Aspect ratios for txt2img: 9:16 (default), 16:9, 1:1, 4:5
 *
 * Examples:
 *   node index.js img2vid "https://sethrichardsmedia.com/photos/seth.jpg" "cinematic slow zoom, golden hour"
 *   node index.js txt2vid "timelapse of a kitchen renovation, before and after reveal"
 *   node index.js txt2img "modern bathroom renovation, clean white tiles, natural light" 9:16
 */

import { higgsfield, config } from '@higgsfield/client/v2';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { resolve, basename, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, 'output');

// ── Auth ──────────────────────────────────────────────────────────────────────
const keyId     = process.env.HF_KEY_ID;
const keySecret = process.env.HF_KEY_SECRET;

if (!keyId || !keySecret) {
  console.error('\nMissing credentials. Set these env vars first:\n');
  console.error('  export HF_KEY_ID=your_key_id');
  console.error('  export HF_KEY_SECRET=your_key_secret\n');
  console.error('Get your keys at: https://cloud.higgsfield.ai/\n');
  process.exit(1);
}

config({ credentials: `${keyId}:${keySecret}` });

// ── Helpers ───────────────────────────────────────────────────────────────────
async function downloadFile(url, filename) {
  const dest = join(OUTPUT_DIR, filename);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  await pipeline(res.body, createWriteStream(dest));
  return dest;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function printResult(label, url, savedPath) {
  console.log(`\n✓ ${label} complete`);
  console.log(`  Remote : ${url}`);
  console.log(`  Saved  : ${savedPath}\n`);
}

// ── Commands ──────────────────────────────────────────────────────────────────
async function imgToVideo(imageUrl, prompt, model = 'dop') {
  console.log(`\nGenerating video from image...`);
  console.log(`  Image  : ${imageUrl}`);
  console.log(`  Prompt : ${prompt}`);
  console.log(`  Model  : ${model}`);
  console.log(`  (this takes ~60-90s)\n`);

  const jobSet = await higgsfield.subscribe('/v1/image2video/dop', {
    input: {
      model,
      prompt,
      input_images: [{ type: 'image_url', image_url: imageUrl }]
    },
    withPolling: true
  });

  if (!jobSet.isCompleted) {
    throw new Error(`Job did not complete. Status: ${jobSet.status}`);
  }

  const videoUrl = jobSet.jobs[0]?.results?.raw?.url;
  if (!videoUrl) throw new Error('No video URL in response');

  const filename = `img2vid_${timestamp()}.mp4`;
  const savedPath = await downloadFile(videoUrl, filename);
  printResult('Image-to-video', videoUrl, savedPath);
}

async function textToVideo(prompt) {
  console.log(`\nGenerating video from text...`);
  console.log(`  Prompt : ${prompt}`);
  console.log(`  (this takes ~60-120s)\n`);

  const jobSet = await higgsfield.subscribe('/v1/text2video', {
    input: { prompt },
    withPolling: true
  });

  if (!jobSet.isCompleted) {
    throw new Error(`Job did not complete. Status: ${jobSet.status}`);
  }

  const videoUrl = jobSet.jobs[0]?.results?.raw?.url;
  if (!videoUrl) throw new Error('No video URL in response');

  const filename = `txt2vid_${timestamp()}.mp4`;
  const savedPath = await downloadFile(videoUrl, filename);
  printResult('Text-to-video', videoUrl, savedPath);
}

async function textToImage(prompt, aspectRatio = '9:16') {
  console.log(`\nGenerating image from text...`);
  console.log(`  Prompt       : ${prompt}`);
  console.log(`  Aspect ratio : ${aspectRatio}`);
  console.log(`  (this takes ~15-30s)\n`);

  const jobSet = await higgsfield.subscribe('flux-pro/kontext/max/text-to-image', {
    input: {
      prompt,
      aspect_ratio: aspectRatio,
      safety_tolerance: 2
    },
    withPolling: true
  });

  if (!jobSet.isCompleted) {
    throw new Error(`Job did not complete. Status: ${jobSet.status}`);
  }

  const imageUrl = jobSet.jobs[0]?.results?.raw?.url;
  if (!imageUrl) throw new Error('No image URL in response');

  const filename = `txt2img_${timestamp()}.jpg`;
  const savedPath = await downloadFile(imageUrl, filename);
  printResult('Text-to-image', imageUrl, savedPath);
}

// ── CLI ───────────────────────────────────────────────────────────────────────
const [,, command, ...args] = process.argv;

const HELP = `
Seth Richards Media — Higgsfield AI Tool
─────────────────────────────────────────
Commands:

  img2vid <image-url> "<prompt>" [model]
    Turn a still photo into a 5-second animated video clip.
    Models: dop (default, higher quality), dop-turbo (faster)

  txt2vid "<prompt>"
    Generate a video clip from a text description.

  txt2img "<prompt>" [aspect-ratio]
    Generate an image from a text description.
    Ratios: 9:16 (default), 16:9, 1:1, 4:5

Examples:
  node index.js img2vid "https://sethrichardsmedia.com/photos/before.jpg" "cinematic slow zoom reveal"
  node index.js txt2vid "kitchen renovation reveal, before and after, warm lighting"
  node index.js txt2img "modern bathroom remodel, white marble, natural light" 9:16

Output is saved to: ./output/
`;

try {
  switch (command) {
    case 'img2vid': {
      const [imageUrl, prompt, model] = args;
      if (!imageUrl || !prompt) { console.error('Usage: node index.js img2vid <image-url> "<prompt>" [model]'); process.exit(1); }
      await imgToVideo(imageUrl, prompt, model);
      break;
    }
    case 'txt2vid': {
      const [prompt] = args;
      if (!prompt) { console.error('Usage: node index.js txt2vid "<prompt>"'); process.exit(1); }
      await textToVideo(prompt);
      break;
    }
    case 'txt2img': {
      const [prompt, aspectRatio] = args;
      if (!prompt) { console.error('Usage: node index.js txt2img "<prompt>" [aspect-ratio]'); process.exit(1); }
      await textToImage(prompt, aspectRatio);
      break;
    }
    default:
      console.log(HELP);
  }
} catch (err) {
  console.error('\nError:', err.message);
  if (err.message?.includes('401') || err.message?.includes('auth')) {
    console.error('Check your HF_KEY_ID and HF_KEY_SECRET env vars.\n');
  }
  process.exit(1);
}
