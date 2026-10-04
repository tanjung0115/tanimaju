// backend/src/routes/mysql/bibitRoutes.ts
import express from "express";
import mysqlPool from "../../config/mysql-database.js";
import { authenticateToken, requireAdmin } from "../../middleware/auth.js";
import { parseListQuery, pagination } from "../../utils/listQuery.js";

const router = express.Router();

// Get all bibit
router.get("/", async (req, res) => {
  try {
    if (Object.keys(req.query).length === 0) {
      const [legacyRows] = await mysqlPool.execute("SELECT * FROM bibit ORDER BY id DESC");
      return res.json(legacyRows);
    }
    const queryOptions = parseListQuery(req, { id: "id", tanggalPemberian: "tanggalPemberian", created_at: "created_at" }, "id");
    if ('error' in queryOptions) return res.status(400).json({ error: queryOptions.error });
    const conditions: string[] = [];
    const values: Array<string | number> = [];
    if (queryOptions.search) { conditions.push('(tanaman LIKE ? OR sumber LIKE ? OR namaPenyedia LIKE ?)'); const term = `%${queryOptions.search}%`; values.push(term, term, term); }
    if (typeof req.query.tanaman === 'string') { conditions.push('tanaman = ?'); values.push(req.query.tanaman); }
    if (typeof req.query.sumber === 'string') { conditions.push('sumber = ?'); values.push(req.query.sumber); }
    if (queryOptions.startDate) { conditions.push('tanggalPemberian >= ?'); values.push(queryOptions.startDate); }
    if (queryOptions.endDate) { conditions.push('tanggalPemberian <= ?'); values.push(queryOptions.endDate); }
    if (typeof req.query.nama_penyedia === 'string') { conditions.push('namaPenyedia LIKE ?'); values.push(`%${req.query.nama_penyedia}%`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await mysqlPool.execute(`SELECT * FROM bibit ${where} ORDER BY ${queryOptions.sortBy} ${queryOptions.sortOrder} LIMIT ? OFFSET ?`, [...values, String(queryOptions.limit), String(queryOptions.offset)]);
    const [countRows] = await mysqlPool.execute(`SELECT COUNT(*) AS total FROM bibit ${where}`, values);
    return res.json({ data: rows, pagination: pagination(queryOptions.page, queryOptions.limit, Number((countRows as Array<{ total: number }>)[0]?.total || 0)) });
  } catch (error) {
    console.error("❌ Error fetching bibit:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get bibit by ID
router.get("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const [rows] = await mysqlPool.execute("SELECT * FROM bibit WHERE id = ?", [id]);
    
    if ((rows as any[]).length === 0) {
      return res.status(404).json({ error: "Bibit not found" });
    }
    
    res.json((rows as any[])[0]);
  } catch (error) {
    console.error("❌ Error fetching bibit:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create new bibit
router.post("/", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { tanaman, sumber, namaPenyedia, tanggalPemberian } = req.body;

    if (!namaPenyedia) {
      return res.status(400).json({ error: "Nama penyedia wajib diisi" });
    }

    const [result] = await mysqlPool.execute(
      "INSERT INTO bibit (tanaman, sumber, namaPenyedia, tanggalPemberian) VALUES (?, ?, ?, ?)",
      [tanaman || null, sumber || null, namaPenyedia, tanggalPemberian || null]
    );

    const insertId = (result as any).insertId;
    res.status(201).json({ 
      message: "Bibit created successfully", 
      id: insertId 
    });
  } catch (error) {
    console.error("❌ Error creating bibit:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update bibit
router.put("/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const { tanaman, sumber, namaPenyedia, tanggalPemberian } = req.body;

    const [result] = await mysqlPool.execute(
      "UPDATE bibit SET tanaman = ?, sumber = ?, namaPenyedia = ?, tanggalPemberian = ? WHERE id = ?",
      [tanaman, sumber || null, namaPenyedia || null, tanggalPemberian, id]
    );

    if ((result as any).affectedRows === 0) {
      return res.status(404).json({ error: "Bibit not found" });
    }

    res.json({ message: "Bibit updated successfully" });
  } catch (error) {
    console.error("❌ Error updating bibit:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete bibit
router.delete("/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;

    const [result] = await mysqlPool.execute("DELETE FROM bibit WHERE id = ?", [id]);

    if ((result as any).affectedRows === 0) {
      return res.status(404).json({ error: "Bibit not found" });
    }

    res.json({ message: "Bibit deleted successfully" });
  } catch (error) {
    console.error("❌ Error deleting bibit:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
