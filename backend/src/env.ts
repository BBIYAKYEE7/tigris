import path from "path";
import dotenv from "dotenv";

if (process.env.VERCEL !== "1") {
  dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env") });
}
