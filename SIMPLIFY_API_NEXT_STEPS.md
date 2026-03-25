# API Simplification — Next Steps

## Un-skip `addAssembly.test.ts` Playwright tests

Tests 1 and 2 in `addAssembly.test.ts` are marked `test.skip` because they
tested the old JBrowse plugin `AddAssembly` dialog. They should be rewritten to
test the new `/admin/add-assembly/` page (navigate, fill form, submit, verify
assembly appears in list).

## Organism detail page: inline editing

The organism-detail page (`/ui/organisms/:id`) is currently read-only. Adding
inline PATCH (edit genus/species/commonName/description) and DELETE (with
confirmation) for admins would match what assembly-detail already has.

## Evidence track management

There is currently no web UI for adding BAM/BigWig/VCF evidence tracks to an
assembly. This could be an admin page or a section on the assembly-detail page.
Tracks are stored in the `track` table and linked to assemblies.
