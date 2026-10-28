import type { FormSchema, Option } from "./types";

// Field reference: docs/forms/nagpurhomes-fields.md

const numberOptions = (max: number): Option[] =>
  Array.from({ length: max }, (_, i) => ({
    value: String(i + 1),
    label: String(i + 1),
  }));

export const nagpurhomes: FormSchema = {
  id: "nagpurhomes",
  sections: [
    {
      id: "property",
      title: "Property Details",
      questions: [
        {
          key: "usertype",
          label: "I am a",
          kind: "buttons",
          required: true,
          options: [
            { value: "owner", label: "Owner" },
            { value: "builder", label: "Builder" },
            { value: "broker", label: "Broker" },
          ],
        },
        {
          key: "listingtype",
          label: "I wish to",
          kind: "buttons",
          required: true,
          options: [
            { value: "sell", label: "Sell" },
            { value: "rent", label: "Rent" },
          ],
        },
        {
          key: "ptype",
          label: "Property type",
          kind: "buttons",
          required: true,
          options: [
            { value: "residential", label: "Residential" },
            { value: "commercial", label: "Commercial" },
            { value: "plot", label: "Plot/Land" },
          ],
        },
      ],
    },
    {
      id: "location-price",
      title: "Location & Price",
      questions: [
        { key: "loc", label: "Location", kind: "location", required: true },
        {
          key: "beds",
          label: "Bedrooms",
          kind: "buttons",
          required: false,
          options: numberOptions(5),
          showIf: { key: "ptype", in: ["residential"] },
        },
        {
          key: "bath",
          label: "Bathrooms",
          kind: "buttons",
          required: false,
          options: numberOptions(4),
          // Product decision: also asked for commercial (the site shows it for residential only).
          showIf: { key: "ptype", in: ["residential", "commercial"] },
        },
        {
          key: "areatype",
          label: "Area type",
          kind: "buttons",
          required: false,
          defaultValue: "unknown",
          options: [
            { value: "unknown", label: "Don't know" },
            { value: "area", label: "Area" },
            { value: "builtup", label: "Built-up" },
            { value: "superbuiltup", label: "Super built-up" },
          ],
        },
        {
          key: "areatxt",
          label: "Area",
          kind: "number",
          required: false,
          showIf: { key: "areatype", notIn: ["unknown"] },
        },
        { key: "amount", label: "Price / Rent", kind: "price", required: true },
      ],
    },
    {
      id: "description-images",
      title: "Description & Images",
      questions: [
        { key: "pdesc", label: "Description", kind: "longtext", required: true },
        // In the chat, the title is asked right after the description.
        { key: "title", label: "Ad title", kind: "text", required: true },
        { key: "images", label: "Images", kind: "upload", required: false },
      ],
    },
    {
      id: "contact",
      title: "Contact Info",
      questions: [
        { key: "contact", label: "Contact details", kind: "contact", required: true },
        {
          key: "acceptTerms",
          label: "Accept terms",
          kind: "buttons",
          required: true,
          submit: false,
          options: [{ value: "accept", label: "I accept the terms" }],
        },
      ],
    },
  ],
};
