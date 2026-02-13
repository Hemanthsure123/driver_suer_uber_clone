import Driver from "../drivers/driver.model.js";

// GET ALL DRIVERS
export const getAllDrivers = async (req, res) => {
  try {
    const drivers = await Driver.find().populate("userId", "email profile");
    res.json(drivers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET PENDING DRIVERS
export const getPendingDrivers = async (req, res) => {
  try {
    const drivers = await Driver.find({ adminStatus: "PENDING" })
      .populate("userId", "email profile"); // Populating useful info
    res.json(drivers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// APPROVE DRIVER
export const approveDriver = async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id);
    if (!driver) return res.status(404).json({ error: "Driver not found" });

    driver.adminStatus = "APPROVED";
    await driver.save();

    res.json({ message: "Driver approved successfully", driver });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// REJECT DRIVER
export const rejectDriver = async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id);
    if (!driver) return res.status(404).json({ error: "Driver not found" });

    driver.adminStatus = "REJECTED";
    await driver.save();

    res.json({ message: "Driver rejected", driver });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
