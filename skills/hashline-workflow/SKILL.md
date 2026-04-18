# Hashline Edit Workflow

`hashline_edit` is a precise, safe file editor that uses tagged line anchors (LINE#ID) to identify exactly which lines to modify. It supports snapshot semantics and multi-operation batching, making it well-suited for complex edits that touch multiple locations in a single file.

---

## LINE#ID Anchors

Every line in a file read through the tool is tagged with a unique identifier in the format:

```
{line_number}#{two_char_CID}|{content}
```

- `line_number`: 1-based line number
- `two_char_CID`: Two characters drawn from the set `ZPMQVRWSNKTXJBYH`
- `content`: The actual line content (everything after the `|`)

Example read output:
```
10#VK|function hello() {
11#XJ|  console.log("hi");
12#MB|  console.log("bye");
13#QR|}
```

Anchors must be copied exactly from Read output. Never guess or construct anchor IDs.

---

## Workflow

1. **Read the file first** — Always call the Read tool before editing. This gives you current line numbers and CID hashes.
2. **Identify anchors** — Copy the exact `{line_number}#{CID}` tags for the lines you want to modify.
3. **Build the edit call** — Compose an `edits` array targeting those anchors.
4. **Submit one call per file** — Batch all related operations for a file into a single `hashline_edit` call.
5. **Re-read before a second call** — If the same file needs further edits after the first call, re-read it first to get fresh anchors.

---

## Operations

### Replace (single line)

Replace exactly one line at `pos`:

```json
{ "op": "replace", "pos": "11#XJ", "lines": ["  console.log(\"hello\");"] }
```

### Replace (range)

Replace a contiguous range from `pos` to `end` inclusive:

```json
{ "op": "replace", "pos": "11#XJ", "end": "12#MB", "lines": ["  return \"hello world\";"] }
```

The `lines` array contains only the replacement content. Do not include lines that exist before `pos` or after `end` — they survive unchanged and will be duplicated if included.

### Delete

Pass `null` or an empty array as `lines` with a replace:

```json
{ "op": "replace", "pos": "12#MB", "lines": null }
```

### Append (insert after anchor)

Insert new lines after the specified anchor:

```json
{ "op": "append", "pos": "13#QR", "lines": ["", "function added() {", "  return true;", "}"] }
```

### Prepend (insert before anchor)

Insert new lines before the specified anchor:

```json
{ "op": "prepend", "pos": "10#VK", "lines": ["// preamble comment"] }
```

### BOF / EOF Insertion

Append or prepend without providing an anchor to insert at the beginning or end of the file:

```json
{ "op": "append", "lines": ["// end of file comment"] }
```

---

## Snapshot Semantics

All edits in a single call reference the **original file state** at the time of the call. Do not adjust line numbers to account for prior edits in the same batch. The system applies edits bottom-up automatically, so line number conflicts are resolved correctly.

Example: if you replace line 5 and also append after line 10 in the same call, both `pos` values refer to the original line numbers, not the shifted positions after the first edit is applied.

---

## Batching

Submit all related edits for one file in a single `hashline_edit` call. Splitting a logically related change across multiple calls increases the risk of anchor mismatch and makes recovery harder.

One call per file per logical change unit. If a second round of edits is needed, re-read first.

---

## Autocorrect Behaviors

The tool applies several automatic corrections so you do not need to handle them manually:

- **LINE#ID prefixes stripped** — If your `lines` content accidentally includes `{num}#{CID}|` prefixes, they are removed
- **Diff markers stripped** — Leading `+` or `-` diff markers in `lines` are removed
- **Indentation auto-restored** — Indentation is preserved from the original lines
- **BOM and CRLF preserved** — File encoding metadata is maintained transparently
- **Boundary echo lines stripped** — If your replacement accidentally duplicates the line immediately before `pos` or after `end`, the duplicate is removed

---

## Recovery

When a `>>> mismatch` error appears, the error output includes updated LINE#ID tags reflecting the current file state. Copy those tags directly and resubmit. Re-read the file only if the needed tags are missing from the error snippet.

---

## Safety Rules

- Always read before editing — never construct anchor IDs from memory
- Use the smallest operation that achieves the change — prefer single-line replace over range replace when only one line changes
- Never include lines outside the targeted range in `lines`
- Never overlap ranges across operations in the same call
- Anchor to structural boundaries (function signatures, braces, closing brackets) rather than blank lines
