import express from "express";
import cors from "cors";
import { env } from "./env";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(env.port, () => {
  console.log(`Server listening on port ${env.port}`);
});
