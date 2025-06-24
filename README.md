# Secure File Sharing Web App

A secure file sharing app with expiring, one-time download links and end-to-end encryption.

## Project Structure

- `/client` — React + Tailwind CSS frontend
- `/server` — Node.js + Express backend (with MongoDB GridFS for file storage)

## Setup Instructions

### 1. Backend
```bash
cd server
npm install
# Create a .env file (see .env.example)
node server.js
```

### 2. Frontend
```bash
cd client
npm install
npm start
```

---

## Features
- Client-side encryption (Web Crypto API)
- Expiring, one-time download links
- Optional password protection
- QR code sharing
- No unencrypted files stored on server 