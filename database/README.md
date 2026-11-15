# PostgreSQL metadata migrations

These migrations are limited to account, organisation and authorization
metadata. They must not be extended with shipment rows, tender contents, rate
bands, bid versions, invoice contents or file blobs. Those values belong in the
customer's SharePoint document store or in bounded temporary processing storage.

Apply the numbered `*.up.sql` files with the organization's approved migration
process. The matching `*.down.sql` file is a controlled rollback for an
unpopulated or disposable environment; it must not be used to remove production
records without an approved data-retention decision.

The application does not create or migrate the database during startup.
