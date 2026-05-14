-- Cocktail Cabinet Schema
-- Run this in your Supabase SQL editor before first use.

create table if not exists cabinet (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  brand text not null,
  canonical_name text not null,
  spirit_type text not null,
  subcategory text,
  origin text,
  notes text,
  photo_url text
);

create table if not exists recipes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  name text not null,
  ingredients jsonb not null,
  instructions text not null,
  glassware text,
  garnish text,
  spirit_categories text[],
  tags text[],
  notes text,
  source text default 'speakeater'
);

-- Fast array overlap queries on spirit categories
create index if not exists recipes_spirit_idx
  on recipes using gin(spirit_categories);

-- Full-text search on name + categories
create index if not exists recipes_fts_idx
  on recipes using gin(
    to_tsvector('english',
      coalesce(name, '') || ' ' ||
      coalesce(array_to_string(spirit_categories, ' '), '')
    )
  );
