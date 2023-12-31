import asyncHandler from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

import { options } from "../constants.js";

// import { validateEmail } from "../utils/validation/formatValidator.js";

import { User } from "../models/user.model.js";
import uploadOnCloudinary from "../services/cloudinary.js";

import jwt from "jsonwebtoken";
import { response } from "express";

const generateAccessAndRefreshTokens = async (user) => {
  //Instead of taking user._id we are taking user object

  try {
    const accessToken = user.generateAcessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;

    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new Error(
      500,
      "tokenGenerationError: Something went wrong during token generation"
    );
  }
};

const registerUser = asyncHandler(async (req, res) => {
  //get user's details
  //check whether the deatils have been provided
  //check whether the format of the deatils is correct
  //check whether the user already exists in the database
  //upload the files to the cloudinary
  //upload the files to the database
  //remove password and refresh token field from response
  //return res

  const { userName, fullName, email, password } = req.body;

  // console.log(userName, fullName, email, password);

  // console.log("req.body: ", req.body);

  //cheking that fields are provided

  if (
    [userName, fullName, email, password].some((field) => {
      field?.trim() === "";
    })
  ) {
    throw new ApiError(
      400,
      "fieldsEmptyError: All the fields are required in the form"
    );
  }

  //checking the format of the email

  // if (!validateEmail(email)) {
  //   throw new ApiError(400, "inputFormatError: Invalid email address");
  // }

  //checking if the user already exists

  const existedUser = await User.findOne({
    $or: [{ email }, { userName }],
  });

  if (existedUser) {
    throw new ApiError(409, "UserAlreadyExistsError: User already exists");
  }

  const avatarLocalPath = req.files?.avatar[0]?.path;

  // console.log("req.files.avatar: ", req.files.avatar);
  // console.log("avatarLocalPath: ", avatarLocalPath);

  if (!avatarLocalPath) {
    throw new ApiError(
      400,
      "fieldsEmptyError: Avatar field is required to filled"
    );
  }

  const coverImageLocalPath = req.files?.coverImage[0]?.path;

  // console.log("req.files.coverImage: ", req.files.coverImage);
  // console.log("coverImageLocalPath: ", coverImageLocalPath);

  if (!coverImageLocalPath) {
    throw new ApiError(
      400,
      "fieldsEmptyError: CoverImage field is required to filled"
    );
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);

  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  // console.log("avatar: ", avatar);
  // console.log("coverImage: ", coverImage);

  const user = await User.create({
    userName: userName.toLowerCase(),
    fullName,
    email,
    password,
    coverImage: coverImage?.url || "",
    avatar: avatar?.url || "",
  });

  // console.log("user: ", user);

  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  if (!createdUser) {
    throw new ApiError(
      500,
      "registerError: Something went wrong file registering the user"
    );
  }

  return res
    .status(200)
    .json(new ApiResponse(200, createdUser, "User registered successfully"));
});

const loginUser = asyncHandler(async (req, res) => {
  //Take user details from body
  //Check whether user is registered or not
  //Match the password thorugh user document method
  //Generate the JWT token
  //Set the tokens through cookies

  const { userName, password, email } = req.body;

  console.log("req.body: ", req.body);

  console.log("userName: ", userName);
  console.log("email: ", email);
  console.log("password: ", password);

  if (!(email || password) && !password) {
    throw new Error(
      400,
      "fieldsEmptyError: Required fields have not been provided"
    );
  }

  const user = await User.findOne({
    $or: [{ email }, { userName }],
  });

  if (!user) {
    throw new Error(400, "UserDoesNotExistError: User is not registered");
  }

  const isPasswordValid = user.isPasswrodCorrect(password);

  if (!isPasswordValid) {
    throw new Error(
      401,
      "passwordMissmatchError: Entered password is incorrect"
    );
  }

  const { accessToken, refreshToken } =
    await generateAccessAndRefreshTokens(user);

  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        { user: loggedInUser, accessToken, refreshToken },
        "User has been logged in successfully"
      )
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  //get the access token from the user
  //destructure for the user._id
  //match the user through the database
  //update 'refreshToken' and 'accessToken' properties in the database
  //delete the 'accessToken' and 'refreshToken' cookies

  const user = req.user;

  user.refreshToken = refreshToken;

  await user.save({ validateBeforeSave: false });

  // user.refreshToken = undefined;

  // await user.save({ validateBeforeSave: false });

  const options = {
    httpOnly: true,
    secure: true,
    expires: new Date(0),
  };

  res
    .status(200)
    .cookie("accessToken", "", options)
    .cookie("refreshToken", "", options)
    .json(
      new ApiResponse(
        200,
        {},
        "logOutSuccess: User has been logged out successfully"
      )
    );
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  //Take out the refresh token
  //Verify the token
  //Validate the token against the one from the db's refresh token
  //Generate new tokens by the generateRefreshAndAccessToken funtion
  //Return the tokens through cookies

  const incomingRefreshToken =
    req.cookies?.refreshToken || req.body.refreshToken;

  console.log(incomingRefreshToken);

  if (!incomingRefreshToken) {
    throw new ApiError(
      401,
      "unauthorizedAccessRequestError: Token is not present"
    );
  }

  const verifiedRefreshToken = jwt.verify(
    incomingRefreshToken,
    process.env.REFRESH_TOKEN_SECRET
  );

  console.log(verifiedRefreshToken);

  const user = await User.findById(verifiedRefreshToken?._id).select(
    "-password"
  );

  console.log(user._id);

  if (!user) {
    throw new ApiError(401, "InvalidRefreshTokenError: Invalid refresh token");
  }

  if (incomingRefreshToken !== user.refreshToken) {
    throw new ApiError(
      401,
      "RefreshTokenExpirationError: Refresh token has expired please bother to login again"
    );
  }

  const { newRefreshToken, accessToken } = generateAccessAndRefreshTokens(user);

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", newRefreshToken, options)
    .json(
      new ApiResponse(
        200,
        { refreshToken: newRefreshToken, accessToken },
        "accessTokenRefreshed: Access token has been refreshed"
      )
    );
});

const updatePassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword, confirmPassword } = req.body; //Confirm Password is normmaly validated on the frontend side

  if (!(oldPassword && newPassword && confirmPassword)) {
    throw new ApiError(
      400,
      "fieldsEmptyError: Pssword fielda are required to filled"
    );
  }

  if (!(confirmPassword === newPassword)) {
    throw new ApiError(
      400,
      "unauthorizedAccessRequest: Confrim password and the new password does not match"
    );
  }

  const user = await User.findById(req.user._id); //Here the requirement of fetching the user again is required as the "auth" middleware does not neglects the fecthing of password and that's what's needed here

  if (!user) {
    throw new ApiError(
      400,
      "unauthorizedAccessRequestError: Token is not present something went wrong with the 'auth' middleware"
    );
  }

  if (!user.isPasswrodCorrect(user.password)) {
    throw new ApiError(
      400,
      "unauthorizedAccessRequest: Povided password is incorrect"
    );
  }

  user.password = newPassword;
  await user.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password has been updated successfully"));
});

const getCurrentUser = asyncHandler((req, res) => {
  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        req.user,
        "Current user has been fetched and delivered succesfully"
      )
    );
});

const updateAccountDetails = asyncHandler(async (req, res) => {
  const { fullName, email } = req.body;

  if (!(fullName && email)) {
    throw new ApiError(
      400,
      "fieldsEmptyError: fullName and email fields are required in the form"
    );
  }

  console.log("fullName:", fullName, "/nemail:", email);

  if (!(fullName && email)) {
    throw new ApiError(
      400,
      "fieldsEmptyError: fullName and email fields are required in the form"
    );
  }

  const user = req.user;

  if (!user) {
    throw new ApiError(
      400,
      "unauthorizedAccessRequestError: Token is not present something went wrong with the 'auth' middleware"
    );
  }

  user.fullName = fullName;
  user.email = email;

  await user.save({ validateBeforeSave: true });

  const userWithUpdatedCredentials = await User.findById(user._id);

  console.log(
    "updatedEmail: ",
    userWithUpdatedCredentials.email,
    "/nfullName: ",
    userWithUpdatedCredentials.fullName
  );

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        userWithUpdatedCredentials,
        "Account details have been updated successfully"
      )
    );
});

const updateUserAvatar = asyncHandler(async (req, res) => {
  const avatarFilePath = req.file?.path;

  if (!avatarFilePath) {
    throw new ApiError(
      401,
      "fieldsEmptyError: AvatarImage field is required to filled"
    );
  }

  const user = req.user;

  if (!user) {
    throw new ApiError(
      401,
      "unauthorizedAccessRequestError: Token is not present something went wrong with the 'auth' middleware"
    );
  }

  const file = await uploadOnCloudinary(avatarFilePath);

  const userWithUpdatedCredentials = await User.findByIdAndUpdate(
    user?._id,
    {
      $set: {
        avatar: file.url,
      },
    },
    { new: true }
  ).select("-password");

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        userWithUpdatedCredentials,
        "Avatar Image has been updated successfully"
      )
    );
});

const updateUserCoverImage = asyncHandler(async (req, res) => {
  const coverImageFilePath = req.file?.path;

  if (!coverImageFilePath) {
    throw new ApiError(
      401,
      "fieldsEmptyError: CoverImage field is required to filled"
    );
  }

  const user = req.user;

  if (!user) {
    throw new ApiError(
      401,
      "unauthorizedAccessRequestError: Token is not present something went wrong with the 'auth' middleware"
    );
  }

  const file = await uploadOnCloudinary(coverImageFilePath);

  const userWithUpdatedCredentials = await User.findByIdAndUpdate(
    user?._id,
    {
      $set: {
        coverImage: file.url,
      },
    },
    { new: true }
  ).select("-password");

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        userWithUpdatedCredentials,
        "Avatar Image has been updated successfully"
      )
    );
});

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  updatePassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
};
