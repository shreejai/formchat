# nagpurhomes.com onboarding form: field reference

Source: the existing 4-step listing form. Keys are the field names the site stores.

## Step 1 · Property Details

| Field | Key | Type | Options | Required |
|---|---|---|---|---|
| I am a (role) | `usertype` | Radio cards | Owner, Builder, Broker (stored lowercase: `owner`, `builder`, `broker`) | Yes |
| I wish to | `listingtype` | Radio cards | `sell`, `rent` | Yes |
| Property type | `ptype` | Radio cards | `residential`, `commercial`, `plot` (label "Plot/Land") | Yes |

## Step 2 · Location & Price

| Field | Key | Type | Options / notes | Required |
|---|---|---|---|---|
| Ad title | `title` | Text | — | Yes |
| Location | `loc` | Text with Google Places autocomplete | — | Yes |
| Bedrooms | `beds` | Dropdown | 1–5 | No |
| Bathrooms | `bath` | Dropdown | 1–4 | No |
| Area type | `areatype` | Radio | `unknown` (default), `area`, `builtup`, `superbuiltup` | No |
| Area | `areatxt` | Text, decimal input: digits and one decimal point only | Hidden when areatype is `unknown`. No unit field. | No |
| Price / Rent | `amount` | Text (free text, commas removed on submit) | — | Yes |

## Step 3 · Description & Images

| Field | Key | Type | Notes | Required |
|---|---|---|---|---|
| Description | `pdesc` | Rich text, stored as HTML | An empty `<p><br></p>` counts as missing | Yes |
| Images | `images` | File upload (multiple, `image/*`, drag-and-drop) | PNG, JPG, GIF up to 10MB | No |

## Step 4 · Contact Info

| Field | Key | Type | Notes | Required |
|---|---|---|---|---|
| Name | `name` | Text | Prefilled from the signed-in account, editable | Yes |
| Email | `email` | Email | Prefilled from the signed-in account | Yes |
| Phone | `phone` | Tel | Prefilled from the signed-in account | Yes |
| Accept terms | `acceptTerms` | Checkbox | UI state only, not part of the submitted data | Yes |

## Conditional rules for the chat version (product decisions)

- `beds`: only asked when `ptype = residential`
- `bath`: asked when `ptype` is `residential` or `commercial` (skipped for `plot`). This differs from the current site, which shows it for residential only.
- `areatxt`: only asked when `areatype ≠ unknown`
- In the chat, `title` moves into section 3, asked right after `pdesc`
- Contact details come from a **mocked** signed-in user in this demo (no real auth, no real user data)
