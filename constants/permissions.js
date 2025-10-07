/**
 * Permission constants untuk konsistensi antara frontend dan backend
 * Pastikan nilai ini sama dengan yang ada di Flutter (permissions.dart)
 */

const PERMISSIONS = {
  // Master Menu Permissions
  VIEW_UNIT_RENTAL: 1,
  VIEW_PROMO: 2,
  VIEW_PRODUCT: 3,
  
  // Report Menu Permissions
  VIEW_REPORT_PRODUCT: 4,
  VIEW_REPORT_PS: 5,
  
  // Other Permissions
  VIEW_HISTORY: 6,
  VIEW_SETTINGS: 7,
  
  // Additional CRUD Permissions (optional)
  CREATE_UNIT_RENTAL: 8,
  EDIT_UNIT_RENTAL: 9,
  DELETE_UNIT_RENTAL: 10,
  
  CREATE_PROMO: 11,
  EDIT_PROMO: 12,
  DELETE_PROMO: 13,
  
  CREATE_PRODUCT: 14,
  EDIT_PRODUCT: 15,
  DELETE_PRODUCT: 16,
};

// Permission Groups untuk kemudahan
const PERMISSION_GROUPS = {
  MASTER_MENU: [
    PERMISSIONS.VIEW_UNIT_RENTAL,
    PERMISSIONS.VIEW_PROMO,
    PERMISSIONS.VIEW_PRODUCT,
  ],
  
  REPORT_MENU: [
    PERMISSIONS.VIEW_REPORT_PRODUCT,
    PERMISSIONS.VIEW_REPORT_PS,
  ],
  
  UNIT_RENTAL_FULL: [
    PERMISSIONS.VIEW_UNIT_RENTAL,
    PERMISSIONS.CREATE_UNIT_RENTAL,
    PERMISSIONS.EDIT_UNIT_RENTAL,
    PERMISSIONS.DELETE_UNIT_RENTAL,
  ],
  
  PROMO_FULL: [
    PERMISSIONS.VIEW_PROMO,
    PERMISSIONS.CREATE_PROMO,
    PERMISSIONS.EDIT_PROMO,
    PERMISSIONS.DELETE_PROMO,
  ],
  
  PRODUCT_FULL: [
    PERMISSIONS.VIEW_PRODUCT,
    PERMISSIONS.CREATE_PRODUCT,
    PERMISSIONS.EDIT_PRODUCT,
    PERMISSIONS.DELETE_PRODUCT,
  ],
};

// Permission Names untuk logging/debugging
const PERMISSION_NAMES = {
  [PERMISSIONS.VIEW_UNIT_RENTAL]: 'View Unit Rental',
  [PERMISSIONS.VIEW_PROMO]: 'View Promo',
  [PERMISSIONS.VIEW_PRODUCT]: 'View Product',
  [PERMISSIONS.VIEW_REPORT_PRODUCT]: 'View Report Product',
  [PERMISSIONS.VIEW_REPORT_PS]: 'View Report PS',
  [PERMISSIONS.VIEW_HISTORY]: 'View History',
  [PERMISSIONS.VIEW_SETTINGS]: 'View Settings',
  [PERMISSIONS.CREATE_UNIT_RENTAL]: 'Create Unit Rental',
  [PERMISSIONS.EDIT_UNIT_RENTAL]: 'Edit Unit Rental',
  [PERMISSIONS.DELETE_UNIT_RENTAL]: 'Delete Unit Rental',
  [PERMISSIONS.CREATE_PROMO]: 'Create Promo',
  [PERMISSIONS.EDIT_PROMO]: 'Edit Promo',
  [PERMISSIONS.DELETE_PROMO]: 'Delete Promo',
  [PERMISSIONS.CREATE_PRODUCT]: 'Create Product',
  [PERMISSIONS.EDIT_PRODUCT]: 'Edit Product',
  [PERMISSIONS.DELETE_PRODUCT]: 'Delete Product',
};

// Helper function untuk get permission name
const getPermissionName = (permissionId) => {
  return PERMISSION_NAMES[permissionId] || 'Unknown Permission';
};

// Helper function untuk validate permission ID
const isValidPermission = (permissionId) => {
  return Object.values(PERMISSIONS).includes(permissionId);
};

module.exports = {
  PERMISSIONS,
  PERMISSION_GROUPS,
  PERMISSION_NAMES,
  getPermissionName,
  isValidPermission,
};