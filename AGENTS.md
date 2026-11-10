# Export architecture

- Prepare independent deliveries in an isolated staging folder with public TanStack/Vite/Nitro plugins, while preserving the live application's generated integrations; this keeps portability changes from breaking the hosted edition.
- Keep database structure exports distinct from full data and Storage backups, with explicit restore prerequisites and validation status; source packages alone cannot guarantee recovery of existing accounts or attachments.