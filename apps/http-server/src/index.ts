import { connectDatabase } from "@repo/db";
import { assertAuthConfiguration } from "@repo/auth";
import { app } from "./app.js";

async function startServer() {
  assertAuthConfiguration();

  try {
    await connectDatabase();

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
