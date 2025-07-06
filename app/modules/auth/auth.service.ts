import bcrypt from "bcrypt";
import { Types } from "mongoose";
import { API_VERSION, CLIENT_BASE_URL } from "../../config/contants";
import { generateResetHTMLTemp } from "../../utils/emailService/mail_templates/generateResetHTMLTemp";
import sendEmail from "../../utils/emailService/sendEmail";
import AdminProfile from "../user/adminProfile.model";
import InstructorProfile from "../user/instructorProfile.model";
import StudentProfile from "../user/studentProfile.model";
import User, { IAddress, IUser, UserRole } from "../user/user.model";
import { saveRefreshToken } from "./refresh.service";
import { PasswordResetToken } from "./reset-token.model";
import { generateAccessToken } from "./utils/generateAccessToken";
import { generateRefreshToken } from "./utils/generateRefreshToken";
import { generatePasswordResetToken } from "./utils/generateResetToken";
import { AppError } from "../../utils/errors";
import { generateProfileId } from "../user/utils/generateProfileId";

interface RegisterInput {
  firstName: string;
  lastName: string;
  email: string;
  roles?: UserRole[];
  phone?: string; // Required for studentProfile
  mustChangePassword?: boolean;
  address?: IAddress;
  createdBy?: Types.ObjectId;
}

interface RegisterResult {
  user: Omit<IUser, "password">;
  studentIdCardNo?: string;
}

export const registerUser = async (
  data: RegisterInput
): Promise<RegisterResult> => {
  const {
    email,
    firstName,
    lastName,
    phone,
    createdBy,
    address,
    roles = [UserRole.Student],
  } = data;

  const exists = await User.findOne({ email });
  if (exists) throw new AppError("Email already in use", 409);

  const newUser = new User({ firstName, lastName, email, roles, createdBy });

  const studentIdCardNo = await generateProfileId("student");
  const instructorIdCardNo = await generateProfileId("instructor");
  const adminIdCardNo = await generateProfileId("admin");

  if (roles.includes(UserRole.Student)) {
    const studentProfile = await StudentProfile.create({
      user: newUser._id,
      phone,
      address,
      idCardNo: studentIdCardNo,
    });

    newUser.studentProfile = studentProfile._id as Types.ObjectId;
  }

  if (roles.includes(UserRole.Instructor)) {
    const instructorProfile = await InstructorProfile.create({
      user: newUser._id,
      phone,
      address,
      idCardNo: instructorIdCardNo,
    });

    newUser.instructorProfile = instructorProfile._id as Types.ObjectId;
  }

  if (roles.includes(UserRole.Admin)) {
    const adminProfile = await AdminProfile.create({
      user: newUser._id,
      phone,
      address,
      idCardNo: adminIdCardNo,
    });

    newUser.adminProfile = adminProfile._id as Types.ObjectId;
  }

  await newUser.save();

  return {
    user: newUser,
    studentIdCardNo: roles.includes(UserRole.Student)
      ? studentIdCardNo
      : undefined,
  };
};

export const loginUser = async (
  email: string,
  password: string,
  role: UserRole
) => {
  const user = await User.findOne({ email });
  if (!user) throw new AppError("Invalid credentials", 401);

  const validPassword = await bcrypt.compare(password, user.password!);
  if (!validPassword) throw new AppError("Invalid credentials");

  // Optional role validation (if provided)
  if (role && !user.roles.includes(role)) {
    throw new AppError("You're not authorized to log in as this role", 403);
  }

  // Status checks
  if (user.accountStatus === "deactivated") {
    throw new AppError(
      "Account has been deactivated. Please contact support.",
      403
    );
  }

  if (user.accountStatus === "suspended") {
    throw new AppError(
      "Your account is suspended. Please contact support.",
      403
    );
  }

  if (!user._id) {
    throw new AppError("Invalid user ID", 401);
  }

  // Must change password check
  if (user.mustChangePassword) {
    return { mustChangePassword: true };
  }

  // Issue token, session, etc.
  const accessToken = generateAccessToken(user._id.toString());
  const refreshToken = generateRefreshToken(user._id.toString());

  await saveRefreshToken({
    userId: user._id as Types.ObjectId,
    token: refreshToken,
  });

  return { accessToken, refreshToken };
};

export const resetPassword = async (token: string, newPassword: string) => {
  if (!token || !newPassword) {
    throw new AppError("Token and new password are required", 200);
  }

  // Find token in DB
  const resetTokenDoc = await PasswordResetToken.findOne({ token });

  if (!resetTokenDoc || resetTokenDoc.expiresAt < new Date()) {
    throw new AppError("Invalid or expired token", 401);
  }

  // Get the user
  const user = await User.findById(resetTokenDoc.user);
  if (!user) throw new AppError("User not found", 404);

  // Hash and save the new password
  const hashed = await bcrypt.hash(newPassword, 10);
  user.password = hashed;
  user.mustChangePassword = false;

  await user.save();

  // Invalidate token after use
  await PasswordResetToken.deleteOne({ _id: resetTokenDoc._id });

  return { message: "Password reset successful" };
};

export const requestPasswordReset = async (email: string) => {
  const user = await User.findOne({ email });

  // Don’t reveal whether email exists
  if (!user) return;

  // Build reset link (your frontend route)
  const resetLink = `${CLIENT_BASE_URL}/reset-password?token=${await generatePasswordResetToken(
    user._id as Types.ObjectId
  )}`;

  await sendEmail({
    email: user.email,
    subject: "Reset Your Password",
    html: generateResetHTMLTemp({ resetLink, recipientName: user.firstName }),
  });
};
