import type { ContactValue } from "@/forms/types";

/**
 * FAKE placeholder user for prefilling the contact card until there is real
 * sign-in. Not a real person; example.com is a reserved domain.
 */
export const mockUser: ContactValue = {
  name: "Test User (mock)",
  email: "test.user@example.com",
  phone: "0000000000",
};
