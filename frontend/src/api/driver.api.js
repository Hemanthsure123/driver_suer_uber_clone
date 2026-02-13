import API from "./auth.api";

export const uploadSelfie = (token, selfieUrl) =>
  API.post(
    "/driver/upload-selfie",
    { selfieUrl },
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );
