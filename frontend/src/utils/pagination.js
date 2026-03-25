export const DEFAULT_PAGINATION = {
  page: 1,
  limit: 10,
  total: 0,
  totalPages: 0,
  hasNextPage: false,
  hasPrevPage: false
};

export function resolvePaginatedResponse(response, fallback = {}) {
  const fallbackPage = Number(fallback.page) || DEFAULT_PAGINATION.page;
  const fallbackLimit = Number(fallback.limit) || DEFAULT_PAGINATION.limit;

  if (Array.isArray(response)) {
    return {
      rows: response,
      pagination: {
        page: fallbackPage,
        limit: fallbackLimit,
        total: response.length,
        totalPages: response.length ? 1 : 0,
        hasNextPage: false,
        hasPrevPage: fallbackPage > 1
      }
    };
  }

  return {
    rows: Array.isArray(response?.data) ? response.data : [],
    pagination: {
      page: Number(response?.pagination?.page) || fallbackPage,
      limit: Number(response?.pagination?.limit) || fallbackLimit,
      total: Number(response?.pagination?.total) || 0,
      totalPages: Number(response?.pagination?.totalPages) || 0,
      hasNextPage: Boolean(response?.pagination?.hasNextPage),
      hasPrevPage: Boolean(response?.pagination?.hasPrevPage)
    }
  };
}
