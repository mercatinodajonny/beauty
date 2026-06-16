-- Profiles
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  type text check (type in ('cliente', 'pro')) not null default 'cliente',
  avatar_url text,
  city text,
  phone text,
  bio text,
  cat_id text,
  handle text unique,
  created_at timestamptz default now()
);

-- Services
create table if not exists services (
  id bigint generated always as identity primary key,
  pro_id uuid references profiles(id) on delete cascade,
  name text not null,
  price numeric not null,
  min int not null,
  active boolean default true,
  created_at timestamptz default now()
);

-- Staff
create table if not exists staff (
  id bigint generated always as identity primary key,
  pro_id uuid references profiles(id) on delete cascade,
  name text not null,
  role text,
  created_at timestamptz default now()
);

-- Business hours
create table if not exists business_hours (
  id bigint generated always as identity primary key,
  pro_id uuid references profiles(id) on delete cascade,
  day int check (day between 0 and 6),
  open boolean default true,
  from_time text default '09:00',
  to_time text default '18:00'
);

-- Appointments
create table if not exists appointments (
  id bigint generated always as identity primary key,
  pro_id uuid references profiles(id) on delete cascade,
  client_id uuid references profiles(id) on delete set null,
  client_name text,
  service_id bigint references services(id) on delete set null,
  service_name text,
  staff_id bigint references staff(id) on delete set null,
  date date not null,
  time text not null,
  price numeric,
  status text check (status in ('confermato','in attesa','cancellato','completato')) default 'confermato',
  note text,
  created_at timestamptz default now()
);

-- Reviews
create table if not exists reviews (
  id bigint generated always as identity primary key,
  pro_id uuid references profiles(id) on delete cascade,
  client_id uuid references profiles(id) on delete cascade,
  stars int check (stars between 1 and 5),
  text text,
  created_at timestamptz default now()
);

-- Follows
create table if not exists follows (
  follower_id uuid references profiles(id) on delete cascade,
  following_id uuid references profiles(id) on delete cascade,
  primary key (follower_id, following_id)
);
