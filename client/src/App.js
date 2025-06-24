import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useParams } from 'react-router-dom';
import QRCode from 'qrcode.react';

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function encryptFile(file, password) {
  const keyMaterial = await window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  const rawKey = await window.crypto.subtle.exportKey('raw', keyMaterial);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const fileBuffer = await file.arrayBuffer();
  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    keyMaterial,
    fileBuffer
  );
  return {
    encrypted,
    key: arrayBufferToBase64(rawKey),
    iv: arrayBufferToBase64(iv),
  };
}

async function decryptFile(encrypted, keyB64, ivB64) {
  const key = await window.crypto.subtle.importKey(
    'raw',
    base64ToArrayBuffer(keyB64),
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  const iv = base64ToArrayBuffer(ivB64);
  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted
  );
  return new Blob([decrypted]);
}

function UploadPage() {
  const [file, setFile] = useState();
  const [expires, setExpires] = useState(15); // minutes
  const [maxDownloads, setMaxDownloads] = useState(1);
  const [password, setPassword] = useState('');
  const [link, setLink] = useState('');
  const [qr, setQr] = useState('');
  const [loading, setLoading] = useState(false);

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    const { encrypted, key, iv } = await encryptFile(file, password);
    const formData = new FormData();
    formData.append('file', new Blob([encrypted]));
    formData.append('expiresAt', new Date(Date.now() + expires * 60 * 1000).toISOString());
    formData.append('maxDownloads', maxDownloads);
    if (password) {
      const hash = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
      formData.append('passwordHash', arrayBufferToBase64(hash));
    }
    const res = await fetch('/api/file/upload', {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    if (data.id) {
      const url = `${window.location.origin}/download/${data.id}#${key}:${iv}`;
      setLink(url);
      setQr(url);
    }
    setLoading(false);
  };

  return (
    <div className="max-w-lg mx-auto mt-10 p-6 bg-white rounded shadow">
      <h2 className="text-2xl font-bold mb-4">Secure File Upload</h2>
      <input type="file" onChange={e => setFile(e.target.files[0])} className="mb-2" />
      <input type="number" min="1" value={expires} onChange={e => setExpires(e.target.value)} className="mb-2 block w-full" placeholder="Expiry (minutes)" />
      <input type="number" min="1" value={maxDownloads} onChange={e => setMaxDownloads(e.target.value)} className="mb-2 block w-full" placeholder="Max Downloads" />
      <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="mb-2 block w-full" placeholder="Password (optional)" />
      <button onClick={handleUpload} disabled={loading} className="bg-blue-600 text-white px-4 py-2 rounded">{loading ? 'Uploading...' : 'Upload & Generate Link'}</button>
      {link && (
        <div className="mt-4">
          <div className="mb-2">Share this link:</div>
          <input type="text" value={link} readOnly className="w-full mb-2" />
          <QRCode value={qr} size={128} />
        </div>
      )}
    </div>
  );
}

function DownloadPage() {
  const { id } = useParams();
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const [filename, setFilename] = useState('file');
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    setStatus('');
    const hash = password
      ? arrayBufferToBase64(await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(password)))
      : undefined;
    const [key, iv] = window.location.hash.slice(1).split(':');
    let url = `/api/file/download/${id}`;
    if (hash) url += `?passwordHash=${encodeURIComponent(hash)}`;
    const res = await fetch(url);
    if (!res.ok) {
      setStatus('Download failed: ' + (await res.json()).error);
      setDownloading(false);
      return;
    }
    const blob = await res.blob();
    const decrypted = await decryptFile(await blob.arrayBuffer(), key, iv);
    // Try to get filename from content-disposition
    const disposition = res.headers.get('Content-Disposition');
    let fname = 'file';
    if (disposition) {
      const match = disposition.match(/filename="(.+)"/);
      if (match) fname = match[1];
    }
    setFilename(fname);
    const urlObj = window.URL.createObjectURL(decrypted);
    const a = document.createElement('a');
    a.href = urlObj;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setStatus('Download complete!');
    setDownloading(false);
  };

  return (
    <div className="max-w-lg mx-auto mt-10 p-6 bg-white rounded shadow">
      <h2 className="text-2xl font-bold mb-4">Download Secure File</h2>
      <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="mb-2 block w-full" placeholder="Password (if required)" />
      <button onClick={handleDownload} disabled={downloading} className="bg-green-600 text-white px-4 py-2 rounded">{downloading ? 'Downloading...' : 'Download & Decrypt'}</button>
      {status && <div className="mt-2 text-red-600">{status}</div>}
    </div>
  );
}

function App() {
  return (
    <Router>
      <nav className="bg-gray-800 p-4 text-white flex gap-4">
        <Link to="/">Upload</Link>
        <Link to="/download/testid">Download (Demo)</Link>
      </nav>
      <Routes>
        <Route path="/" element={<UploadPage />} />
        <Route path="/download/:id" element={<DownloadPage />} />
      </Routes>
    </Router>
  );
}

export default App; 