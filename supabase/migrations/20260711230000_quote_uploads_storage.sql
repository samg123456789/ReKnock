-- Quote intake uploads: private Storage bucket for photos/PDFs of quotes.
-- Files are uploaded straight to Storage from the browser (via a server-minted
-- signed upload URL), so the bytes never travel through a Server Action body
-- (which is capped at 1MB by Next and 4.5MB by Vercel). The extract server
-- action then downloads the object server-side and sends it to Haiku.

insert into storage.buckets (id, name, public)
values ('quotes', 'quotes', false)
on conflict (id) do nothing;

-- RLS backstop on storage.objects. The hot path uses signed upload URLs
-- (mint bypasses RLS) + a service-role download, but per ground rule 7 every
-- table gets company-scoped RLS. Path convention: {company_id}/{uuid}.{ext},
-- so the first folder segment must equal the caller's company_id.

drop policy if exists "quotes company select" on storage.objects;
create policy "quotes company select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'quotes'
    and exists (
      select 1 from public.users u
      where u.auth_user_id = auth.uid()
        and u.company_id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "quotes company insert" on storage.objects;
create policy "quotes company insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'quotes'
    and exists (
      select 1 from public.users u
      where u.auth_user_id = auth.uid()
        and u.company_id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "quotes company delete" on storage.objects;
create policy "quotes company delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'quotes'
    and exists (
      select 1 from public.users u
      where u.auth_user_id = auth.uid()
        and u.company_id::text = (storage.foldername(name))[1]
    )
  );
