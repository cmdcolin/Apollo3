# Architecture Overview

## Per-Assembly Storage

On origin/main, the server maintains a single JBrowse `config.json` document in
the database that describes every assembly, every evidence track, and every
search adapter for the entire Apollo3 instance. When an admin adds a track or
modifies an assembly, the server rewrites this entire document. All users see
the same configuration — there is no mechanism to show different assemblies or
tracks to different users.

This proposal replaces it with a normalized data model where each assembly,
evidence track (BAM, VCF, BigWig, CRAM), BLAST database, and text search adapter
is stored as its own database record. Tracks and BLAST databases are linked to
assemblies through many-to-many relationships, so a single track can appear on
multiple assemblies. The server now generates `config.json` dynamically for each
request, including only the assemblies and tracks that the requesting user has
permission to see.

This means teams can manage their own evidence tracks independently — uploading,
modifying, or removing tracks on their assemblies without admin intervention and
without affecting other assemblies on the same instance.

## Per-Assembly Permissions

Access control operates at two levels. Global roles (`none`, `readOnly`, `user`,
`admin`) set a baseline for what a user can do across the instance. On top of
this, admins can assign per-assembly roles that override the global default for
specific assemblies. Each assembly also has a visibility setting — public
assemblies are visible as read-only to all authenticated users, while private
assemblies are visible only to users with an explicit permission grant.

When a user accesses an assembly, the system resolves their effective role by
checking (in order): global admin status, then per-assembly permission, then
assembly visibility. This allows scenarios like a postdoc having edit access to
their own genome, read-only access to a collaborator's public assembly, and no
access to another lab's private data — all on the same server.

## Summary of Changes

| Change                 | Current (origin/main)                  | Proposed                                                                    |
| ---------------------- | -------------------------------------- | --------------------------------------------------------------------------- |
| Assembly/track storage | Single monolithic config document      | Individual records with many-to-many relationships                          |
| Access control         | All users see everything               | Per-assembly roles with public/private visibility                           |
| Analysis tools         | External tools, manual result transfer | Generic runner framework: local BLAST, NCBI BLAST, BLAT, miniprot, Tiberius |
| Database               | MongoDB (replica set required)         | SQLite, PostgreSQL, or MongoDB via single codebase                          |
