'use client';

import { AVATAR_MAX_BYTES, AVATAR_SIZE, base64Bytes } from '@/lib/avatar';

/** Larger originals are refused before decoding (a phone photo is a few MB). */
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

export type ResizeResult = { ok: true; dataUrl: string; bytes: number; mime: string } | { ok: false; error: string };

function decode(file: File): Promise<CanvasImageSource & { width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file).catch(() => decodeWithImg(file));
  }
  return decodeWithImg(file);
}

function decodeWithImg(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode'));
    };
    img.src = url;
  });
}

const bytesOf = (dataUrl: string) => base64Bytes(dataUrl.slice(dataUrl.indexOf(',') + 1));

/**
 * Turn a chosen file into a small square profile photo: centre-cropped ("cover") to 256 x 256,
 * WebP (JPEG where the browser can't make WebP) at quality ~0.82, stepping the quality down if
 * needed to stay under 200 KB. Only image files are accepted; nothing large ever leaves the browser.
 */
export async function resizeAvatar(file: File): Promise<ResizeResult> {
  if (!file.type.startsWith('image/')) return { ok: false, error: 'Choose an image file (JPG, PNG or WebP).' };
  if (file.size > MAX_SOURCE_BYTES) return { ok: false, error: 'That image is too large. Choose one under 25 MB.' };
  let img: CanvasImageSource & { width: number; height: number };
  try {
    img = await decode(file);
  } catch {
    return { ok: false, error: 'Couldn’t read that image. Try a JPG, PNG or WebP.' };
  }
  const w = img.width;
  const h = img.height;
  if (!w || !h) return { ok: false, error: 'Couldn’t read that image. Try a JPG, PNG or WebP.' };

  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { ok: false, error: 'Your browser can’t resize photos. Try another browser.' };
  const side = Math.min(w, h);
  const draw = (background?: string) => {
    ctx.clearRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  };

  draw();
  let mime = 'image/webp';
  let dataUrl = canvas.toDataURL(mime, 0.82);
  if (!dataUrl.startsWith('data:image/webp')) {
    // No WebP encoder: JPEG has no transparency, so put the photo on white.
    mime = 'image/jpeg';
    draw('#ffffff');
    dataUrl = canvas.toDataURL(mime, 0.82);
  }
  for (const q of [0.7, 0.55, 0.4]) {
    if (bytesOf(dataUrl) <= AVATAR_MAX_BYTES) break;
    dataUrl = canvas.toDataURL(mime, q);
  }
  if ('close' in img && typeof img.close === 'function') img.close();
  const bytes = bytesOf(dataUrl);
  if (bytes > AVATAR_MAX_BYTES) return { ok: false, error: 'That photo is still over 200 KB after resizing. Try a simpler image.' };
  return { ok: true, dataUrl, bytes, mime };
}
