import Driver from "../modules/drivers/driver.model.js";

export const driverVerifiedOnly = async (req, res, next) => {
  const driver = await Driver.findOne({ userId: req.user.sub });

  if (!driver || driver.status !== "VERIFIED") {
    return res.status(403).json({ error: "Driver not verified" });
  }

  next();
};
