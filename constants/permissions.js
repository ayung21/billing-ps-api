/**
 * Permission constants untuk konsistensi antara frontend dan backend
 * Pastikan nilai ini sama dengan yang ada di Flutter (permissions.dart)
 */

const PERMISSIONS = {
  // Unit Rental Permissions
  VIEW_UNIT_RENTAL: 1,
  CREATE_UNIT_RENTAL: 2,
  EDIT_UNIT_RENTAL: 3,
  DELETE_UNIT_RENTAL: 4,
  
  // Promo Permissions
  VIEW_PROMO: 5,
  CREATE_PROMO: 6,
  EDIT_PROMO: 7,
  DELETE_PROMO: 8,
  
  // Product Permissions
  VIEW_PRODUCT: 9,
  CREATE_PRODUCT: 10,
  EDIT_PRODUCT: 11,
  DELETE_PRODUCT: 12,
  
  // Member Permissions
  VIEW_MEMBER: 13,
  CREATE_MEMBER: 14,
  EDIT_MEMBER: 15,
  DELETE_MEMBER: 16,
  
  // Report Permissions
  VIEW_REPORT_PRODUCT: 17,
  VIEW_REPORT_PS: 18,
  
  // Other Permissions
  VIEW_HISTORY: 19,
  VIEW_SETTINGS: 20,
};

// Permission Groups untuk kemudahan (sesuai dengan Flutter)
const PERMISSION_GROUPS = {
  MASTER_MENU: [
    PERMISSIONS.VIEW_UNIT_RENTAL,
    PERMISSIONS.VIEW_PROMO,
    PERMISSIONS.VIEW_PRODUCT,
    PERMISSIONS.VIEW_MEMBER,
  ],
  
  REPORT_MENU: [
    PERMISSIONS.VIEW_REPORT_PRODUCT,
    PERMISSIONS.VIEW_REPORT_PS,
  ],
  
  // Full CRUD Groups
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
  
  MEMBER_FULL: [
    PERMISSIONS.VIEW_MEMBER,
    PERMISSIONS.CREATE_MEMBER,
    PERMISSIONS.EDIT_MEMBER,
    PERMISSIONS.DELETE_MEMBER,
  ],
};

// Permission Names untuk logging/debugging
const PERMISSION_NAMES = {
  // Unit Rental
  [PERMISSIONS.VIEW_UNIT_RENTAL]: 'View Unit Rental',
  [PERMISSIONS.CREATE_UNIT_RENTAL]: 'Create Unit Rental',
  [PERMISSIONS.EDIT_UNIT_RENTAL]: 'Edit Unit Rental',
  [PERMISSIONS.DELETE_UNIT_RENTAL]: 'Delete Unit Rental',
  
  // Promo
  [PERMISSIONS.VIEW_PROMO]: 'View Promo',
  [PERMISSIONS.CREATE_PROMO]: 'Create Promo',
  [PERMISSIONS.EDIT_PROMO]: 'Edit Promo',
  [PERMISSIONS.DELETE_PROMO]: 'Delete Promo',
  
  // Product
  [PERMISSIONS.VIEW_PRODUCT]: 'View Product',
  [PERMISSIONS.CREATE_PRODUCT]: 'Create Product',
  [PERMISSIONS.EDIT_PRODUCT]: 'Edit Product',
  [PERMISSIONS.DELETE_PRODUCT]: 'Delete Product',
  
  // Member
  [PERMISSIONS.VIEW_MEMBER]: 'View Member',
  [PERMISSIONS.CREATE_MEMBER]: 'Create Member',
  [PERMISSIONS.EDIT_MEMBER]: 'Edit Member',
  [PERMISSIONS.DELETE_MEMBER]: 'Delete Member',
  
  // Report
  [PERMISSIONS.VIEW_REPORT_PRODUCT]: 'View Report Product',
  [PERMISSIONS.VIEW_REPORT_PS]: 'View Report PS',
  
  // Other
  [PERMISSIONS.VIEW_HISTORY]: 'View History',
  [PERMISSIONS.VIEW_SETTINGS]: 'View Settings',
};

// Helper function untuk get permission name
const getPermissionName = (permissionId) => {
  return PERMISSION_NAMES[permissionId] || 'Unknown Permission';
};

// Helper function untuk validate permission ID
const isValidPermission = (permissionId) => {
  return Object.values(PERMISSIONS).includes(permissionId);
};

// Helper function untuk check apakah user punya permission tertentu
const hasPermission = (userRoles, requiredPermission) => {
  if (!Array.isArray(userRoles)) {
    return false;
  }
  return userRoles.includes(requiredPermission);
};

// Helper function untuk check apakah user punya salah satu dari multiple permissions
const hasAnyPermission = (userRoles, requiredPermissions) => {
  if (!Array.isArray(userRoles) || !Array.isArray(requiredPermissions)) {
    return false;
  }
  return requiredPermissions.some(permission => userRoles.includes(permission));
};

// Helper function untuk check apakah user punya semua permissions yang dibutuhkan
const hasAllPermissions = (userRoles, requiredPermissions) => {
  if (!Array.isArray(userRoles) || !Array.isArray(requiredPermissions)) {
    return false;
  }
  return requiredPermissions.every(permission => userRoles.includes(permission));
};

module.exports = {
  PERMISSIONS,
  PERMISSION_GROUPS,
  PERMISSION_NAMES,
  getPermissionName,
  isValidPermission,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
};