-- Enable RLS
alter table profiles enable row level security;
alter table services enable row level security;
alter table staff enable row level security;
alter table business_hours enable row level security;
alter table appointments enable row level security;
alter table reviews enable row level security;
alter table follows enable row level security;

-- Profiles: public read, own write
create policy "profiles_public_read" on profiles for select using (true);
create policy "profiles_own_insert" on profiles for insert with check (auth.uid() = id);
create policy "profiles_own_update" on profiles for update using (auth.uid() = id);

-- Services: public read, pro write
create policy "services_public_read" on services for select using (true);
create policy "services_pro_write" on services for all using (auth.uid() = pro_id);

-- Staff: public read, pro write
create policy "staff_public_read" on staff for select using (true);
create policy "staff_pro_write" on staff for all using (auth.uid() = pro_id);

-- Business hours: public read, pro write
create policy "hours_public_read" on business_hours for select using (true);
create policy "hours_pro_write" on business_hours for all using (auth.uid() = pro_id);

-- Appointments: pro or own client
create policy "appts_pro_read" on appointments for select using (auth.uid() = pro_id or auth.uid() = client_id);
create policy "appts_pro_write" on appointments for all using (auth.uid() = pro_id);
create policy "appts_client_insert" on appointments for insert with check (auth.uid() = client_id);
create policy "appts_client_update" on appointments for update using (auth.uid() = client_id);

-- Reviews: public read, own write
create policy "reviews_public_read" on reviews for select using (true);
create policy "reviews_own_write" on reviews for insert with check (auth.uid() = client_id);

-- Follows: public read, own write
create policy "follows_public_read" on follows for select using (true);
create policy "follows_own_write" on follows for all using (auth.uid() = follower_id);
