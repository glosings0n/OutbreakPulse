/**
 * Prepares a photo for the on-device model: decoded, downscaled and re-encoded as JPEG in memory.
 * Nothing is written to disk, storage or the network, and re-encoding drops EXIF metadata such as GPS.
 */
export async function photoToJpegBase64(file: Blob, maxSide = 1280): Promise<{ mimeType: "image/jpeg"; base64: string }> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available.");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    return { mimeType: "image/jpeg", base64: dataUrl.slice(dataUrl.indexOf(",") + 1) };
  } finally {
    bitmap.close();
  }
}
