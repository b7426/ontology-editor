/**
 * Shared API configuration and utilities
 */

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * Get headers for API requests
 * @param includeContentType Whether to include Content-Type header
 * @param adminUser Optional admin username for admin-only endpoints
 */
export const apiHeaders = (includeContentType = true, adminUser?: string): HeadersInit => {
  const headers: HeadersInit = {};
  if (includeContentType) {
    headers['Content-Type'] = 'application/json';
  }
  if (adminUser) {
    headers['X-Admin-User'] = adminUser;
  }
  return headers;
};

/**
 * Make a GET request to the API
 */
export async function apiGet<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${API_URL}${endpoint}`, {
    headers: apiHeaders(),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Make a POST request to the API
 */
export async function apiPost<T>(endpoint: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${endpoint}`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Make a PUT request to the API
 */
export async function apiPut<T>(endpoint: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${endpoint}`, {
    method: 'PUT',
    headers: apiHeaders(),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Make a DELETE request to the API
 */
export async function apiDelete<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${API_URL}${endpoint}`, {
    method: 'DELETE',
    headers: apiHeaders(),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  return response.json();
}
