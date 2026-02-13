export const uploadToCloudinary = async (file) => {
  const data = new FormData();
  data.append("file", file);
  data.append(
    "upload_preset",
    import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET
  );

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME}/image/upload`,
    {
      method: "POST",
      body: data
    }
  );

  return res.json();
};
