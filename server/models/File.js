const mongoose = require('mongoose');

const FileSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  encryptedFileId: { type: mongoose.Schema.Types.ObjectId, required: true }, // GridFS file id
  expiresAt: { type: Date, required: true },
  maxDownloads: { type: Number, required: true },
  downloadCount: { type: Number, default: 0 },
  passwordHash: { type: String }, // optional
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('File', FileSchema); 