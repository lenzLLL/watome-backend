// Utility functions for the API

/**
 * Clean phone number by removing the '+' prefix and any non-numeric characters except spaces and dashes
 * @param {string} phone - The phone number to clean
 * @returns {string} - The cleaned phone number
 */
export const cleanPhoneNumber = (phone) => {
  if (!phone) return phone;

  // Remove the '+' prefix if present
  let cleaned = phone.startsWith('+') ? phone.substring(1) : phone;

  // Remove any non-numeric characters except spaces and dashes
  cleaned = cleaned.replace(/[^\d\s\-]/g, '');

  return cleaned.trim();
};