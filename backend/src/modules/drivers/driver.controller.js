import Driver from "./driver.model.js";
import User from "../users/user.model.js";
import Otp from "../auth/otp.model.js";
import { generateOtp, hashOtp } from "../../utils/otp.util.js";
import { sendEmail } from "../../utils/email.util.js";

export const uploadSelfie = async (req, res) => {
  const { selfieUrl } = req.body;

  if (!selfieUrl) {
    return res.status(400).json({ error: "Selfie URL required" });
  }

  const driver = await Driver.findOne({ userId: req.user.sub });
  if (!driver) {
    return res.status(404).json({ error: "Driver not found" });
  }

  driver.selfieUrl = selfieUrl;
  await driver.save();

  // Send OTP only AFTER selfie upload
  const otp = generateOtp();

  await Otp.deleteMany({ userId: req.user.sub });

  await Otp.create({
    userId: req.user.sub,
    otpHash: hashOtp(otp),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    attempts: 0
  });

  const user = await User.findById(req.user.sub);
  await sendEmail(user.email, otp);

  return res.json({
    message: "Selfie uploaded. OTP sent to email."
  });
};
