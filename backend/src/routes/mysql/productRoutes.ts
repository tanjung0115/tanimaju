import { createImageUpload, uploadErrorHandler } from "../../middleware/imageUpload.js";
// backend/src/routes/mysql/productRoutes.ts
import express from "express";
import { ProductRepository } from "../../repositories/ProductRepository.js";
import { ProductRatingRepository } from "../../repositories/ProductRatingRepository.js";
import type { Product } from "../../models/mysql/interfaces.js";
import { authenticateToken, requireAdmin } from "../../middleware/auth.js";




const router = express.Router();

const upload = createImageUpload("products");

// GET all products
router.get("/", async (req, res) => {
  try {
    const products = await ProductRepository.findAll();
    console.log(`✅ MySQL Products found: ${products.length} items`);
    res.json(products);
  } catch (error) {
    console.error("❌ Error fetching products:", error);
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10); // ✅ ubah ke number

    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid product ID" });
    }

    const product = await ProductRepository.findById(id);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json(product);
  } catch (error) {
    console.error("❌ Error fetching product:", error);
    res.status(500).json({ error: "Failed to fetch product" });
  }
});

// POST create new product
router.post("/", authenticateToken, requireAdmin, upload.single("imageSrc"), async (req, res) => {
  try {
    const { title, price, description, info, whatsappNumber } = req.body;

    if (!title || !price) {
      return res.status(400).json({ error: "Title and price are required" });
    }

    const productData = {
      title,
      price: parseFloat(price),
      imageSrc: req.file ? `/uploads/products/${req.file.filename}` : null,
      description: description || null,
      info: info || null,
      whatsappNumber: whatsappNumber || null,
    };

    const productId = await ProductRepository.create(productData);
    console.log(`✅ MySQL Product created with ID: ${productId}`);
    res.status(201).json({
      id: productId,
      message: "Product created successfully",
      ...productData,
    });
  } catch (error) {
    console.error("❌ Error creating product:", error);
    res.status(500).json({ error: "Failed to create product" });
  }
});

// PUT update product
router.put("/:id", authenticateToken, requireAdmin, upload.single("imageSrc"), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid product ID" });
    }

    const existingProduct = await ProductRepository.findById(id);
    if (!existingProduct) {
      return res.status(404).json({ error: "Product not found" });
    }

    const { title, price, description, info, whatsappNumber } = req.body;

    const updateData: Partial<Product> = {};
    if (title !== undefined) updateData.title = title;
    if (price !== undefined) updateData.price = parseFloat(price);
    if (description !== undefined) updateData.description = description;
    if (info !== undefined) updateData.info = info;
    if (whatsappNumber !== undefined)
      updateData.whatsappNumber = whatsappNumber;
    if (req.file)
      updateData.imageSrc = `/uploads/products/${req.file.filename}`;

    const updated = await ProductRepository.update(id, updateData);
    if (!updated) {
      return res.status(400).json({ error: "No changes made" });
    }

    res.json({ message: "Product updated successfully", id, ...updateData });
  } catch (error) {
    console.error("❌ Error updating product:", error);
    res.status(500).json({ error: "Failed to update product" });
  }
});

// DELETE product
router.delete("/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid product ID" });
    }

    const deleted = await ProductRepository.delete(id);
    if (!deleted) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json({ message: "Product deleted successfully" });
  } catch (error) {
    console.error("❌ Error deleting product:", error);
    res.status(500).json({ error: "Failed to delete product" });
  }
});

// GET search products
router.get("/search/:term", async (req, res) => {
  try {
    const { term } = req.params;
    const products = await ProductRepository.search(term);
    console.log(
      `✅ MySQL Search results: ${products.length} products found for "${term}"`
    );
    res.json(products);
  } catch (error) {
    console.error("❌ Error searching products:", error);
    res.status(500).json({ error: "Failed to search products" });
  }
});

// PUT update product rating (Multi-user support)
router.put("/:id/rating", authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid product ID" });
    }

    const { rating } = req.body;

    // Validate rating
    if (rating === undefined || rating === null) {
      return res.status(400).json({ error: "Rating is required" });
    }

    const ratingNumber = parseFloat(rating);
    if (isNaN(ratingNumber)) {
      return res.status(400).json({ error: "Rating must be a number" });
    }

    if (ratingNumber < 0 || ratingNumber > 5) {
      return res.status(400).json({ error: "Rating must be between 0 and 5" });
    }

    // Check if product exists
    const product = await ProductRepository.findById(id);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    const identifier = String(req.user!.id);

    // Upsert rating (insert or update if exists)
    const updated = await ProductRatingRepository.upsertRating(id, identifier, ratingNumber);
    if (!updated) {
      return res.status(400).json({ error: "Failed to update rating" });
    }

    // Get updated statistics
    const stats = await ProductRatingRepository.getAverageRating(id);

    console.log(`✅ Product rating updated: ID ${id}, User: ${identifier.substring(0, 8)}..., Rating: ${ratingNumber}`);
    console.log(`   New average: ${stats.average.toFixed(2)} from ${stats.count} ratings`);
    
    res.json({ 
      success: true,
      message: "Rating submitted successfully", 
      id, 
      userRating: ratingNumber,
      averageRating: stats.average,
      totalRatings: stats.count
    });
  } catch (error) {
    console.error("❌ Error updating product rating:", error);
    res.status(500).json({ error: "Failed to update product rating" });
  }
});

// GET product rating statistics
router.get("/:id/ratings", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid product ID" });
    }

    // Check if product exists
    const product = await ProductRepository.findById(id);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Get all ratings and statistics
    const ratingData = await ProductRatingRepository.getAllRatingsForProduct(id);

    res.json({
      success: true,
      productId: id,
      average: ratingData.average,
      total: ratingData.total,
      distribution: ratingData.distribution,
      ratings: ratingData.ratings.map(r => ({
        rating: r.rating,
        createdAt: r.created_at
      }))
    });
  } catch (error) {
    console.error("❌ Error fetching product ratings:", error);
    res.status(500).json({ error: "Failed to fetch product ratings" });
  }
});

// GET user's rating for a product
router.get("/:id/rating/user/:userIdentifier", authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid product ID" });
    }

    const userRating = await ProductRatingRepository.findByUserAndProduct(id, String(req.user!.id));

    if (!userRating) {
      return res.json({
        success: true,
        hasRated: false,
        rating: null
      });
    }

    res.json({
      success: true,
      hasRated: true,
      rating: userRating.rating,
      createdAt: userRating.created_at,
      updatedAt: userRating.updated_at
    });
  } catch (error) {
    console.error("❌ Error fetching user rating:", error);
    res.status(500).json({ error: "Failed to fetch user rating" });
  }
});

// GET all ratings by a specific user
router.get("/user-ratings/:userId", authenticateToken, async (req, res) => {
  try {
    const userRatings = await ProductRatingRepository.findByUserId(String(req.user!.id));

    res.json({
      success: true,
      total: userRatings.length,
      ratings: userRatings.map(r => ({
        id: r.id,
        productId: r.product_id,
        productTitle: r.product_title,
        productImage: r.product_image,
        productPrice: r.product_price,
        rating: r.rating,
        createdAt: r.created_at,
        updatedAt: r.updated_at
      }))
    });
  } catch (error) {
    console.error("❌ Error fetching user ratings:", error);
    res.status(500).json({ error: "Failed to fetch user ratings" });
  }
});

router.use(uploadErrorHandler);

export default router;
