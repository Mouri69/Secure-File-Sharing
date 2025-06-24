const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const { GridFsStorage } = require('multer-gridfs-storage');
const crypto = require('crypto');
const File = require('../models/File');

const router = express.Router();

// Mongo URI
const mongoURI = process.env.MONGODB_URI;

// Create storage engine
const storage = new GridFsStorage({
  url: mongoURI,
  file: (req, file) => {
    return {
      filename: file.originalname,
      bucketName: 'uploads',
    };
  },
});
const upload = multer({ storage });

// Upload route
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const { expiresAt, maxDownloads, passwordHash } = req.body;
    const fileDoc = new File({
      filename: req.file.filename,
      encryptedFileId: req.file.id,
      expiresAt: new Date(expiresAt),
      maxDownloads: parseInt(maxDownloads, 10),
      passwordHash: passwordHash || undefined,
    });
    await fileDoc.save();
    res.json({ id: fileDoc._id });
  } catch (err) {
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Download route
router.get('/download/:id', async (req, res) => {
  try {
    const fileDoc = await File.findById(req.params.id);
    if (!fileDoc) return res.status(404).json({ error: 'File not found' });

    // Check expiry
    if (new Date() > fileDoc.expiresAt) return res.status(410).json({ error: 'Link expired' });
    // Check download count
    if (fileDoc.downloadCount >= fileDoc.maxDownloads) return res.status(410).json({ error: 'Max downloads reached' });

    // Password check (if set)
    if (fileDoc.passwordHash) {
      const { passwordHash } = req.query;
      if (!passwordHash || passwordHash !== fileDoc.passwordHash) {
        return res.status(401).json({ error: 'Password required or incorrect' });
      }
    }

    // Stream file from GridFS
    const conn = mongoose.connection;
    const bucket = new mongoose.mongo.GridFSBucket(conn.db, { bucketName: 'uploads' });
    const downloadStream = bucket.openDownloadStream(fileDoc.encryptedFileId);
    res.set('Content-Disposition', `attachment; filename=\"${fileDoc.filename}\"`);
    downloadStream.pipe(res);

    // Increment download count
    fileDoc.downloadCount += 1;
    await fileDoc.save();

    // Optionally, delete file if max downloads reached
    if (fileDoc.downloadCount >= fileDoc.maxDownloads) {
      await bucket.delete(fileDoc.encryptedFileId);
      await File.deleteOne({ _id: fileDoc._id });
    }
  } catch (err) {
    res.status(500).json({ error: 'Download failed' });
  }
});

module.exports = router; 