# Security Specification: Neuro-Symbolic Logic Engine

## 1. Data Invariants
- A `LogicNode` must have a valid `id` that matches its document ID.
- `type` must be one of: `ENTITY`, `STATE`, `EVENT`, `LOCATION`.
- `relations` must be an array of objects with `verb`, `targetId`, and `weight`.
- `groups` must be an array of strings.
- Only authenticated users can read or write data (for this demo, we'll restrict to signed-in users, though eventually it might be admin-only).

## 2. The "Dirty Dozen" Payloads (Red Team)
1. **Identity Spoofing**: Create a node with ID 'A' but save it at path `/nodes/B`.
2. **Type Poisoning**: Set `type` to "MALICIOUS_CODE".
3. **Ghost Fields**: Add `isAdmin: true` to a node document.
4. **Relational Inconsistency**: Add a relation with a negative `weight`.
5. **Massive Payload**: Send a node with a 1MB `id` string.
6. **Group Injection**: Inject an array of 10,000 strings into `groups`.
7. **Temporal Fraud**: Set `updatedAt` to a future date manually from client.
8. **Orphaned Relation**: Relation `targetId` points to an invalid string pattern.
9. **Unauthorized Write**: Unauthenticated user attempts to create a node.
10. **Schema Break**: Send `relations` as a string instead of an array.
11. **ID Character Poisoning**: Use `../../malicious` as `nodeId`.
12. **State Shortcutting**: Attempt to update immutable ID field.

## 3. Conflict Report
| Vulnerability | Status | Mitigation |
| :--- | :--- | :--- |
| Identity Spoofing | Protected | `nodeId == incoming().id` |
| Resource Poisoning | Protected | `.size() <= 128` on IDs and strings |
| Type Safety | Protected | `isValidLogicNode()` helper |
| Denial of Wallet | Protected | Array size limits (max 100 groups/relations) |
