export const compressImage = (blob) =>
  new Promise(resolve => {
    const img = new Image();
    img.src = URL.createObjectURL(blob);

    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = 0.6;

      canvas.width = img.width * scale;
      canvas.height = img.height * scale;

      canvas.getContext("2d").drawImage(
        img,
        0,
        0,
        canvas.width,
        canvas.height
      );

      canvas.toBlob(
        b => resolve(b),
        "image/jpeg",
        0.7
      );
    };
  });
