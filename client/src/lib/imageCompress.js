// Compresses images in the browser before upload so payloads stay small and
// fit serverless limits. Returns a WebP/JPEG data URL (max 1280px).
export const compressImage = (file, maxDim = 1280, quality = 0.82) =>
  new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      return reject(new Error("Not an image file"));
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);

        // Safari falls back from webp to png silently; try webp first.
        let out = canvas.toDataURL("image/webp", quality);
        if (!out.startsWith("data:image/webp")) {
          out = canvas.toDataURL("image/jpeg", quality);
        }
        resolve(out);
      };
      img.onerror = () => reject(new Error("Could not read image"));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
