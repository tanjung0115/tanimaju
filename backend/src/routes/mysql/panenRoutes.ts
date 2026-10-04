import { buildPanenList, ListValidationError } from '../../repositories/listPlans.js';
import express from "express";
import mysqlPool from "../../config/mysql-database.js";
import { getCurrentDateGMT7 } from "../../utils/timezone.js";
import { authenticateToken, optionalAuth, requireAdmin } from "../../middleware/auth.js";
import { pagination } from "../../utils/listQuery.js";

const router = express.Router();

// Get all panen
router.get("/", optionalAuth, async (req, res) => {
  try {
    if (Object.keys(req.query).length > 0 || req.user?.role === 'petani') {
      const { queryOptions, values, where, base, select } = await buildPanenList(req);
    const [rows] = await mysqlPool.execute(`SELECT ${select} ${base} ${where} ORDER BY ${queryOptions.sortBy} ${queryOptions.sortOrder} LIMIT ? OFFSET ?`, [...values, String(queryOptions.limit), String(queryOptions.offset)]);
      const [countRows] = await mysqlPool.execute(`SELECT COUNT(*) AS total ${base} ${where}`, values);
      return res.json({ data: rows, pagination: pagination(queryOptions.page, queryOptions.limit, Number((countRows as Array<{ total: number }>)[0]?.total || 0)) });
    }
    const [rows] = await mysqlPool.execute(`
      SELECT p.*, 
             pt.nama AS petani_nama, 
             t.namaTanaman AS tanaman_nama,
                  b.namaPenyedia AS bibit_nama_penyedia,
                  l.nama_lahan AS lahan_nama
      FROM panen p
      LEFT JOIN petani pt ON p.petani_id = pt.id
      LEFT JOIN tanaman t ON p.tanaman_id = t.id
      LEFT JOIN bibit b ON p.bibit_id = b.id
                LEFT JOIN lahan l ON p.lahan_id = l.id
      ORDER BY p.id DESC
    `);
    console.log("✅ MySQL Panen found:", (rows as any[]).length, "items");
    res.json(rows);
  } catch (error) {
    if (error instanceof ListValidationError) return res.status(400).json({ error: error.message });
    console.error("❌ Error fetching panen:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get panen by ID
router.get("/:id", optionalAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const [rows] = await mysqlPool.execute(`
      SELECT p.*, 
             pt.nama AS petani_nama, 
             t.namaTanaman AS tanaman_nama,
                  b.namaPenyedia AS bibit_nama_penyedia,
                  l.nama_lahan AS lahan_nama
      FROM panen p
      LEFT JOIN petani pt ON p.petani_id = pt.id
      LEFT JOIN tanaman t ON p.tanaman_id = t.id
      LEFT JOIN bibit b ON p.bibit_id = b.id
                LEFT JOIN lahan l ON p.lahan_id = l.id
      WHERE p.id = ? AND (? IS NULL OR pt.user_id = ?)
    `, [id, req.user?.role === 'petani' ? req.user.id : null, req.user?.role === 'petani' ? req.user.id : null]);
    
    if ((rows as any[]).length === 0) {
      return res.status(404).json({ error: "Panen not found" });
    }
    
    res.json((rows as any[])[0]);
  } catch (error) {
    console.error("❌ Error fetching panen:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create new panen
router.post("/", authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log("📝 Creating panen with data:", req.body);

    const { 
      tanggalPanen, 
      petani, 
      tanaman,
      lahan,
      lahanId,
      siklusTanamId,
      bibit,
      pupuk,
      jumlahHasilPanen, 
      statusPenjualan, 
      namaPembeli
    } = req.body;

    // First, get the IDs from names
    let petani_id = null;
    let tanaman_id = null;
    let bibit_id = null;

    // Get petani ID by name or use ID directly
    if (petani) {
      // Check if petani is already an ID (numeric)
      if (!isNaN(Number(petani))) {
        petani_id = Number(petani);
      } else {
        // If it's a name, look up the ID
        const [petaniRows] = await mysqlPool.execute("SELECT id FROM petani WHERE nama = ?", [petani]);
        if ((petaniRows as any[]).length > 0) {
          petani_id = (petaniRows as any[])[0].id;
        }
      }
    }

    // Get tanaman ID by name or use ID directly
    if (tanaman) {
      // Check if tanaman is already an ID (numeric)
      if (!isNaN(Number(tanaman))) {
        tanaman_id = Number(tanaman);
      } else {
        // If it's a name, look up the ID
        const [tanamanRows] = await mysqlPool.execute("SELECT id FROM tanaman WHERE namaTanaman = ?", [tanaman]);
        if ((tanamanRows as any[]).length > 0) {
          tanaman_id = (tanamanRows as any[])[0].id;
        }
      }
    }

    // Get bibit ID by namaPenyedia or use ID directly
    if (bibit) {
      // Check if bibit is already an ID (numeric)
      if (!isNaN(Number(bibit))) {
        bibit_id = Number(bibit);
      } else {
        // If it's a name, look up the ID
        const [bibitRows] = await mysqlPool.execute("SELECT id FROM bibit WHERE namaPenyedia = ?", [bibit]);
        if ((bibitRows as any[]).length > 0) {
          bibit_id = (bibitRows as any[])[0].id;
        }
      }
    }

    const parsedLahanId = lahanId ? Number.parseInt(String(lahanId), 10) : null;
    const parsedSiklusTanamId = siklusTanamId ? Number.parseInt(String(siklusTanamId), 10) : null;
    if (parsedSiklusTanamId !== null) {
      const [cycleRows] = await mysqlPool.execute("SELECT petani_id, lahan_id, tanaman_id, tanggal_tanam FROM siklus_tanam s INNER JOIN lahan l ON l.id = s.lahan_id WHERE s.id = ?", [parsedSiklusTanamId]);
      const cycle = (cycleRows as Array<{ petani_id: number; lahan_id: number; tanaman_id: number; tanggal_tanam: string }>)[0];
      if (!cycle || cycle.petani_id !== petani_id || cycle.tanaman_id !== tanaman_id || cycle.lahan_id !== parsedLahanId || tanggalPanen && tanggalPanen < cycle.tanggal_tanam) {
        return res.status(400).json({ error: "Panen references do not match the selected siklus tanam" });
      }
    }
    if (parsedLahanId !== null) {
      const [lahanRows] = await mysqlPool.execute("SELECT petani_id FROM lahan WHERE id = ?", [parsedLahanId]);
      const lahanRecord = (lahanRows as Array<{ petani_id: number }>)[0];
      if (!lahanRecord || lahanRecord.petani_id !== petani_id) {
        return res.status(400).json({ error: "Lahan does not belong to the selected petani" });
      }
    }

    const query = `
      INSERT INTO panen (
        petani_id,
        tanaman_id,
        lahan,
        lahan_id,
        siklus_tanam_id,
        bibit_id,
        pupuk,
        jumlahHasilPanen, 
        tanggalPanen, 
        statusPenjualan, 
        namaPembeli,
        created_at, 
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `;
    
    const values = [
      petani_id,
      tanaman_id, 
      lahan,
      parsedLahanId,
      parsedSiklusTanamId,
      bibit_id,
      pupuk,
      jumlahHasilPanen, 
      tanggalPanen || getCurrentDateGMT7(), 
      statusPenjualan || 'Belum Terjual', 
      namaPembeli || null
    ];
    
    console.log("🔍 SQL Query:", query);
    console.log("🔍 Values:", values);
    
    const [result] = await mysqlPool.execute(query, values);
    const insertId = (result as any).insertId;

    console.log("✅ Panen created with ID:", insertId);
    
    res.status(201).json({ 
      message: "Panen created successfully", 
      id: insertId 
    });
  } catch (error) {
    console.error("❌ Error creating panen:", error);
    res.status(500).json({ error: "Internal server error", details: (error as Error).message });
  }
});

// Update panen
router.put("/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    console.log("📝 Updating panen ID:", id, "with data:", req.body);

    const { 
      tanggalPanen, 
      petani, 
      tanaman,
      lahan,
      lahanId,
      siklusTanamId,
      bibit,
      pupuk,
      jumlahHasilPanen, 
      statusPenjualan, 
      namaPembeli
    } = req.body;

    // Get IDs from names
    let petani_id = null;
    let tanaman_id = null;
    let bibit_id = null;

    // Get petani ID by name or use ID directly
    if (petani) {
      // Check if petani is already an ID (numeric)
      if (!isNaN(Number(petani))) {
        petani_id = Number(petani);
      } else {
        // If it's a name, look up the ID
        const [petaniRows] = await mysqlPool.execute("SELECT id FROM petani WHERE nama = ?", [petani]);
        if ((petaniRows as any[]).length > 0) {
          petani_id = (petaniRows as any[])[0].id;
        }
      }
    }

    // Get tanaman ID by name or use ID directly
    if (tanaman) {
      // Check if tanaman is already an ID (numeric)
      if (!isNaN(Number(tanaman))) {
        tanaman_id = Number(tanaman);
      } else {
        // If it's a name, look up the ID
        const [tanamanRows] = await mysqlPool.execute("SELECT id FROM tanaman WHERE namaTanaman = ?", [tanaman]);
        if ((tanamanRows as any[]).length > 0) {
          tanaman_id = (tanamanRows as any[])[0].id;
        }
      }
    }

    // Get bibit ID by namaPenyedia or use ID directly
    if (bibit) {
      // Check if bibit is already an ID (numeric)
      if (!isNaN(Number(bibit))) {
        bibit_id = Number(bibit);
      } else {
        // If it's a name, look up the ID
        const [bibitRows] = await mysqlPool.execute("SELECT id FROM bibit WHERE namaPenyedia = ?", [bibit]);
        if ((bibitRows as any[]).length > 0) {
          bibit_id = (bibitRows as any[])[0].id;
        }
      }
    }

    const parsedLahanId = lahanId ? Number.parseInt(String(lahanId), 10) : null;
    const parsedSiklusTanamId = siklusTanamId ? Number.parseInt(String(siklusTanamId), 10) : null;
    if (parsedSiklusTanamId !== null) {
      const [cycleRows] = await mysqlPool.execute("SELECT petani_id, lahan_id, tanaman_id, tanggal_tanam FROM siklus_tanam s INNER JOIN lahan l ON l.id = s.lahan_id WHERE s.id = ?", [parsedSiklusTanamId]);
      const cycle = (cycleRows as Array<{ petani_id: number; lahan_id: number; tanaman_id: number; tanggal_tanam: string }>)[0];
      if (!cycle || cycle.petani_id !== petani_id || cycle.tanaman_id !== tanaman_id || cycle.lahan_id !== parsedLahanId || tanggalPanen && tanggalPanen < cycle.tanggal_tanam) {
        return res.status(400).json({ error: "Panen references do not match the selected siklus tanam" });
      }
    }
    if (parsedLahanId !== null) {
      const [lahanRows] = await mysqlPool.execute("SELECT petani_id FROM lahan WHERE id = ?", [parsedLahanId]);
      const lahanRecord = (lahanRows as Array<{ petani_id: number }>)[0];
      if (!lahanRecord || lahanRecord.petani_id !== petani_id) {
        return res.status(400).json({ error: "Lahan does not belong to the selected petani" });
      }
    }

    const [result] = await mysqlPool.execute(`
      UPDATE panen SET 
        petani_id = ?, 
        tanaman_id = ?, 
        lahan = ?, 
        lahan_id = ?,
        siklus_tanam_id = ?,
        bibit_id = ?, 
        pupuk = ?, 
        jumlahHasilPanen = ?, 
        tanggalPanen = ?, 
        statusPenjualan = ?, 
        namaPembeli = ?,
        updated_at = NOW()
      WHERE id = ?
    `, [
      petani_id, 
      tanaman_id, 
      lahan, 
      parsedLahanId,
      parsedSiklusTanamId,
      bibit_id, 
      pupuk, 
      jumlahHasilPanen, 
      tanggalPanen, 
      statusPenjualan, 
      namaPembeli, 
      id
    ]);
    
    if ((result as any).affectedRows === 0) {
      return res.status(404).json({ error: "Panen not found" });
    }
    
    console.log("✅ Panen updated successfully");
    res.json({ message: "Panen updated successfully" });
  } catch (error) {
    console.error("❌ Error updating panen:", error);
    res.status(500).json({ error: "Internal server error", details: (error as Error).message });
  }
});

// Delete panen
router.delete("/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    console.log("🗑️ Deleting panen ID:", id);
    
    const [result] = await mysqlPool.execute("DELETE FROM panen WHERE id = ?", [id]);
    
    if ((result as any).affectedRows === 0) {
      return res.status(404).json({ error: "Panen not found" });
    }
    
    console.log("✅ Panen deleted successfully");
    res.json({ message: "Panen deleted successfully" });
  } catch (error) {
    console.error("❌ Error deleting panen:", error);
    res.status(500).json({ error: "Internal server error", details: (error as Error).message });
  }
});

export default router;
