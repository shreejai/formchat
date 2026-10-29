import type { ContactValue } from "@/forms/types";

export type ContactErrors = Partial<Record<keyof ContactValue, string>>;

/** Light client-side checks only: all fields filled, an email shape, at least 10 digits. */
export function validateContact(contact: ContactValue): ContactErrors {
  const errors: ContactErrors = {};
  if (!contact.name.trim()) errors.name = "Enter your name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim())) {
    errors.email = "Enter a valid email.";
  }
  if (contact.phone.replace(/\D/g, "").length < 10) {
    errors.phone = "Enter a phone number with at least 10 digits.";
  }
  return errors;
}

export function trimContact(contact: ContactValue): ContactValue {
  return {
    name: contact.name.trim(),
    email: contact.email.trim(),
    phone: contact.phone.trim(),
  };
}
