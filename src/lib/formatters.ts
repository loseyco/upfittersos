/**
 * Global Formatter Utilities
 * Ensures standardized data presentation and storage across the platform.
 */

/**
 * Formats a raw digit string into a readable phone number: (555) 123-4567
 * Can be used actively in `onChange` handlers for masked inputs.
 */
export function formatPhone(value: string | undefined | null): string {
    if (!value) return '';
    const cleaned = ('' + value).replace(/\D/g, '');
    let formatted = cleaned;
    if (cleaned.length > 0) {
        if (cleaned.length <= 3) formatted = `(${cleaned}`;
        else if (cleaned.length <= 6) formatted = `(${cleaned.slice(0, 3)}) ${cleaned.slice(3)}`;
        else formatted = `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`;
    }
    return formatted;
}

/**
 * Strips all non-digit characters to save the raw number in the database.
 * This guarantees reliable usage in `href="tel:..."` tags.
 * e.g., (555) 123-4567 -> 5551234567
 */
export function unformatPhone(value: string | undefined | null): string {
    if (!value) return '';
    return value.replace(/\D/g, '');
}
