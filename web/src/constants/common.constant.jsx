export const ITEMS_PER_PAGE = 10; // this value must keep same as the one defined in backend!

// Unified page size for the shared list framework (tokens / logs / tasks).
// Backend honors a `page_size` query param (capped server-side); keep this within
// that cap. Distinct from ITEMS_PER_PAGE, which remains the backend default.
export const LIST_PAGE_SIZE = 20;
