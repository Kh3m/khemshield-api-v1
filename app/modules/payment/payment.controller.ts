import { Request, Response } from "express";
import { Types } from "mongoose";
import { createManualPaymentAndEnroll } from "./payment.service";
import { CreatePaymentSchema } from "./payment.validation";
import { DeliveryMethod } from "../enrollment/enrollment.model";

export const recordManualPaymentController = async (
  req: Request,
  res: Response
) => {
  try {
    const parsed = CreatePaymentSchema.safeParse(req.body);

    if (!parsed.success)
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten(),
      });

    const {
      user,
      items,
      couponCode,
      amountPaid,
      deliveryMode = DeliveryMethod.InPerson,
      currency = "NGN",
    } = parsed.data;
    const adminUserId = req.user?._id;

    console.log("amountPaid: ", amountPaid);

    const result = await createManualPaymentAndEnroll({
      user: new Types.ObjectId(user),
      recordedBy: adminUserId as Types.ObjectId,
      items,
      currency,
      couponCode,
      deliveryMode,
      amountPaid,
    });

    res.status(201).json({
      success: true,
      message: "Manual payment recorded and enrollment completed",
      data: result,
    });
  } catch (error) {
    console.error("Error recordManualPaymentController:", error);
    res
      .status(500)
      .json({ message: (error as Error).message || "Failed to enroll" });
  }
};
