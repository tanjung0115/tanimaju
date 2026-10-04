import express from "express";
import "dotenv/config";
import cors from "cors";
import type { ErrorRequestHandler } from "express";
import { uploadRoot } from "./middleware/imageUpload.js";
import cookieParser from "cookie-parser";
import { startSessionCleanupJob } from "./utils/sessionCleanup.js";

const app = express();

const allowedOrigins = (process.env.CLIENT_URL || "").split(",").map(origin => origin.trim()).filter(Boolean);
if (process.env.NODE_ENV === "production" && !allowedOrigins.length) throw new Error("Production requires CLIENT_URL.");
const PORT = process.env.PORT || 5000;

app.disable("x-powered-by");
app.use((_req, res, next) => { res.setHeader("X-Content-Type-Options", "nosniff"); next(); });
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser()); 
app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// serve file upload
app.use("/uploads", express.static(uploadRoot));

// === Routes MySQL ===
const startServer = async () => {
  try {
    const { testConnection } = await import("./config/mysql-database.js");
    const { default: productRoutesMysql } = await import(
      "./routes/mysql/productRoutes.js"
    );
    const { default: petaniRoutesMysql } = await import(
      "./routes/mysql/petaniRoutes.js"
    );
    const { default: postRoutesMysql } = await import(
      "./routes/mysql/postRoutes.js"
    );
    const { default: bibitRoutesMysql } = await import(
      "./routes/mysql/bibitRoutes.js"
    );
    const { default: tanamanRoutesMysql } = await import(
      "./routes/mysql/tanamanRoutes.js"
    );
    const { default: panenRoutesMysql } = await import(
      "./routes/mysql/panenRoutes.js"
    );
    const { default: lahanRoutesMysql } = await import(
      "./routes/mysql/lahanRoutes.js"
    );
    const { default: siklusTanamRoutesMysql } = await import(
      "./routes/mysql/siklusTanamRoutes.js"
    );
    const { default: aktivitasPertanianRoutesMysql } = await import(
      "./routes/mysql/aktivitasPertanianRoutes.js"
    );
    const { default: adminDashboardRoutesMysql } = await import(
      "./routes/mysql/adminDashboardRoutes.js"
    );
    const { default: petaniDashboardRoutesMysql } = await import(
      "./routes/mysql/petaniDashboardRoutes.js"
    );
    const { default: authRoutesMysql } = await import(
      "./routes/mysql/authRoutes.js"
    );

    app.use("/api/products", productRoutesMysql);
    app.use("/api/petani", petaniRoutesMysql);
    app.use("/api/posts", postRoutesMysql);
    app.use("/api/bibit", bibitRoutesMysql);
    app.use("/api/tanaman", tanamanRoutesMysql);
    const { default: reportRoutesMysql } = await import("./routes/mysql/reportRoutes.js");
    app.use("/api/reports", reportRoutesMysql);
    const { default: notificationRoutes } = await import("./routes/mysql/notificationRoutes.js");
    const { default: reminderRoutes } = await import("./routes/mysql/reminderRoutes.js");
    app.use("/api/notifications", notificationRoutes);
    app.use("/api/reminders", reminderRoutes);
    app.use("/api/panen", panenRoutesMysql);
    app.use("/api/lahan", lahanRoutesMysql);
    app.use("/api/siklus-tanam", siklusTanamRoutesMysql);
    app.use("/api/aktivitas-pertanian", aktivitasPertanianRoutesMysql);
    app.use("/api/dashboard/admin", adminDashboardRoutesMysql);
    app.use("/api/dashboard/petani", petaniDashboardRoutesMysql);
    app.use("/api/auth", authRoutesMysql); // Add auth routes

    const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
      void _next; // Express recognizes error middleware by its four arguments.
      console.error("Unhandled API error:", error);
      const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 500;
      res.status(status === 413 ? 413 : status === 400 ? 400 : 500).json({ error: status === 413 ? "Data terlalu besar." : status === 400 ? "Format permintaan tidak valid." : "Server belum dapat memproses permintaan." });
    };
    app.use(errorHandler);

    // tes koneksi MySQL
    const connected = await testConnection();
    if (connected) {
      console.log("MySQL connected ✅");
      
      // Start session cleanup job
      startSessionCleanupJob();
      const { startReminderScheduler } = await import("./services/reminderScheduler.js");
      const stopReminders = startReminderScheduler();
      process.once("exit", () => stopReminders?.());
      
      app.listen(PORT, () =>
        console.log(`🚀 Server running on http://localhost:${PORT}`)
      );
    } else {
      console.error("❌ MySQL connection failed");
      process.exit(1);
    }
  } catch (err) {
    console.error("MySQL setup error ❌", err);
    process.exit(1);
  }
};

startServer();

app.get("/", (req, res) => {
  res.send("Backend API running 🚀");
});
