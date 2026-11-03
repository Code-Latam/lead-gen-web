// src/components/Toast.jsx. Yep
import { useEffect, useState } from "react";

let toastSetter = null;

export function useToast() {
  return (message, kind = "info") => {
    if (toastSetter) toastSetter({ message, kind, id: Date.now() });
  };
}

export function ToastHost() {
  const [toast, setToast] = useState(null);

  useEffect(() => {
    toastSetter = setToast;
    return () => {
      toastSetter = null;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;

  const colors = {
    info: "bg-gray-900 text-white",
    success: "bg-green-700 text-white",
    error: "bg-red-700 text-white",
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <div
        className={`${colors[toast.kind] || colors.info} px-4 py-2 rounded shadow-lg text-sm`}
      >
        {toast.message}
      </div>
    </div>
  );
}