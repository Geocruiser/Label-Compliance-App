# Required vs Optional Matrix (Milestone 3)

This matrix is implemented in executable form at:

- `src/lib/policy/requirement-matrix.ts`
- `src/lib/policy/rulesets.ts`

Requirement levels:

- `required`: always required for the class
- `conditional`: required when trigger conditions apply (for example import status or value supplied)
- `optional`: not required by baseline policy

| Field | Distilled Spirits | Wine | Beer | Other |
|---|---|---|---|---|
| brand_name | required | required | required | required |
| class_type_designation | required | required | required | required |
| alcohol_content | required | required | conditional | conditional |
| net_contents | required | required | required | required |
| name_address | conditional | conditional | conditional | conditional |
| country_of_origin | conditional | conditional | conditional | conditional |
| government_warning | required | required | required | required |

Conditional trigger behavior:

- `country_of_origin`: required when `is_import=true`, otherwise optional
- `name_address`: required when `is_import=true`; otherwise validated when provided
- `alcohol_content` for beer/other: required when supplied by application input
- `government_warning`: only required when application indicates warning is required
