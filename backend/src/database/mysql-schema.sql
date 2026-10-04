
-- Database creation
CREATE DATABASE IF NOT EXISTS website_tanijuu_mysql;
USE website_tanijuu_mysql;

-- Products Table
CREATE TABLE products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    imageSrc VARCHAR(500),
    description TEXT,
    info TEXT,
    whatsappNumber VARCHAR(20),
    average_rating FLOAT DEFAULT 0,
    total_ratings INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_title (title),
    INDEX idx_price (price),
    INDEX idx_average_rating (average_rating)
);

-- Petani Table  
CREATE TABLE petani (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nama VARCHAR(255) NOT NULL,
    alamat TEXT,
    nomorKontak VARCHAR(20),
    foto VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_nama (nama)
);

-- Posts Table
CREATE TABLE posts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE,
    image VARCHAR(500),
    date DATE,
    category VARCHAR(100),
    author VARCHAR(100),
    authorImage VARCHAR(500),
    content TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_title (title),
    INDEX idx_category (category),
    INDEX idx_author (author),
    INDEX idx_date (date)
);

-- Tags Table (untuk normalisasi tags)
CREATE TABLE tags (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Post_Tags Junction Table (Many-to-Many relationship)
CREATE TABLE post_tags (
    id INT AUTO_INCREMENT PRIMARY KEY,
    post_id INT NOT NULL,
    tag_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_post_tag (post_id, tag_id),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
    INDEX idx_post_id (post_id),
    INDEX idx_tag_id (tag_id)
);

-- Bibit Table
CREATE TABLE bibit (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tanaman VARCHAR(255),
    sumber VARCHAR(255),
    namaPenyedia VARCHAR(255) NOT NULL,
    tanggalPemberian DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_nama_penyedia (namaPenyedia)
);

-- Tanaman Table
CREATE TABLE tanaman (
    id INT AUTO_INCREMENT PRIMARY KEY,
    namaTanaman VARCHAR(255) NOT NULL,
    pupuk VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_nama_tanaman (namaTanaman)
);

-- Panen Table
CREATE TABLE panen (
    id INT AUTO_INCREMENT PRIMARY KEY,
    petani_id INT,
    tanaman_id INT,
    lahan VARCHAR(255),
    bibit_id INT,
    pupuk VARCHAR(255),
    jumlahHasilPanen DECIMAL(10,2),
    tanggalPanen DATE,
    statusPenjualan ENUM('Terjual', 'Belum Terjual') DEFAULT 'Belum Terjual',
    namaPembeli VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (petani_id) REFERENCES petani(id) ON DELETE SET NULL,
    FOREIGN KEY (tanaman_id) REFERENCES tanaman(id) ON DELETE SET NULL,
    FOREIGN KEY (bibit_id) REFERENCES bibit(id) ON DELETE SET NULL,
    INDEX idx_petani_id (petani_id),
    INDEX idx_tanaman_id (tanaman_id),
    INDEX idx_bibit_id (bibit_id),
    INDEX idx_tanggal_panen (tanggalPanen)
);

-- Users Table
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('admin', 'user') DEFAULT 'user',
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'approved',
    is_active BOOLEAN DEFAULT true,
    session_key VARCHAR(255) NULL,
    session_expired_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_email (email),
    INDEX idx_username (username),
    INDEX idx_users_status (status),
    INDEX idx_session_key (session_key)
);

-- Current per-user product rating model.
CREATE TABLE product_ratings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    user_identifier VARCHAR(255) NOT NULL,
    rating FLOAT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_rating_value CHECK (rating >= 0 AND rating <= 5),
    CONSTRAINT fk_product_rating_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_product (product_id, user_identifier),
    INDEX idx_product_id (product_id),
    INDEX idx_user_identifier (user_identifier)
);
