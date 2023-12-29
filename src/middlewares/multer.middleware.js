import multer from "multer";
import { PATH_TO_STAT_FIES } from "../constants";

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, PATH_TO_STAT_FIES);
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  },
});

export const upload = multer({
  storage,
});
