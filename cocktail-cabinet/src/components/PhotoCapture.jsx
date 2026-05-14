import { useRef, useState } from "react";

export default function PhotoCapture({ onCapture }) {
  const fileRef = useRef();
  const [preview, setPreview] = useState(null);

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      setPreview(dataUrl);
      const [header, data] = dataUrl.split(",");
      const mimeType = header.match(/:(.*?);/)?.[1] || "image/jpeg";
      onCapture(data, mimeType);
    };
    reader.readAsDataURL(file);
  }

  function openCamera() {
    fileRef.current.setAttribute("capture", "environment");
    fileRef.current.accept = "image/*";
    fileRef.current.click();
  }

  function openGallery() {
    fileRef.current.removeAttribute("capture");
    fileRef.current.accept = "image/*";
    fileRef.current.click();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {preview && (
        <img
          src={preview}
          alt="bottle preview"
          style={{ width: "100%", maxHeight: 180, objectFit: "contain", borderRadius: "var(--radius)", background: "var(--bg-surface)" }}
        />
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn--ghost" onClick={openCamera}>📷 Camera</button>
        <button className="btn btn--ghost" onClick={openGallery}>🖼 Upload Photo</button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />
    </div>
  );
}
