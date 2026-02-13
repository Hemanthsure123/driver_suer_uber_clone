import jwt from "jsonwebtoken";

export const signToken = (payload, expiresIn = "1d") =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });

export const signOnboardingToken = (userId) =>
  jwt.sign(
    { sub: userId, type: "ONBOARDING" },
    process.env.JWT_SECRET,
    { expiresIn: "15m" }
  );
