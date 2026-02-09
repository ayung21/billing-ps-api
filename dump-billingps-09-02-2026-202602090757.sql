-- MySQL dump 10.13  Distrib 8.0.44, for Linux (x86_64)
--
-- Host: localhost    Database: billingps
-- ------------------------------------------------------
-- Server version	8.0.44-0ubuntu0.24.04.2

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `access`
--

DROP TABLE IF EXISTS `access`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `access` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userid` int NOT NULL,
  `cabangid` int DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `access`
--

LOCK TABLES `access` WRITE;
/*!40000 ALTER TABLE `access` DISABLE KEYS */;
INSERT INTO `access` VALUES (1,1,1);
/*!40000 ALTER TABLE `access` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `billingsave`
--

DROP TABLE IF EXISTS `billingsave`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `billingsave` (
  `id` int NOT NULL AUTO_INCREMENT,
  `memberid` int DEFAULT NULL,
  `unitid` int DEFAULT NULL,
  `hours` int DEFAULT NULL,
  `status` int DEFAULT NULL COMMENT '0. non-active\n1. active',
  `createdAt` datetime NOT NULL,
  `created_by` int DEFAULT NULL,
  `updatedAt` datetime NOT NULL,
  `updated_by` int DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `billingsave`
--

LOCK TABLES `billingsave` WRITE;
/*!40000 ALTER TABLE `billingsave` DISABLE KEYS */;
/*!40000 ALTER TABLE `billingsave` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `brandtv`
--

DROP TABLE IF EXISTS `brandtv`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `brandtv` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(25) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `codetvid` int DEFAULT NULL,
  `cabangid` int DEFAULT NULL,
  `tv_id` text COLLATE utf8mb4_general_ci,
  `ip_address` varchar(15) COLLATE utf8mb4_general_ci DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `brandtv`
--

LOCK TABLES `brandtv` WRITE;
/*!40000 ALTER TABLE `brandtv` DISABLE KEYS */;
/*!40000 ALTER TABLE `brandtv` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `cabang`
--

DROP TABLE IF EXISTS `cabang`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cabang` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `status` int DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cabang`
--

LOCK TABLES `cabang` WRITE;
/*!40000 ALTER TABLE `cabang` DISABLE KEYS */;
INSERT INTO `cabang` VALUES (1,'ps5 sbya barat',1),(2,'ps5 sbya barat 2',1);
/*!40000 ALTER TABLE `cabang` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `codetv`
--

DROP TABLE IF EXISTS `codetv`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `codetv` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(10) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `code` int DEFAULT NULL,
  `desc` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `command` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `codetv`
--

LOCK TABLES `codetv` WRITE;
/*!40000 ALTER TABLE `codetv` DISABLE KEYS */;
/*!40000 ALTER TABLE `codetv` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `history_produk`
--

DROP TABLE IF EXISTS `history_produk`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `history_produk` (
  `id` int NOT NULL AUTO_INCREMENT,
  `token` text COLLATE utf8mb4_general_ci,
  `produkid` int DEFAULT NULL,
  `type` int DEFAULT NULL,
  `name` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `stok` int DEFAULT NULL,
  `harga_beli` int DEFAULT NULL,
  `harga_jual` int DEFAULT NULL,
  `cabangid` int DEFAULT NULL,
  `status` int DEFAULT NULL,
  `desc` varchar(15) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `createdAt` datetime NOT NULL,
  `created_by` int DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `history_produk`
--

LOCK TABLES `history_produk` WRITE;
/*!40000 ALTER TABLE `history_produk` DISABLE KEYS */;
INSERT INTO `history_produk` VALUES (1,NULL,NULL,1,'mie goreng',12,1000,4000,NULL,NULL,NULL,'2025-09-19 08:46:30',1),(2,NULL,NULL,1,'mie goreng indomie',12,1000,4000,NULL,NULL,NULL,'2025-09-19 08:47:06',1),(3,NULL,NULL,1,'mie goreng indomie',5,1000,4000,NULL,NULL,NULL,'2025-09-19 08:47:43',1),(4,NULL,1,1,'mie goreng indomie',5,1000,4000,NULL,NULL,NULL,'2025-09-19 08:48:12',1);
/*!40000 ALTER TABLE `history_produk` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `history_promo`
--

DROP TABLE IF EXISTS `history_promo`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `history_promo` (
  `id` int NOT NULL AUTO_INCREMENT,
  `token` text COLLATE utf8mb4_general_ci,
  `promoid` int DEFAULT NULL,
  `name` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `unitid` int DEFAULT NULL,
  `cabangid` int DEFAULT NULL,
  `discount_percent` int DEFAULT NULL,
  `discount_nominal` int DEFAULT NULL,
  `hours` int DEFAULT NULL,
  `status` int DEFAULT NULL,
  `desc` varchar(15) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `createdAt` datetime NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `history_promo`
--

LOCK TABLES `history_promo` WRITE;
/*!40000 ALTER TABLE `history_promo` DISABLE KEYS */;
/*!40000 ALTER TABLE `history_promo` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `history_units`
--

DROP TABLE IF EXISTS `history_units`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `history_units` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `brandtvid` int DEFAULT NULL,
  `cabangid` int DEFAULT NULL,
  `unitid` int DEFAULT NULL,
  `status` int DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `createdAt` datetime NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `history_units`
--

LOCK TABLES `history_units` WRITE;
/*!40000 ALTER TABLE `history_units` DISABLE KEYS */;
INSERT INTO `history_units` VALUES (1,NULL,NULL,NULL,1,1,1,'2025-09-18 13:57:55'),(2,'ps 5 nomer 4',NULL,1,1,1,1,'2025-09-18 14:00:27');
/*!40000 ALTER TABLE `history_units` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `member`
--

DROP TABLE IF EXISTS `member`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `member` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `telpon` varchar(15) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `status` int DEFAULT NULL COMMENT '0. non-active\n1. active',
  `createdAt` datetime NOT NULL,
  `created_by` int DEFAULT NULL,
  `updatedAt` datetime NOT NULL,
  `updated_by` int DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `member`
--

LOCK TABLES `member` WRITE;
/*!40000 ALTER TABLE `member` DISABLE KEYS */;
INSERT INTO `member` VALUES (1,'mie goreng',NULL,0,'2025-09-19 08:11:11',1,'2025-09-19 08:33:30',1),(2,'ayung','08225765151',1,'2025-09-19 08:24:39',1,'2025-09-19 08:30:02',1),(3,'adi',NULL,1,'2025-09-19 08:26:14',1,'2025-09-19 08:26:14',1),(4,'adi santoso','0822576515fgdfg',1,'2025-09-19 08:26:32',1,'2025-09-19 08:26:32',1);
/*!40000 ALTER TABLE `member` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `produk`
--

DROP TABLE IF EXISTS `produk`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `produk` (
  `id` int NOT NULL AUTO_INCREMENT,
  `token` text COLLATE utf8mb4_general_ci,
  `type` int NOT NULL COMMENT '1. makanan\n2. minuman',
  `stok` int NOT NULL,
  `warning_level` int DEFAULT '5',
  `name` varchar(50) COLLATE utf8mb4_general_ci NOT NULL,
  `harga_beli` int DEFAULT NULL,
  `harga_jual` int DEFAULT NULL,
  `cabang` int DEFAULT NULL,
  `status` int DEFAULT NULL COMMENT '1. active\n2. non-active',
  `createdAt` datetime NOT NULL,
  `created_by` int DEFAULT NULL,
  `updatedAt` datetime NOT NULL,
  `updated_by` int DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `produk`
--

LOCK TABLES `produk` WRITE;
/*!40000 ALTER TABLE `produk` DISABLE KEYS */;
INSERT INTO `produk` VALUES (1,NULL,1,5,5,'mie goreng indomie',1000,4000,1,1,'2025-09-18 16:26:09',1,'2025-09-19 08:47:43',1);
/*!40000 ALTER TABLE `produk` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `promo`
--

DROP TABLE IF EXISTS `promo`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `promo` (
  `id` int NOT NULL AUTO_INCREMENT,
  `token` text COLLATE utf8mb4_general_ci,
  `name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `unitid` int DEFAULT NULL,
  `cabangid` int DEFAULT NULL,
  `discount_percent` int DEFAULT NULL,
  `discount_nominal` int DEFAULT NULL,
  `hours` int DEFAULT NULL,
  `status` int DEFAULT NULL COMMENT '0. non-active\n1. active',
  `createdAt` datetime NOT NULL,
  `created_by` int DEFAULT NULL,
  `updatedAt` datetime NOT NULL,
  `updated_by` int DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `promo`
