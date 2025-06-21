import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";

export const validatator =
  (schema: ZodSchema<any>) =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error: any) {
      return res.status(400).json({
        message: "Validation failed",
        errors: error.errors || error.message,
      });
    }
  };
