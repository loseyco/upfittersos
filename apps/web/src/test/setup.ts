/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, prefer-const, @typescript-eslint/no-require-imports */
import '@testing-library/jest-dom'
import React from 'react'
import { vi } from 'vitest'


// 1. Mock firebase/app and firebase/firestore
vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(),
}))

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({
    currentUser: null,
    onAuthStateChanged: vi.fn(() => () => {}),
  })),
}))
vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(() => ({})),
}))
vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(() => ({})),
}))
vi.mock('firebase/analytics', () => ({
  getAnalytics: vi.fn(() => ({})),
  isSupported: vi.fn(() => Promise.resolve(false)),
}))
vi.mock('firebase/messaging', () => ({
  getMessaging: vi.fn(() => ({})),
  isSupported: vi.fn(() => Promise.resolve(false)),
}))


const listeners: Record<string, any> = {}
let mockStoreState = {
  tenantId: 'test-tenant',
  permissions: { 'tasks.manage': true } as Record<string, boolean>,
  isSuperAdmin: false,
  loading: false,
}

globalThis.__firestoreListeners = listeners
globalThis.__emitSnapshot = (path: string, data: any[]) => {
  const callback = listeners[path]
  if (callback) {
    const docs = data.map(item => ({
      id: item.id,
      data: () => item
    }))
    callback({
      docs,
      size: docs.length,
      forEach: (cb: any) => docs.forEach(cb)
    })
  }
}

globalThis.__setMockAuth = (permissions: Record<string, boolean>, isSuperAdmin = false) => {
  mockStoreState.permissions = permissions
  mockStoreState.isSuperAdmin = isSuperAdmin
}

vi.mock('firebase/firestore', () => {
  return {
    getFirestore: vi.fn(() => ({})),
    collection: vi.fn((db, path) => ({ type: 'collection', path })),
    query: vi.fn((colRef, ...constraints) => ({ type: 'query', colRef, constraints })),
    where: vi.fn((field, op, val) => ({ type: 'where', field, op, val })),
    limit: vi.fn((n) => ({ type: 'limit', n })),
    orderBy: vi.fn((field, dir) => ({ type: 'orderBy', field, dir })),
    doc: vi.fn((db, path, id) => ({ type: 'doc', path: id ? `${path}/${id}` : path })),
    updateDoc: vi.fn(() => Promise.resolve()),
    serverTimestamp: vi.fn(() => 'mock-timestamp'),
    onSnapshot: vi.fn((queryOrCol, callback, errorCallback) => {
      const path = queryOrCol.path || (queryOrCol.colRef && queryOrCol.colRef.path);
      if (path) {
        listeners[path] = callback
      }
      return () => {
        if (path) {
          delete listeners[path]
        }
      }
    }),
  }
})

// Mock firebase config
vi.mock('../lib/firebase/config', () => ({
  db: {},
}))
vi.mock('../../lib/firebase/config', () => ({
  db: {},
}))

// Mock auth store
vi.mock('../lib/auth/store', () => {
  return {
    useAuthStore: () => mockStoreState
  }
})
vi.mock('../../lib/auth/store', () => {
  return {
    useAuthStore: () => mockStoreState
  }
})

vi.mock('lucide-react', () => {
  const React = require('react');
  const IconMock = (name: string) => {
    const Component = (props: any) => React.createElement('span', { ...props }, name);
    Component.displayName = name;
    return Component;
  };
  
  const icons = [
    'Users', 'Clock', 'Play', 'Pause', 'CheckCircle2', 'Circle', 'AlertTriangle',
    'Monitor', 'Maximize', 'Minimize', 'Search', 'RefreshCw', 'CheckSquare',
    'Building2', 'ShieldCheck', 'Truck', 'Plus', 'ExternalLink', 'Box', 'User',
    'Package', 'Calendar', 'AlertCircle', 'Trash2', 'CheckCircle', 'ShoppingCart',
    'Hash', 'FileText', 'MapPin', 'Briefcase', 'CarFront', 'ImagePlus', 'ImageIcon',
    'Maximize2', 'Camera', 'Edit3', 'Save', 'Loader2', 'X', 'ChevronDown', 'ChevronUp', 'Settings', 'ChevronRight', 'ChevronLeft', 'Layout', 'Printer', 'QrCode'
  ];

  const mockExports: Record<string, any> = {};
  icons.forEach(icon => {
    mockExports[icon] = IconMock(icon + 'Icon');
  });

  return mockExports;
})

// 3. Mock framer-motion to bypass animations in JSDOM/Happy-dom
vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef(({ children, ...props }: any, ref: any) => {
      const { whileHover, whileTap, transition, animate, initial, exit, ...rest } = props
      return React.createElement('div', { ...rest, ref }, children)
    }),
    section: React.forwardRef(({ children, ...props }: any, ref: any) => {
      const { whileHover, whileTap, transition, animate, initial, exit, ...rest } = props
      return React.createElement('section', { ...rest, ref }, children)
    }),
  },
  AnimatePresence: ({ children }: any) => children,
}))

// Mock window.requestAnimationFrame
if (!globalThis.requestAnimationFrame) {
  globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0)
}

// 4. Mock @zxing/library globally
vi.mock('@zxing/library', () => {
  class MockBrowserMultiFormatReader {
    listVideoInputDevices() {
      return Promise.resolve([{ deviceId: 'camera-1', label: 'Back Camera' }]);
    }
    decodeFromVideoDevice() {
      return Promise.resolve({
        stop: vi.fn(),
      });
    }
    decodeFromImageUrl() {
      return Promise.resolve({
        getText: () => '1Z12345E0205271688'
      });
    }
    reset() {}
  }

  return {
    BrowserMultiFormatReader: MockBrowserMultiFormatReader,
    BarcodeFormat: {
      CODE_39: 'CODE_39',
      CODE_128: 'CODE_128',
      QR_CODE: 'QR_CODE',
      DATA_MATRIX: 'DATA_MATRIX',
      EAN_13: 'EAN_13',
      UPC_A: 'UPC_A'
    },
    DecodeHintType: {
      POSSIBLE_FORMATS: 'POSSIBLE_FORMATS',
      TRY_HARDER: 'TRY_HARDER'
    },
    Result: class MockResult {
      constructor(private text: string) {}
      getText() {
        return this.text;
      }
    }
  };
});

// 5. Mock @zxing/browser globally
vi.mock('@zxing/browser', () => {
  class MockBrowserCodeReader {
    static listVideoInputDevices() {
      return Promise.resolve([{ deviceId: 'camera-1', label: 'Back Camera' }]);
    }
    listVideoInputDevices() {
      return Promise.resolve([{ deviceId: 'camera-1', label: 'Back Camera' }]);
    }
  }

  class MockBrowserMultiFormatReader extends MockBrowserCodeReader {
    decodeFromConstraints() {
      return Promise.resolve({
        stop: vi.fn(),
      });
    }
    decodeFromVideoDevice() {
      return Promise.resolve({
        stop: vi.fn(),
      });
    }
    decodeFromImageUrl() {
      return Promise.resolve({
        getText: () => '1Z12345E0205271688'
      });
    }
    reset() {}
  }

  return {
    BrowserCodeReader: MockBrowserCodeReader,
    BrowserMultiFormatReader: MockBrowserMultiFormatReader,
  };
});
