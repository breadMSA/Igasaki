import { useState, useEffect } from 'react';
import { X, CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react';
import { ToastMessage } from '@/types';

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // 移除 toast
  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  // 添加 toast 的方法（將來會通過 context 或狀態管理提供）
  const addToast = (toast: Omit<ToastMessage, 'id'>) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newToast: ToastMessage = {
      ...toast,
      id,
      duration: toast.duration || 5000
    };

    setToasts(prev => [...prev, newToast]);

    // 自動移除
    setTimeout(() => {
      removeToast(id);
    }, newToast.duration);
  };

  // 測試用途（開發環境）
  useEffect(() => {
    if (import.meta.env.DEV) {
      // 可以在 window 上暴露添加 toast 的方法用於測試
      (window as any).addToast = addToast;
    }
  }, []);

  const getIcon = (type: ToastMessage['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'info':
        return <Info className="w-5 h-5 text-blue-500" />;
      default:
        return <Info className="w-5 h-5 text-gray-500" />;
    }
  };

  const getBorderColor = (type: ToastMessage['type']) => {
    switch (type) {
      case 'success':
        return 'border-l-green-500';
      case 'error':
        return 'border-l-red-500';
      case 'warning':
        return 'border-l-yellow-500';
      case 'info':
        return 'border-l-blue-500';
      default:
        return 'border-l-gray-500';
    }
  };

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-60 space-y-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`max-w-sm bg-white rounded-lg shadow-lg border-l-4 ${getBorderColor(toast.type)} p-4 animate-slide-down`}
        >
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              {getIcon(toast.type)}
            </div>
            
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-medium text-gray-900">
                {toast.title}
              </h4>
              {toast.message && (
                <p className="mt-1 text-sm text-gray-600">
                  {toast.message}
                </p>
              )}
              {toast.action && (
                <button
                  onClick={toast.action.onClick}
                  className="mt-2 text-sm font-medium text-primary-600 hover:text-primary-700"
                >
                  {toast.action.label}
                </button>
              )}
            </div>
            
            <button
              onClick={() => removeToast(toast.id)}
              className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors duration-150"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