--

LOCK TABLES `promo` WRITE;
/*!40000 ALTER TABLE `promo` DISABLE KEYS */;
INSERT INTO `promo` VALUES (1,NULL,'weekend',2,NULL,10,NULL,3,1,'2025-09-18 15:20:15',1,'2025-09-18 15:21:17',1);
/*!40000 ALTER TABLE `promo` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `role`
--

DROP TABLE IF EXISTS `role`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `role` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userid` int DEFAULT NULL,
  `role` int DEFAULT NULL,
  `status` int DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `role`
--

LOCK TABLES `role` WRITE;
/*!40000 ALTER TABLE `role` DISABLE KEYS */;
INSERT INTO `role` VALUES (1,1,1,1),(2,1,2,1),(3,1,3,1),(4,1,4,1),(5,1,5,1),(6,1,6,1),(7,1,7,1),(8,1,8,1),(9,1,9,1),(10,1,10,1),(11,1,11,1),(12,1,12,1),(13,1,13,1),(14,1,14,1),(15,1,15,1),(16,1,16,1);
/*!40000 ALTER TABLE `role` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `transaksi`
--

DROP TABLE IF EXISTS `transaksi`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `transaksi` (
  `code` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `memberid` int DEFAULT NULL,
  `customer` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `telepon` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `cabangid` int DEFAULT NULL,
  `grandtotal` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `status` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '0. selesai\n1. main',
  `createdAt` datetime NOT NULL,
  `created_by` int DEFAULT NULL,
  `updatedAt` datetime NOT NULL,
  `updated_by` int DEFAULT NULL,
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `transaksi`
--

LOCK TABLES `transaksi` WRITE;
/*!40000 ALTER TABLE `transaksi` DISABLE KEYS */;
/*!40000 ALTER TABLE `transaksi` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `transaksi_detail`
--

DROP TABLE IF EXISTS `transaksi_detail`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `transaksi_detail` (
  `id` int NOT NULL AUTO_INCREMENT,
  `type` int DEFAULT NULL,
  `code` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `name` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `promo_token` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `produk_token` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `unit_token` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `hours` int DEFAULT NULL,
  `qty` int DEFAULT NULL,
  `harga` int DEFAULT NULL,
  `status` int DEFAULT NULL COMMENT '0. non-active\n1. active',
  `createdAt` datetime NOT NULL,
  `created_by` int DEFAULT NULL,
  `updatedAt` datetime NOT NULL,
  `updated_by` int DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `transaksi_detail`
--

LOCK TABLES `transaksi_detail` WRITE;
/*!40000 ALTER TABLE `transaksi_detail` DISABLE KEYS */;
/*!40000 ALTER TABLE `transaksi_detail` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `units`
--

DROP TABLE IF EXISTS `units`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `units` (
  `id` int NOT NULL AUTO_INCREMENT,
  `token` text COLLATE utf8mb4_general_ci,
  `name` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `brandtvid` int DEFAULT NULL,
  `cabangid` int DEFAULT NULL,
  `price` int DEFAULT NULL,
  `description` varchar(200) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `status` int NOT NULL DEFAULT '1' COMMENT '0. non-active\n1. active\n2. maintenance',
  `createdAt` datetime NOT NULL,
  `created_by` int DEFAULT NULL,
  `updatedAt` datetime NOT NULL,
  `updated_by` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `brandtvid` (`brandtvid`) USING BTREE,
  KEY `cabangid` (`cabangid`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `units`
--

LOCK TABLES `units` WRITE;
/*!40000 ALTER TABLE `units` DISABLE KEYS */;
INSERT INTO `units` VALUES (1,NULL,'ps 5 nomer 4',NULL,1,NULL,NULL,0,'2025-09-18 13:34:36',1,'2025-09-18 14:30:19',1),(2,NULL,'ps 5 nomer 3',NULL,1,NULL,NULL,1,'2025-09-18 14:30:00',1,'2025-09-18 14:30:00',1);
/*!40000 ALTER TABLE `units` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `email` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `username` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `password` varchar(200) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `status` int DEFAULT NULL COMMENT '0. non - active\n1. active',
  `active_period` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'ayungyung20@gmail.com','ayung','$2b$10$h6aLvPYVVJNsLw3t10dqDOnlSnQnBza2MTcysm/ttXVgePObsc.cu',1,'2026-02-08 14:30:24');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping routines for database 'billingps'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-02-09  7:57:00
