import { db } from "@repo/db";
import { authPool } from "./auth.js";
import { app } from "./app.js";

async function startServer() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "Set BETTER_AUTH_SECRET to a random value of at least 32 characters.",
    );
  }

  try {
    await Promise.all([db.connect(), authPool.query("SELECT 1")]);

    const port = Number(process.env.PORT ?? 5000);
    app.listen(port, () => {
      console.log(`HTTP server is running on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to connect to the database:", error);
    process.exit(1);
  }
}

void startServer();
