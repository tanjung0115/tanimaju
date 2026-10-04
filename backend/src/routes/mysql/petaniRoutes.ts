import type { Petani } from "../../models/mysql/interfaces.js";
import { createImageUpload, uploadErrorHandler } from "../../middleware/imageUpload.js";
// backend/src/routes/mysql/petaniRoutes.ts
import express from "express";
import { PetaniRepository } from "../../repositories/PetaniRepository.js";
import { adaptMySQLToMongo, adaptMongoToMySQL } from "../../utils/dataAdapter.js";
import { authenticateToken, optionalAuth, requireAdmin, requireRole } from "../../middleware/auth.js";
import { UserRepository } from "../../repositories/UserRepository.js";
import { parseListQuery, pagination } from "../../utils/listQuery.js";

const router = express.Router();

// Konfigurasi multer untuk upload file dengan timezone GMT+7
const upload = createImageUpload("petani");

// GET the petani profile linked to the authenticated account.
router.get("/me", authenticateToken, requireRole(["petani"]), async (req, res) => {
  try {
    const petani = await PetaniRepository.findByUserId(req.user!.id);
    if (!petani) return res.status(404).json({ error: "Petani profile is not linked" });
    res.json(adaptMySQLToMongo(petani));
  } catch (error) {
    console.error("❌ Error fetching current petani profile:", error);
    res.status(500).json({ error: "Failed to fetch petani profile" });
  }
});

// GET all petani
router.get("/", optionalAuth, async (req, res) => {
  try {
    if (req.user?.role === 'petani') {
      const profile = await PetaniRepository.findByUserId(req.user.id);
      const queryOptions = parseListQuery(req, { nama: 'nama', created_at: 'created_at' }, 'nama');
      if ('error' in queryOptions) return res.status(400).json({ error: queryOptions.error });
      return res.json({ data: profile && queryOptions.page === 1 ? [adaptMySQLToMongo(profile)] : [], pagination: pagination(queryOptions.page, queryOptions.limit, profile ? 1 : 0) });
    }
    if (Object.keys(req.query).length > 0) {
      const queryOptions = parseListQuery(req, { nama: "nama", created_at: "created_at" }, "created_at");
      if ('error' in queryOptions) return res.status(400).json({ error: queryOptions.error });
      const result = await PetaniRepository.findPage(queryOptions, req.query.petani_id ? Number(req.query.petani_id) : undefined);
      return res.json({ data: adaptMySQLToMongo(result.data), pagination: pagination(queryOptions.page, queryOptions.limit, result.total) });
    }
    const petani = await PetaniRepository.findAll();
    console.log(`✅ MySQL Petani found: ${petani.length} items`);
    const adaptedData = adaptMySQLToMongo(petani);
    res.json(adaptedData);
  } catch (error) {
    console.error("❌ Error fetching petani:", error);
    res.status(500).json({ error: "Failed to fetch petani" });
  }
});

// PUT link an approved petani account to an existing profile (Admin only).
router.put("/:id/link-user", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const id = adaptMongoToMySQL(req.params.id);
    const userId = typeof req.body.userId === "string" ? Number.parseInt(req.body.userId, 10) : req.body.userId;
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: "A valid userId is required" });
    }

    const user = await UserRepository.findById(userId);
    if (!user || user.role !== "petani") {
      return res.status(400).json({ error: "User must be an approved petani account" });
    }
    if (await PetaniRepository.findByUserId(userId)) {
      return res.status(409).json({ error: "User is already linked to a petani profile" });
    }
    if (!await PetaniRepository.findById(id)) {
      return res.status(404).json({ error: "Petani not found" });
    }
    if (!await PetaniRepository.linkUser(id, userId)) {
      return res.status(409).json({ error: "Petani profile is already linked" });
    }

    res.json(adaptMySQLToMongo(await PetaniRepository.findById(id)));
  } catch (error) {
    console.error("❌ Error linking user to petani:", error);
    res.status(500).json({ error: "Failed to link user to petani" });
  }
});

// GET single petani by ID
router.get("/:id", optionalAuth, async (req, res) => {
  try {
    const id = adaptMongoToMySQL(req.params.id);
    const petani = await PetaniRepository.findById(id);
    if (!petani || req.user?.role === 'petani' && petani.user_id !== req.user.id) {
      return res.status(404).json({ error: "Petani not found" });
    }
    
    console.log(`✅ MySQL Petani found: ${petani.nama}`);
    const adaptedPetani = adaptMySQLToMongo(petani);
    res.json(adaptedPetani);
  } catch (error) {
    console.error("❌ Error fetching petani:", error);
    res.status(500).json({ error: "Failed to fetch petani" });
  }
});

// POST create new petani
router.post("/", authenticateToken, requireAdmin, upload.single('foto'), async (req, res) => {
  try {
    const { nama, alamat, nomorKontak } = req.body;
    
    // Validate required fields
    if (!nama) {
      return res.status(400).json({ error: "Nama is required" });
    }

    const petaniData = {
      nama,
      alamat: alamat || undefined,
      nomorKontak: nomorKontak || undefined,
      foto: req.file ? `/uploads/petani/${req.file.filename}` : undefined
    };

    const petaniId = await PetaniRepository.create(petaniData);
    
    console.log(`✅ MySQL Petani created with ID: ${petaniId}`);
    
    // Return created petani with adapted structure
    const createdPetani = await PetaniRepository.findById(petaniId);
    const adaptedData = adaptMySQLToMongo(createdPetani);
    res.status(201).json(adaptedData);
  } catch (error) {
    console.error("❌ Error creating petani:", error);
    res.status(500).json({ error: "Failed to create petani" });
  }
});

// PUT update petani
router.put("/:id", authenticateToken, requireAdmin, upload.single('foto'), async (req, res) => {
  try {
    const id = adaptMongoToMySQL(req.params.id);

    // Check if petani exists
    const existingPetani = await PetaniRepository.findById(id);
    if (!existingPetani) {
      return res.status(404).json({ error: "Petani not found" });
    }

    const { nama, alamat, nomorKontak } = req.body;
    
    const updateData: Partial<Petani> = {};
    
    if (nama !== undefined) updateData.nama = nama;
    if (alamat !== undefined) updateData.alamat = alamat;
    if (nomorKontak !== undefined) updateData.nomorKontak = nomorKontak;
    if (req.file) updateData.foto = `/uploads/petani/${req.file.filename}`;

    const updated = await PetaniRepository.update(id, updateData);
    if (!updated) {
      return res.status(400).json({ error: "No changes made" });
    }
    
    // Return updated petani with adapted structure
    const updatedPetani = await PetaniRepository.findById(id);
    const adaptedUpdatedPetani = adaptMySQLToMongo(updatedPetani);
    
    console.log(`✅ MySQL Petani updated: ${id}`);
    res.json(adaptedUpdatedPetani);
  } catch (error) {
    console.error("❌ Error updating petani:", error);
    res.status(500).json({ error: "Failed to update petani" });
  }
});

// DELETE petani
router.delete("/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const id = adaptMongoToMySQL(req.params.id);

    const deleted = await PetaniRepository.delete(id);
    if (!deleted) {
      return res.status(404).json({ error: "Petani not found" });
    }
    
    console.log(`✅ MySQL Petani deleted: ${id}`);
    res.json({ message: "Petani deleted successfully" });
  } catch (error) {
    console.error("❌ Error deleting petani:", error);
    res.status(500).json({ error: "Failed to delete petani" });
  }
});

router.use(uploadErrorHandler);

export default router;
