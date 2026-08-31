-- handle_new_user() was granted EXECUTE to public and anon in the
-- baseline migration. Harmless in practice (Postgres refuses to let
-- trigger functions be called directly — "trigger functions can only
-- be called as triggers" — regardless of EXECUTE privilege), but the
-- grant is broader than necessary. Tightening it for hygiene.

revoke execute on function public.handle_new_user() from public, anon;
