/**
 * Draws a fictional paper field note on a canvas, so the photo path can be tried without a camera.
 * The person and phone number are invented; 555 numbers are reserved for fiction.
 */
const LINES = [
  "24/11  Riverside, near the fish market",
  "Visited Halima Wekesa, 6 yrs girl",
  "watery diarrhoea x7 since last night,",
  "vomiting, sunken eyes, drinks poorly.",
  "Brother also sick. Mum 0555 019 274",
  "Gave ORS, referred to dispensary.",
];

export function drawSamplePaperNote(): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = 640;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Canvas is not available."));

  // Lined notebook page.
  ctx.fillStyle = "#fbf8ef";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#b9cfe4";
  ctx.lineWidth = 2;
  for (let y = 110; y < canvas.height; y += 80) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "#e3a4a4";
  ctx.beginPath();
  ctx.moveTo(90, 0);
  ctx.lineTo(90, canvas.height);
  ctx.stroke();

  // Handwriting-like text with a slight slant and jitter.
  ctx.fillStyle = "#1f2a5a";
  ctx.font = "40px 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive";
  ctx.save();
  ctx.rotate(-0.012);
  LINES.forEach((line, i) => {
    ctx.fillText(line, 110 + (i % 2) * 6, 98 + i * 80);
  });
  ctx.restore();

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not draw the sample."))), "image/jpeg", 0.9);
  });
}
